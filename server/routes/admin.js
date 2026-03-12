/**
 * @module server/routes/admin
 * Admin API routes for Scratchy v2.
 *
 * All routes require admin authentication (req.user.role === 'admin').
 * Provides user management, agent config, session monitoring,
 * dashboard statistics, server config, and deploy staging.
 *
 * Designed to be integrated into the main router via a route handler map
 * or direct function wiring.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as users from '../../state/users.js';
import * as agents from '../../state/agents.js';
import * as adminConfig from '../../state/admin-config.js';
import { PLANS, getPlan } from '../../lib/billing/plans.js';
import * as secureKeys from '../../lib/secure-keys.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Read the full request body as a UTF-8 string, with a size limit.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=1_048_576] 1 MB default
 * @returns {Promise<string>}
 */
function readBody(req, maxBytes = 1_048_576) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (chunk) => {
      len += chunk.length;
      if (len > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Parse JSON body from a request.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/**
 * Get today's date as YYYY-MM-DD in UTC.
 * @returns {string}
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sanitize a user row — strip passwordHash and apiKey.
 * @param {Record<string, unknown>} user
 * @returns {Record<string, unknown>}
 */
function sanitizeUser(user) {
  if (!user) return user;
  const { passwordHash, apiKey, ...safe } = /** @type {any} */ (user);
  // Parse capabilities if stored as JSON string
  if (typeof safe.capabilities === 'string') {
    try { safe.capabilities = JSON.parse(safe.capabilities); } catch { /* keep as-is */ }
  }
  return safe;
}

/* ------------------------------------------------------------------ */
/*  Sensitive config keys (never returned by GET /admin/config)       */
/* ------------------------------------------------------------------ */

/** @type {Set<string>} Keys that should be redacted from config output */
const SENSITIVE_KEYS = new Set([
  'stripe_secret_key',
  'stripe_webhook_secret',
  'encryption_key',
  'jwt_secret',
  'openai_api_key',
  'anthropic_api_key',
  'gemini_api_key',
  'resend_api_key',
  'google_client_secret',
  'api_secret',
]);

/**
 * Redact sensitive values from a config object.
 * @param {Record<string, unknown>} config
 * @returns {Record<string, unknown>}
 */
function sanitizeConfig(config) {
  const result = {};
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_KEYS.has(key) || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
      result[key] = '••••••••';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Route definitions                                                 */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} AdminDeps
 * @property {() => import('better-sqlite3').Database|null} getDb - Database getter
 * @property {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<{id:string,username:string,role:string}|null>} requireAdmin - Admin auth check
 * @property {import('../../lib/billing/usage-tracker.js').UsageTracker} [usageTracker] - Usage tracker
 * @property {{ getConnectedUsers?: () => string[], getClientCount?: () => number }} [wsState] - WebSocket state access
 */

/**
 * Create admin route handlers.
 *
 * Returns an object of route handler functions keyed by "METHOD /path",
 * ready to be wired into the router.
 *
 * @param {AdminDeps} deps
 * @returns {Record<string, (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>>}
 */
export function adminRoutes(deps) {
  const { getDb, requireAdmin, usageTracker, wsState } = deps;

  /* ================================================================ */
  /*  GET /api/admin/users — list all users                           */
  /* ================================================================ */

  /**
   * List all users with plan info, usage summary, and last activity.
   * Supports ?search=<query> for filtering by username/displayName.
   * Supports ?limit=<n>&offset=<n> for pagination.
   */
  async function listUsers(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const db = getDb();
    if (!db) return json(res, 503, { error: 'Database unavailable' });

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const search = url.searchParams.get('search') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    let rows;
    if (search) {
      const pattern = `%${search}%`;
      rows = db.prepare(`
        SELECT id, username, displayName, role, plan, accessTier, capabilities, createdAt, updatedAt
        FROM users
        WHERE username LIKE ? COLLATE NOCASE OR displayName LIKE ? COLLATE NOCASE
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
      `).all(pattern, pattern, limit, offset);
    } else {
      rows = db.prepare(`
        SELECT id, username, displayName, role, plan, accessTier, capabilities, createdAt, updatedAt
        FROM users
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    const today = todayUTC();

    // Enrich each user with usage and session info
    const enriched = rows.map((u) => {
      const user = sanitizeUser(u);

      // Today's usage (if usage_daily table exists)
      let usage = { messages: 0, tokens: 0 };
      try {
        const row = db.prepare(
          'SELECT messages, tokens FROM usage_daily WHERE userId = ? AND date = ?'
        ).get(u.id, today);
        if (row) usage = { messages: row.messages, tokens: row.tokens };
      } catch { /* table may not exist yet */ }

      // Last active session
      let lastActive = u.updatedAt;
      try {
        const sess = db.prepare(
          'SELECT createdAt FROM sessions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1'
        ).get(u.id);
        if (sess) lastActive = sess.createdAt;
      } catch { /* ignore */ }

      // Plan details
      const plan = getPlan(u.plan) || getPlan('free');

      return {
        ...user,
        usage,
        lastActive,
        planDetails: plan ? { name: plan.name, quotas: plan.quotas } : null,
      };
    });

    // Total count for pagination
    let total;
    if (search) {
      const pattern = `%${search}%`;
      total = db.prepare(
        'SELECT COUNT(*) as count FROM users WHERE username LIKE ? COLLATE NOCASE OR displayName LIKE ? COLLATE NOCASE'
      ).get(pattern, pattern).count;
    } else {
      total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    }

    return json(res, 200, { users: enriched, total, limit, offset });
  }

  /* ================================================================ */
  /*  GET /api/admin/users/:id — user detail                          */
  /* ================================================================ */

  /**
   * Get full user profile with usage history and active sessions.
   * @param {string} userId
   */
  async function getUserDetail(req, res, userId) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const db = getDb();
    if (!db) return json(res, 503, { error: 'Database unavailable' });

    const user = users.getUser(userId);
    if (!user) return json(res, 404, { error: 'User not found' });

    const safe = sanitizeUser(user);

    // Active sessions
    let activeSessions = [];
    try {
      const now = new Date().toISOString();
      activeSessions = db.prepare(
        'SELECT token, createdAt, expiresAt FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY createdAt DESC'
      ).all(userId, now).map(s => ({
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        // Don't expose full token — just last 8 chars
        tokenHint: '…' + s.token.slice(-8),
      }));
    } catch { /* ignore */ }

    // Usage history (last 30 days)
    let usageHistory = [];
    try {
      const endDate = todayUTC();
      const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      usageHistory = db.prepare(
        'SELECT date, messages, tokens, modelBreakdown FROM usage_daily WHERE userId = ? AND date >= ? AND date <= ? ORDER BY date ASC'
      ).all(userId, startDate, endDate).map(r => ({
        date: r.date,
        messages: r.messages,
        tokens: r.tokens,
        modelBreakdown: JSON.parse(r.modelBreakdown || '{}'),
      }));
    } catch { /* usage_daily might not exist */ }

    // User agents
    let userAgents = [];
    try {
      userAgents = agents.listAgents({ userId });
    } catch { /* ignore */ }

    // Quotas override
    const quotas = adminConfig.get(`user_quotas_${userId}`);

    return json(res, 200, {
      user: safe,
      activeSessions,
      usageHistory,
      agents: userAgents,
      quotas: quotas || null,
    });
  }

  /* ================================================================ */
  /*  PATCH /api/admin/users/:id — update user                        */
  /* ================================================================ */

  /**
   * Update user fields: plan, role, capabilities, displayName, enabled.
   * @param {string} userId
   */
  async function updateUser(req, res, userId) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const existing = users.getUser(userId);
    if (!existing) return json(res, 404, { error: 'User not found' });

    const body = await parseJsonBody(req);

    // Only allow safe fields
    const patch = {};
    if (body.plan !== undefined) {
      const plan = getPlan(String(body.plan));
      if (!plan) return json(res, 400, { error: `Invalid plan: ${body.plan}` });
      patch.plan = String(body.plan);
    }
    if (body.role !== undefined) {
      if (!['admin', 'user'].includes(body.role)) {
        return json(res, 400, { error: 'Role must be "admin" or "user"' });
      }
      patch.role = body.role;
    }
    if (body.capabilities !== undefined) {
      patch.capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
    }
    if (body.displayName !== undefined) {
      patch.displayName = body.displayName ? String(body.displayName) : null;
    }
    if (body.accessTier !== undefined) {
      const validTiers = ['none', 'trial', 'byok', 'managed', 'admin'];
      if (!validTiers.includes(body.accessTier)) {
        return json(res, 400, { error: `Invalid accessTier: ${body.accessTier}. Must be one of: ${validTiers.join(', ')}` });
      }
      patch.accessTier = body.accessTier;
    }
    if (body.enabled !== undefined) {
      // "enabled" is not a native field — store in admin_config
      adminConfig.set(`user_enabled_${userId}`, !!body.enabled);
    }

    const updated = users.updateUser(userId, patch);
    return json(res, 200, sanitizeUser(updated));
  }

  /* ================================================================ */
  /*  DELETE /api/admin/users/:id — soft-delete user                   */
  /* ================================================================ */

  /**
   * Soft-delete a user by marking them disabled and clearing sessions.
   * Does NOT hard-delete from DB to preserve audit trail.
   * @param {string} userId
   */
  async function deleteUser(req, res, userId) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const existing = users.getUser(userId);
    if (!existing) return json(res, 404, { error: 'User not found' });

    // Don't allow self-deletion
    if (userId === admin.id) {
      return json(res, 400, { error: 'Cannot delete your own account' });
    }

    const db = getDb();

    // Mark as disabled
    adminConfig.set(`user_enabled_${userId}`, false);
    adminConfig.set(`user_deleted_at_${userId}`, new Date().toISOString());

    // Clear all sessions for this user
    if (db) {
      try {
        db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
      } catch { /* ignore */ }
    }

    // Update username to indicate soft-deletion
    users.updateUser(userId, {
      displayName: `[deleted] ${existing.displayName || existing.username}`,
    });

    return json(res, 200, { ok: true, message: 'User soft-deleted' });
  }

  /* ================================================================ */
  /*  GET /api/admin/agents — list all agents                         */
  /* ================================================================ */

  /** List all configured agents with status info. */
  async function listAgents(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const allAgents = agents.listAgents({ includeHidden: true });

    const enriched = allAgents.map((a) => ({
      ...a,
      enabled: !!a.enabled,
      isBuiltin: !!a.isBuiltin,
    }));

    return json(res, 200, enriched);
  }

  /* ================================================================ */
  /*  PATCH /api/admin/agents/:id — update agent config               */
  /* ================================================================ */

  /**
   * Update agent configuration (model, system prompt, tools, etc.).
   * @param {string} agentId
   */
  async function updateAgent(req, res, agentId) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const agent = agents.getAgent(agentId);
    if (!agent) return json(res, 404, { error: 'Agent not found' });

    const body = await parseJsonBody(req);

    // Build patch from allowed fields
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name);
    if (body.model !== undefined) patch.model = String(body.model);
    if (body.systemPrompt !== undefined) patch.systemPrompt = String(body.systemPrompt);
    if (body.temperature !== undefined) patch.temperature = Number(body.temperature);
    if (body.enabled !== undefined) patch.enabled = !!body.enabled;
    if (body.surfaces !== undefined) patch.surfaces = body.surfaces;
    if (body.mcpServers !== undefined) patch.mcpServers = body.mcpServers;
    if (body.skills !== undefined) patch.skills = body.skills;
    if (body.avatar !== undefined) patch.avatar = body.avatar;

    try {
      const updated = agents.updateAgent(agentId, patch);
      return json(res, 200, updated);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  /* ================================================================ */
  /*  GET /api/admin/sessions — active sessions                       */
  /* ================================================================ */

  /** List active sessions with user info and connection status. */
  async function listSessions(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const db = getDb();
    if (!db) return json(res, 503, { error: 'Database unavailable' });

    const now = new Date().toISOString();

    const rows = db.prepare(`
      SELECT s.token, s.userId, s.createdAt, s.expiresAt,
             u.username, u.displayName, u.role, u.plan
      FROM sessions s
      JOIN users u ON s.userId = u.id
      WHERE s.expiresAt > ?
      ORDER BY s.createdAt DESC
      LIMIT 200
    `).all(now);

    // Get connected WebSocket users
    const connectedUsers = new Set(wsState?.getConnectedUsers?.() || []);

    const sessions = rows.map((r) => ({
      tokenHint: '…' + r.token.slice(-8),
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      role: r.role,
      plan: r.plan,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      wsConnected: connectedUsers.has(r.userId),
    }));

    return json(res, 200, {
      sessions,
      total: sessions.length,
      wsConnections: wsState?.getClientCount?.() ?? 0,
    });
  }

  /* ================================================================ */
  /*  GET /api/admin/stats — dashboard statistics                     */
  /* ================================================================ */

  /** Aggregate dashboard stats: users, activity, tokens, revenue. */
  async function getStats(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const db = getDb();
    if (!db) return json(res, 503, { error: 'Database unavailable' });

    const today = todayUTC();
    const now = new Date().toISOString();

    // Total users
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    // Users by plan
    const planBreakdown = db.prepare(
      'SELECT plan, COUNT(*) as count FROM users GROUP BY plan ORDER BY count DESC'
    ).all();

    // Active today (users with usage today)
    let activeToday = 0;
    try {
      const row = db.prepare(
        'SELECT COUNT(DISTINCT userId) as count FROM usage_daily WHERE date = ?'
      ).get(today);
      if (row) activeToday = row.count;
    } catch { /* usage_daily may not exist */ }

    // Messages today
    let messagesToday = 0;
    let tokensToday = 0;
    try {
      const row = db.prepare(
        'SELECT COALESCE(SUM(messages), 0) as msgs, COALESCE(SUM(tokens), 0) as toks FROM usage_daily WHERE date = ?'
      ).get(today);
      if (row) {
        messagesToday = row.msgs;
        tokensToday = row.toks;
      }
    } catch { /* ignore */ }

    // Messages last 7 days (for sparkline)
    let weeklyUsage = [];
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      weeklyUsage = db.prepare(
        'SELECT date, COALESCE(SUM(messages), 0) as messages, COALESCE(SUM(tokens), 0) as tokens FROM usage_daily WHERE date >= ? GROUP BY date ORDER BY date ASC'
      ).all(weekAgo);
    } catch { /* ignore */ }

    // Active sessions
    const activeSessions = db.prepare(
      'SELECT COUNT(*) as count FROM sessions WHERE expiresAt > ?'
    ).get(now).count;

    // WebSocket connections
    const wsConnections = wsState?.getClientCount?.() ?? 0;

    // Total agents
    const totalAgents = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
    const enabledAgents = db.prepare('SELECT COUNT(*) as count FROM agents WHERE enabled = 1').get().count;

    // Revenue estimate (sum of plan prices for paid users)
    let estimatedMRR = 0;
    for (const { plan: planId, count } of planBreakdown) {
      const plan = getPlan(planId);
      if (plan && plan.price > 0) {
        estimatedMRR += plan.price * count;
      }
    }

    return json(res, 200, {
      totalUsers,
      activeToday,
      messagesToday,
      tokensToday,
      activeSessions,
      wsConnections,
      totalAgents,
      enabledAgents,
      planBreakdown,
      weeklyUsage,
      estimatedMRR,
      serverUptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
    });
  }

  /* ================================================================ */
  /*  GET /api/admin/config — server config (sanitized)               */
  /* ================================================================ */

  /** Return all admin config key-values with secrets redacted. */
  async function getConfig(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const config = adminConfig.getAll();
    return json(res, 200, sanitizeConfig(config));
  }

  /* ================================================================ */
  /*  PATCH /api/admin/config — update config                          */
  /* ================================================================ */

  /** Update one or more config key-value pairs. */
  async function updateConfig(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = await parseJsonBody(req);

    if (typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { error: 'Body must be a JSON object of key-value pairs' });
    }

    for (const [key, value] of Object.entries(body)) {
      adminConfig.set(String(key), value);
    }

    const config = adminConfig.getAll();
    return json(res, 200, sanitizeConfig(config));
  }

  /* ================================================================ */
  /*  POST /api/admin/deploy/stage — stage a version                  */
  /* ================================================================ */

  /** Write a version tag to .version-staged for deploy tooling. */
  async function deployStage(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = await parseJsonBody(req);
    const version = body.version ? String(body.version).trim() : '';

    if (!version) {
      return json(res, 400, { error: 'version is required' });
    }

    // Validate semver-ish format
    if (!/^[\w.+\-]+$/.test(version)) {
      return json(res, 400, { error: 'Invalid version format' });
    }

    const stagePath = resolve(PROJECT_ROOT, '.version-staged');

    try {
      await writeFile(stagePath, version + '\n', 'utf-8');
      return json(res, 200, { ok: true, staged: version });
    } catch (err) {
      return json(res, 500, { error: 'Failed to write staged version', detail: err.message });
    }
  }

  /* ================================================================ */
  /*  GET /api/admin/deploy/status — deploy status                    */
  /* ================================================================ */

  /** Read current version and staged version. */
  async function deployStatus(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Current version from package or hardcoded
    let current = '2.0.0-alpha.1';
    try {
      const pkgPath = resolve(PROJECT_ROOT, 'package.json');
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      if (pkg.version) current = pkg.version;
    } catch { /* ignore */ }

    // Staged version
    let staged = null;
    try {
      const stagePath = resolve(PROJECT_ROOT, '.version-staged');
      staged = (await readFile(stagePath, 'utf-8')).trim() || null;
    } catch { /* no staged version */ }

    return json(res, 200, {
      current,
      staged,
      needsDeploy: staged !== null && staged !== current,
      uptime: Math.floor(process.uptime()),
    });
  }

  /* ================================================================ */
  /*  POST /api/admin/deploy/push — deploy (restart service)          */
  /* ================================================================ */

  /** Restart the scratchy-v2 systemd service to deploy staged version. */
  async function deployPush(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      // Read staged version for logging
      let staged = null;
      try {
        const stagePath = resolve(PROJECT_ROOT, '.version-staged');
        staged = (await readFile(stagePath, 'utf-8')).trim() || null;
      } catch { /* ignore */ }

      // Respond before restarting (the service will kill this process)
      json(res, 200, {
        ok: true,
        message: `Deploying${staged ? ` version ${staged}` : ''}. Service restarting...`,
        staged,
      });

      // Give the response time to flush, then restart
      setTimeout(async () => {
        try {
          await execFileAsync('systemctl', ['--user', 'restart', 'scratchy-v2']);
        } catch (err) {
          console.error('[admin] Deploy push failed:', err.message);
        }
      }, 500);
    } catch (err) {
      return json(res, 500, { error: 'Deploy failed', detail: err.message });
    }
  }

  /* ================================================================ */
  /*  GET /api/admin/keys — list all API keys (masked)                */
  /* ================================================================ */

  async function listApiKeys(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const keys = secureKeys.listKeys();
      return json(res, 200, { keys });
    } catch (err) {
      return json(res, 500, { error: 'Failed to list keys', detail: err.message });
    }
  }

  /* ================================================================ */
  /*  PUT /api/admin/keys/:name — store/update an API key             */
  /* ================================================================ */

  async function setApiKey(req, res, keyName) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Validate key name against registry
    const registry = secureKeys.getRegistry();
    if (!registry[keyName]) {
      return json(res, 400, { error: `Unknown key: ${keyName}. Valid keys: ${Object.keys(registry).join(', ')}` });
    }

    const body = await parseJsonBody(req);
    const value = body.value;

    if (!value || typeof value !== 'string' || value.trim().length < 4) {
      return json(res, 400, { error: 'Key value must be a non-empty string (min 4 chars)' });
    }

    try {
      secureKeys.setKey(keyName, value.trim());
      const keys = secureKeys.listKeys();
      const updated = keys.find(k => k.name === keyName);
      return json(res, 200, {
        ok: true,
        key: updated,
        message: `${registry[keyName].label} stored securely`,
      });
    } catch (err) {
      return json(res, 500, { error: 'Failed to store key', detail: err.message });
    }
  }

  /* ================================================================ */
  /*  DELETE /api/admin/keys/:name — remove an API key from DB        */
  /* ================================================================ */

  async function deleteApiKey(req, res, keyName) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const registry = secureKeys.getRegistry();
    if (!registry[keyName]) {
      return json(res, 400, { error: `Unknown key: ${keyName}` });
    }

    try {
      const deleted = secureKeys.deleteKey(keyName);
      if (!deleted) {
        return json(res, 404, { error: `Key ${keyName} not found in encrypted store (may still exist in .env)` });
      }
      return json(res, 200, {
        ok: true,
        message: `${registry[keyName].label} removed from encrypted store`,
        envFallback: !!process.env[registry[keyName].envVar],
      });
    } catch (err) {
      return json(res, 500, { error: 'Failed to delete key', detail: err.message });
    }
  }

  /* ================================================================ */
  /*  POST /api/admin/keys/migrate — migrate all .env keys to DB      */
  /* ================================================================ */

  async function migrateKeys(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const result = secureKeys.migrateAll();
      return json(res, 200, {
        ok: true,
        ...result,
        message: `Migrated ${result.migrated.length} keys, skipped ${result.skipped.length}, missing ${result.missing.length}`,
      });
    } catch (err) {
      return json(res, 500, { error: 'Migration failed', detail: err.message });
    }
  }

  /* ================================================================ */
  /*  GET /api/admin/embedding/quota — get embedding quota config     */
  /* ================================================================ */

  async function getEmbeddingQuota(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const config = {
      dailyLimitFree: adminConfig.get('embedding_daily_limit_free') ?? 200,
      dailyLimitPro: adminConfig.get('embedding_daily_limit_pro') ?? 1000,
      dailyLimitByok: adminConfig.get('embedding_daily_limit_byok') ?? -1, // -1 = unlimited
      model: 'gemini-embedding-001',
      dimensions: adminConfig.get('embedding_dimensions') ?? 768,
    };

    return json(res, 200, config);
  }

  /* ================================================================ */
  /*  PATCH /api/admin/embedding/quota — update embedding quota       */
  /* ================================================================ */

  async function updateEmbeddingQuota(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const body = await parseJsonBody(req);
    const allowed = ['embedding_daily_limit_free', 'embedding_daily_limit_pro', 'embedding_daily_limit_byok', 'embedding_dimensions'];

    for (const key of allowed) {
      if (key in body) {
        const val = parseInt(body[key], 10);
        if (isNaN(val)) return json(res, 400, { error: `${key} must be a number` });
        adminConfig.set(key, val);
      }
    }

    return json(res, 200, {
      ok: true,
      dailyLimitFree: adminConfig.get('embedding_daily_limit_free') ?? 200,
      dailyLimitPro: adminConfig.get('embedding_daily_limit_pro') ?? 1000,
      dailyLimitByok: adminConfig.get('embedding_daily_limit_byok') ?? -1,
      dimensions: adminConfig.get('embedding_dimensions') ?? 768,
    });
  }

  /* ================================================================ */
  /*  Route table                                                     */
  /* ================================================================ */

  return {
    listUsers,
    getUserDetail,
    updateUser,
    deleteUser,
    listAgents,
    updateAgent,
    listSessions,
    getStats,
    getConfig,
    updateConfig,
    listApiKeys,
    setApiKey,
    deleteApiKey,
    migrateKeys,
    getEmbeddingQuota,
    updateEmbeddingQuota,
    deployStage,
    deployStatus,
    deployPush,

    /**
     * Route table for integration into a router.
     * Each entry has method, path, and handler.
     * Handlers with :id params receive userId/agentId as third argument.
     */
    routes: [
      { method: 'GET',    path: '/api/admin/users',           handler: listUsers },
      { method: 'GET',    path: '/api/admin/users/:id',       handler: getUserDetail },
      { method: 'PATCH',  path: '/api/admin/users/:id',       handler: updateUser },
      { method: 'DELETE', path: '/api/admin/users/:id',       handler: deleteUser },
      { method: 'GET',    path: '/api/admin/agents',          handler: listAgents },
      { method: 'PATCH',  path: '/api/admin/agents/:id',      handler: updateAgent },
      { method: 'GET',    path: '/api/admin/sessions',        handler: listSessions },
      { method: 'GET',    path: '/api/admin/stats',           handler: getStats },
      { method: 'GET',    path: '/api/admin/config',          handler: getConfig },
      { method: 'PATCH',  path: '/api/admin/config',          handler: updateConfig },
      { method: 'GET',    path: '/api/admin/keys',            handler: listApiKeys },
      { method: 'PUT',    path: '/api/admin/keys/:id',        handler: setApiKey },
      { method: 'DELETE', path: '/api/admin/keys/:id',        handler: deleteApiKey },
      { method: 'POST',   path: '/api/admin/keys/migrate',    handler: migrateKeys },
      { method: 'GET',    path: '/api/admin/embedding/quota', handler: getEmbeddingQuota },
      { method: 'PATCH',  path: '/api/admin/embedding/quota', handler: updateEmbeddingQuota },
      { method: 'POST',   path: '/api/admin/deploy/stage',    handler: deployStage },
      { method: 'GET',    path: '/api/admin/deploy/status',   handler: deployStatus },
      { method: 'POST',   path: '/api/admin/deploy/push',     handler: deployPush },
    ],
  };
}
