/**
 * @module router
 * Scratchy v2 — HTTP router (no external dependencies)
 *
 * Provides static file serving, JSON API routes, security headers,
 * and a built-in JSON body parser. Designed for Node.js built-in `http`.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import * as users from '../state/users.js';
import * as sessions from '../state/sessions.js';
import * as agents from '../state/agents.js';
import * as adminConfig from '../state/admin-config.js';
import * as preferences from '../state/preferences.js';
import { adminRoutes } from './routes/admin.js';
import { createChatRoutes } from './routes/chat.js';
import { createWidgetRoutes } from './routes/widgets.js';

/** @type {import('../lib/mcp-registry.js').McpRegistry|null} */
let _mcpRegistry = null;

/** Lazily get or create the MCP registry. */
function getMcpRegistry() {
  if (!_mcpRegistry) {
    // Lazy import to avoid circular deps at module level
    // Will be overridden by opts.mcpRegistry if provided
    return null;
  }
  return _mcpRegistry;
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Root directory for static assets */
const PUBLIC_DIR = resolve(__dirname, '..', 'public');

/** Package version — read once at startup */
const PKG_VERSION = '2.0.0-alpha.1';

/** MIME type map for static file serving */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
};

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
 * Apply security headers to every response.
 * @param {import('node:http').ServerResponse} res
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' ws: wss:",
    "font-src 'self' https://cdn.jsdelivr.net",
    "frame-ancestors 'none'",
  ].join('; '));
}

/**
 * Check CORS — same-origin only (block cross-origin API requests).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true if request was blocked
 */
function handleCors(req, res) {
  const origin = req.headers.origin;
  // If no Origin header, it's same-origin (non-CORS) — allow
  if (!origin) return false;

  const host = req.headers.host;
  // Allow if origin matches the host
  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return false;
  } catch {
    // malformed origin
  }

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Block cross-origin requests to API
  if (req.url?.startsWith('/api')) {
    json(res, 403, { error: 'Cross-origin requests not allowed' });
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Static file serving                                               */
/* ------------------------------------------------------------------ */

/**
 * Serve a static file from PUBLIC_DIR.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 * @returns {Promise<boolean>} true if file was served
 */
async function serveStatic(req, res, pathname) {
  // Strip query string (used for cache-busting ?v=xxx)
  const cleanPath = pathname.split('?')[0];

  // Resolve and ensure we stay inside PUBLIC_DIR (prevent directory traversal)
  let filePath = resolve(PUBLIC_DIR, '.' + cleanPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    json(res, 403, { error: 'Forbidden' });
    return true;
  }

  // If path is /, serve index.html
  if (cleanPath === '/') {
    filePath = join(PUBLIC_DIR, 'index.html');
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;

    const ext = extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await readFile(filePath);

    const headers = { 'Content-Type': mime, 'Content-Length': data.length };

    // Cache versioned assets aggressively; everything else gets short cache
    // Note: ?v= is in the query string (req.url), not in pathname
    const rawUrl = req.url || '';
    if (rawUrl.includes('?v=') || rawUrl.includes('&v=')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (ext === '.html') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      headers['Pragma'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }

    res.writeHead(200, headers);
    res.end(data);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Route matching helper                                             */
/* ------------------------------------------------------------------ */

/**
 * Simple path-param matcher.
 * Pattern: /api/foo/:id/bar → matches /api/foo/abc/bar and returns { id: 'abc' }
 * @param {string} pattern
 * @param {string} pathname
 * @returns {Record<string,string>|null}
 */
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} RouterOpts
 * @property {import('./auth.js')} [auth]      — auth module (login, signup, etc.)
 * @property {Function}            [getDb]     — database getter
 * @property {string}              [version]   — package version override
 * @property {import('../lib/mcp-registry.js').McpRegistry} [mcpRegistry] — MCP registry instance
 */

/**
 * Create the main HTTP request handler.
 *
 * @param {RouterOpts} [opts={}]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createRouter(opts = {}) {
  const auth = opts.auth ?? null;
  const getDb = opts.getDb ?? null;
  const version = opts.version ?? PKG_VERSION;
  const startedAt = Date.now();
  /** @type {Map<string, {count:number, firstAt:number}>} */
  const loginAttempts = new Map();

  // Store MCP registry if provided
  if (opts.mcpRegistry) {
    _mcpRegistry = opts.mcpRegistry;
  }

  /** Track whether state modules have been initialized */
  let stateInitialized = false;

  /** Lazily initialized admin route handlers */
  let _adminHandlers = null;

  /** Lazily initialized chat route handler */
  let _chatHandler = null;

    /** Lazily initialized widget route handler */
    let _widgetHandler = null;

  /**
   * Lazily initialize state modules when we have a db.
   */
  function ensureStateInit() {
    if (stateInitialized || !getDb) return;
    const db = getDb();
    if (!db) return;
    users.init(db);
    sessions.init(db);
    agents.init(db);
    adminConfig.init(db);
    preferences.init(db);
    stateInitialized = true;
  }

  /**
   * Extract bearer token from Authorization header or cookie.
   * @param {import('node:http').IncomingMessage} req
   * @returns {string|null}
   */
  function extractToken(req) {
    // Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // Cookie: token=<token>
    const cookie = req.headers.cookie;
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)token=([^\s;]+)/);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Authenticate a request. Returns user object or null.
   * @param {import('node:http').IncomingMessage} req
   * @returns {Promise<{id:string, username:string, displayName:string, role:string}|null>}
   */
  async function authenticate(req) {
    if (!auth) return null;
    const token = extractToken(req);
    if (!token) return null;
    try {
      return await auth.validateSession(token);
    } catch {
      return null;
    }
  }

  /**
   * Require authentication — sends 401 if not authenticated.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {Promise<{id:string, username:string, displayName:string, role:string}|null>}
   */
  async function requireAuth(req, res) {
    const user = await authenticate(req);
    if (!user) {
      json(res, 401, { error: 'Authentication required' });
      return null;
    }
    return user;
  }

  /**
   * Require admin role — sends 401 or 403 if not authenticated or not admin.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {Promise<{id:string, username:string, displayName:string, role:string}|null>}
   */
  async function requireAdmin(req, res) {
    const user = await requireAuth(req, res);
    if (!user) return null; // 401 already sent
    if (user.role !== 'admin') {
      json(res, 403, { error: 'Admin access required' });
      return null;
    }
    return user;
  }

  /**
   * Get the encryption key from env, or null.
   * @returns {Buffer|null}
   */
  function getEncryptionKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) return null;
    return Buffer.from(hex, 'hex');
  }

  /* -- Main request handler -- */
  return async function handleRequest(req, res) {
    // Security headers on every response
    setSecurityHeaders(res);

    // CORS check
    if (handleCors(req, res)) return;

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // Ensure state modules are initialized
    ensureStateInit();

    try {
      /* ---------- API routes ---------- */

      // Health check (no auth required)
      if (method === 'GET' && pathname === '/api/health') {
        return json(res, 200, {
          status: 'ok',
          version,
          uptime: Math.floor((Date.now() - startedAt) / 1000),
        });
      }

      // Auth: login (with brute-force protection)
      if (method === 'POST' && pathname === '/api/auth/login') {
        if (!auth) return json(res, 501, { error: 'Auth not configured' });
        const clientIp = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
        const attempts = loginAttempts.get(clientIp) || { count: 0, firstAt: Date.now() };
        // Reset window after 15 minutes
        if (Date.now() - attempts.firstAt > 15 * 60 * 1000) {
          attempts.count = 0;
          attempts.firstAt = Date.now();
        }
        attempts.count++;
        loginAttempts.set(clientIp, attempts);
        if (attempts.count > 5) {
          const retryAfter = Math.ceil((attempts.firstAt + 15 * 60 * 1000 - Date.now()) / 1000);
          res.setHeader('Retry-After', String(retryAfter));
          return json(res, 429, { error: 'Too many login attempts. Try again later.' });
        }
        const body = await parseJsonBody(req);
        const { username, password } = body;
        if (!username || !password) {
          return json(res, 400, { error: 'username and password required' });
        }
        try {
          const result = await auth.login(String(username), String(password));
          // Set cookie as well for browser convenience
          res.setHeader('Set-Cookie', `token=${result.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
          loginAttempts.delete(clientIp);
          return json(res, 200, result);
        } catch (err) {
          const status = err.status ?? 401;
          return json(res, status, { error: err.message ?? 'Login failed' });
        }
      }

      // Auth: signup
      if (method === 'POST' && pathname === '/api/auth/signup') {
        if (!auth) return json(res, 501, { error: 'Auth not configured' });
        const body = await parseJsonBody(req);
        const { username, password, displayName } = body;
        if (!username || !password) {
          return json(res, 400, { error: 'username and password required' });
        }
        if (password.length < 8) {
          return json(res, 400, { error: 'Password must be at least 8 characters' });
        }
        try {
          const result = await auth.signup(
            String(username),
            String(password),
            displayName ? String(displayName) : undefined,
          );
          res.setHeader('Set-Cookie', `token=${result.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
          return json(res, 201, result);
        } catch (err) {
          const status = err.status ?? 400;
          return json(res, status, { error: err.message ?? 'Signup failed' });
        }
      }

      // Auth: me (who am I?)
      if (method === 'GET' && pathname === '/api/auth/me') {
        const user = await requireAuth(req, res);
        if (!user) return; // 401 already sent
        return json(res, 200, {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        });
      }

      // Auth: logout
      if (method === 'POST' && pathname === '/api/auth/logout') {
        const token = extractToken(req);
        if (token && auth) {
          try { await auth.logout(token); } catch { /* ignore */ }
        }
        // Clear cookie
        res.setHeader('Set-Cookie', 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { ok: true });
      }

      // Auth: change password
      if (method === 'POST' && pathname === '/api/auth/password') {
        const user = await requireAuth(req, res);
        if (!user) return;
        const body = await parseJsonBody(req);
        const { currentPassword, newPassword } = body;
        if (!currentPassword || !newPassword) {
          return json(res, 400, { error: 'Current and new password required' });
        }
        if (newPassword.length < 8) {
          return json(res, 400, { error: 'New password must be at least 8 characters' });
        }
        try {
          const { getUser, updateUser } = await import('../state/users.js');
          const fullUser = getUser(user.id);
          if (!fullUser) return json(res, 404, { error: 'User not found' });
          const valid = await auth.verifyPassword(currentPassword, fullUser.passwordHash);
          if (!valid) {
            return json(res, 403, { error: 'Current password is incorrect' });
          }
          const hash = await auth.hashPassword(newPassword);
          updateUser(user.id, { passwordHash: hash });
          return json(res, 200, { ok: true, message: 'Password changed' });
        } catch (err) {
          return json(res, 500, { error: 'Failed to change password' });
        }
      }

      // Provider token management (paste-token flow)
      // POST /api/auth/provider-token — save a provider token (Claude setup-token or Gemini OAuth)
      if (method === 'POST' && pathname === '/api/auth/provider-token') {
        const user = await requireAuth(req, res);
        if (!user) return;

        const body = await parseJsonBody(req);
        if (!body || !body.provider || !body.token) {
          return json(res, 400, { error: 'provider and token are required' });
        }

        const provider = String(body.provider);
        const validProviders = ['anthropic', 'google', 'openai'];
        if (!validProviders.includes(provider)) {
          return json(res, 400, { error: `Invalid provider. Supported: ${validProviders.join(', ')}` });
        }

        const encKey = getEncryptionKey();
        if (!encKey) {
          return json(res, 503, { error: 'Encryption not configured (ENCRYPTION_KEY missing)' });
        }

        try {
          const tokenData = {
            type: body.type || 'token', // 'token' for Claude setup-token, 'oauth' for Gemini refresh
            token: String(body.token),
            provider,
            email: body.email ? String(body.email) : undefined,
            savedAt: new Date().toISOString(),
          };

          preferences.setOAuthToken(user.id, provider, tokenData, encKey);
          return json(res, 201, { ok: true, provider, type: tokenData.type });
        } catch (err) {
          console.error('[provider-token] Save failed:', err.message);
          return json(res, 500, { error: 'Failed to save provider token' });
        }
      }

      // GET /api/auth/provider-tokens — list configured providers (no secrets)
      if (method === 'GET' && pathname === '/api/auth/provider-tokens') {
        const user = await requireAuth(req, res);
        if (!user) return;

        const encKey = getEncryptionKey();
        if (!encKey) {
          return json(res, 503, { error: 'Encryption not configured' });
        }

        try {
          const db = getDb ? getDb() : null;
          if (!db) return json(res, 500, { error: 'Database not available' });

          const row = db.prepare('SELECT oauthTokens, apiKeys FROM user_preferences WHERE userId = ?').get(user.id);
          const providers = {};

          if (row) {
            // Check OAuth tokens
            if (row.oauthTokens && row.oauthTokens !== '{}') {
              try {
                const tokens = JSON.parse(preferences.decrypt(row.oauthTokens, encKey));
                for (const [p, data] of Object.entries(tokens)) {
                  providers[p] = { type: data.type || 'oauth', email: data.email, configured: true };
                }
              } catch { /* empty or not yet encrypted */ }
            }
            // Check API keys
            if (row.apiKeys && row.apiKeys !== '{}') {
              try {
                const keys = row.apiKeys.includes(':')
                  ? JSON.parse(preferences.decrypt(row.apiKeys, encKey))
                  : JSON.parse(row.apiKeys);
                for (const p of Object.keys(keys)) {
                  providers[p] = { ...(providers[p] || {}), type: 'apikey', configured: true };
                }
              } catch { /* empty */ }
            }
          }

          return json(res, 200, { providers });
        } catch (err) {
          console.error('[provider-tokens] List failed:', err.message);
          return json(res, 500, { error: 'Failed to list provider tokens' });
        }
      }

      // DELETE /api/auth/provider-token/:provider — remove a provider token
      {
        const delMatch = matchRoute('/api/auth/provider-token/:provider', pathname);
        if (delMatch && method === 'DELETE') {
          const user = await requireAuth(req, res);
          if (!user) return;

          const encKey = getEncryptionKey();
          if (!encKey) return json(res, 503, { error: 'Encryption not configured' });

          try {
            const db = getDb ? getDb() : null;
            if (!db) return json(res, 500, { error: 'Database not available' });

            const row = db.prepare('SELECT oauthTokens FROM user_preferences WHERE userId = ?').get(user.id);
            if (!row || !row.oauthTokens || row.oauthTokens === '{}') {
              return json(res, 404, { error: 'Token not found' });
            }

            const tokens = JSON.parse(preferences.decrypt(row.oauthTokens, encKey));
            if (!(delMatch.provider in tokens)) {
              return json(res, 404, { error: 'Token not found' });
            }

            delete tokens[delMatch.provider];
            const encrypted = Object.keys(tokens).length > 0
              ? preferences.encrypt(JSON.stringify(tokens), encKey)
              : '{}';
            const now = new Date().toISOString();
            db.prepare('UPDATE user_preferences SET oauthTokens = ?, updatedAt = ? WHERE userId = ?')
              .run(encrypted, now, user.id);

            return json(res, 200, { ok: true });
          } catch (err) {
            console.error('[provider-token] Delete failed:', err.message);
            return json(res, 500, { error: 'Failed to delete token' });
          }
        }
      }

      // Chat history API
      if (pathname.startsWith('/api/chat/')) {
        if (!_chatHandler) {
          _chatHandler = createChatRoutes({
            authenticate,
            getDb: () => getDb ? getDb() : null,
          });
        }
        const handled = await _chatHandler(req, res, pathname);
        if (handled) return;
      }

      /* ---------- Widget APIs (Notes, Calendar, Email) ---------- */
      if (pathname.startsWith('/api/notes') || pathname.startsWith('/api/calendar') || pathname.startsWith('/api/emails')) {
        if (!_widgetHandler) {
          _widgetHandler = createWidgetRoutes({
            authenticate,
            getDb: () => getDb ? getDb() : null,
          });
        }
        const handled = await _widgetHandler.handle(req, res, pathname);
        if (handled) return;
      }

      /* ---------- Agent CRUD ---------- */

      // GET /api/agents — list agents
      if (method === 'GET' && pathname === '/api/agents') {
        const user = await requireAuth(req, res);
        if (!user) return;

        let agentList;
        if (user.role === 'admin') {
          agentList = agents.listAgents();
        } else {
          // User sees own agents + enabled builtins
          const own = agents.listByUser(user.id);
          const builtins = agents.getBuiltinAgents().filter(a => a.enabled);
          // Deduplicate (in case user owns a builtin)
          const seen = new Set(own.map(a => a.id));
          agentList = [...own];
          for (const b of builtins) {
            if (!seen.has(b.id)) agentList.push(b);
          }
        }

        return json(res, 200, agentList);
      }

      // POST /api/agents — create agent
      if (method === 'POST' && pathname === '/api/agents') {
        const user = await requireAuth(req, res);
        if (!user) return;

        const body = await parseJsonBody(req);
        if (!body.name) {
          return json(res, 400, { error: 'name is required' });
        }

        try {
          const agent = agents.createAgent(String(body.name), {
            systemPrompt: body.systemPrompt != null ? String(body.systemPrompt) : undefined,
            model: body.model != null ? String(body.model) : undefined,
            temperature: body.temperature != null ? Number(body.temperature) : undefined,
            surfaces: body.surfaces,
            mcpServers: body.mcpServers,
            skills: body.skills,
            avatar: body.avatar != null ? String(body.avatar) : undefined,
            enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
            userId: user.id,
          });
          return json(res, 201, agent);
        } catch (err) {
          return json(res, 400, { error: err.message });
        }
      }

      // Routes with :id param for agents
      {
        // GET /api/agents/:id/conversations
        const convMatch = matchRoute('/api/agents/:id/conversations', pathname);
        if (convMatch) {
          if (method === 'GET') {
            const user = await requireAuth(req, res);
            if (!user) return;

            const agent = agents.getAgent(convMatch.id);
            if (!agent) return json(res, 404, { error: 'Agent not found' });

            // Check access: owner or admin
            if (agent.userId !== user.id && user.role !== 'admin') {
              return json(res, 403, { error: 'Access denied' });
            }

            const db = getDb ? getDb() : null;
            if (!db) return json(res, 200, []);

            const rows = db.prepare(
              'SELECT * FROM agent_conversations WHERE agentId = ? AND userId = ? ORDER BY updatedAt DESC'
            ).all(convMatch.id, user.id);

            // Parse messages JSON
            const convs = rows.map(r => ({
              ...r,
              messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : r.messages,
            }));

            return json(res, 200, convs);
          }

          // POST /api/agents/:id/conversations — create conversation
          if (method === 'POST') {
            const user = await requireAuth(req, res);
            if (!user) return;

            const agent = agents.getAgent(convMatch.id);
            if (!agent) return json(res, 404, { error: 'Agent not found' });

            if (agent.userId !== user.id && user.role !== 'admin') {
              return json(res, 403, { error: 'Access denied' });
            }

            const body = await parseJsonBody(req);
            const db = getDb ? getDb() : null;
            if (!db) return json(res, 500, { error: 'Database not available' });

            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const title = body.title ? String(body.title) : 'New conversation';
            const messages = JSON.stringify(body.messages || []);

            db.prepare(`
              INSERT INTO agent_conversations (id, agentId, userId, title, messages, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, convMatch.id, user.id, title, messages, now, now);

            const row = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get(id);
            const conv = {
              ...row,
              messages: JSON.parse(row.messages),
            };

            return json(res, 201, conv);
          }
        }

        // GET/PUT/DELETE /api/agents/:id
        const agentMatch = matchRoute('/api/agents/:id', pathname);
        if (agentMatch) {
          if (method === 'GET') {
            const user = await requireAuth(req, res);
            if (!user) return;

            const agent = agents.getAgent(agentMatch.id);
            if (!agent) return json(res, 404, { error: 'Agent not found' });

            // Owner or admin can view; also visible if it's an enabled builtin
            if (agent.userId !== user.id && user.role !== 'admin') {
              if (!(agent.isBuiltin && agent.enabled)) {
                return json(res, 403, { error: 'Access denied' });
              }
            }

            return json(res, 200, agent);
          }

          if (method === 'PUT') {
            const user = await requireAuth(req, res);
            if (!user) return;

            const agent = agents.getAgent(agentMatch.id);
            if (!agent) return json(res, 404, { error: 'Agent not found' });

            if (agent.userId !== user.id && user.role !== 'admin') {
              return json(res, 403, { error: 'Access denied' });
            }

            const body = await parseJsonBody(req);
            try {
              const updated = agents.updateAgent(agentMatch.id, body);
              return json(res, 200, updated);
            } catch (err) {
              return json(res, 400, { error: err.message });
            }
          }

          if (method === 'DELETE') {
            const user = await requireAuth(req, res);
            if (!user) return;

            const agent = agents.getAgent(agentMatch.id);
            if (!agent) return json(res, 404, { error: 'Agent not found' });

            if (agent.userId !== user.id && user.role !== 'admin') {
              return json(res, 403, { error: 'Access denied' });
            }

            // Don't allow deleting builtins (unless admin)
            if (agent.isBuiltin && user.role !== 'admin') {
              return json(res, 403, { error: 'Cannot delete builtin agents' });
            }

            agents.deleteAgent(agentMatch.id);
            return json(res, 200, { ok: true });
          }
        }
      }

      /* ---------- MCP Server Management ---------- */

      // POST /api/agents/:id/mcp/start — Start MCP servers for an agent (admin only)
      {
        const mcpStartMatch = matchRoute('/api/agents/:id/mcp/start', pathname);
        if (mcpStartMatch && method === 'POST') {
          const user = await requireAdmin(req, res);
          if (!user) return;

          const registry = getMcpRegistry();
          if (!registry) return json(res, 503, { error: 'MCP registry not available' });

          const agent = agents.getAgent(mcpStartMatch.id);
          if (!agent) return json(res, 404, { error: 'Agent not found' });

          try {
            const result = await registry.activateAgent(agent);
            return json(res, 200, {
              ok: true,
              agentId: result.agentId,
              tools: result.tools.map(t => ({ name: t.name, description: t.description })),
              pids: registry.getPids(mcpStartMatch.id),
            });
          } catch (err) {
            return json(res, 500, { error: err.message });
          }
        }
      }

      // POST /api/agents/:id/mcp/stop — Stop MCP servers for an agent (admin only)
      {
        const mcpStopMatch = matchRoute('/api/agents/:id/mcp/stop', pathname);
        if (mcpStopMatch && method === 'POST') {
          const user = await requireAdmin(req, res);
          if (!user) return;

          const registry = getMcpRegistry();
          if (!registry) return json(res, 503, { error: 'MCP registry not available' });

          const agent = agents.getAgent(mcpStopMatch.id);
          if (!agent) return json(res, 404, { error: 'Agent not found' });

          try {
            await registry.deactivateAgent(mcpStopMatch.id);
            return json(res, 200, { ok: true, agentId: mcpStopMatch.id });
          } catch (err) {
            return json(res, 500, { error: err.message });
          }
        }
      }

      // GET /api/agents/:id/mcp/tools — List discovered MCP tools for an agent
      {
        const mcpToolsMatch = matchRoute('/api/agents/:id/mcp/tools', pathname);
        if (mcpToolsMatch && method === 'GET') {
          const user = await requireAuth(req, res);
          if (!user) return;

          const registry = getMcpRegistry();
          if (!registry) return json(res, 503, { error: 'MCP registry not available' });

          const agent = agents.getAgent(mcpToolsMatch.id);
          if (!agent) return json(res, 404, { error: 'Agent not found' });

          // Check access: owner or admin
          if (agent.userId !== user.id && user.role !== 'admin') {
            return json(res, 403, { error: 'Access denied' });
          }

          const tools = registry.getAvailableTools(mcpToolsMatch.id);
          return json(res, 200, {
            agentId: mcpToolsMatch.id,
            active: registry.isActive(mcpToolsMatch.id),
            tools,
          });
        }
      }

      /* ---------- Internal MCP Proxy (for NullClaw → MCP bridge) ---------- */

      // POST /api/internal/mcp — NullClaw calls this via http_request tool
      // to invoke MCP tools on external servers managed by Scratchy.
      // Localhost-only: NullClaw instances run on the same machine.
      if (method === 'POST' && pathname === '/api/internal/mcp') {
        // Security: only allow localhost calls (from NullClaw instances)
        const remoteAddr = req.socket?.remoteAddress || '';
        const isLocalhost = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
        if (!isLocalhost) {
          return json(res, 403, { error: 'Internal endpoint — localhost only' });
        }

        const registry = getMcpRegistry();
        if (!registry) return json(res, 503, { error: 'MCP registry not available' });

        const body = await parseJsonBody(req);
        const { agentId, tool, args } = body;
        if (!agentId || !tool) {
          return json(res, 400, { error: 'agentId and tool are required' });
        }

        try {
          // Auto-activate if not yet running
          if (!registry.isActive(agentId)) {
            const agent = agents.getAgent(agentId);
            if (!agent) return json(res, 404, { error: `Agent ${agentId} not found` });
            if (!agent.mcpServers || agent.mcpServers.length === 0) {
              return json(res, 400, { error: `Agent ${agentId} has no MCP servers configured` });
            }
            await registry.activateAgent(agent);
          }

          const result = await registry.callTool(agentId, tool, args || {});
          return json(res, 200, { ok: true, result });
        } catch (err) {
          console.error(`[mcp-proxy] Error calling ${tool} for agent ${agentId}:`, err.message);
          return json(res, 500, { error: err.message });
        }
      }

      /* ---------- Admin Routes (comprehensive) ---------- */

      // Wire up admin routes from server/routes/admin.js
      if (pathname.startsWith('/api/admin/')) {
        if (!_adminHandlers) {
          _adminHandlers = adminRoutes({
            getDb: () => getDb ? getDb() : null,
            requireAdmin,
            usageTracker: opts.usageTracker ?? null,
            wsState: opts.wsState ?? null,
          });
        }

        // Match against admin route table
        for (const route of _adminHandlers.routes) {
          if (route.method !== method) continue;

          const params = matchRoute(route.path, pathname);
          if (params !== null) {
            // Call handler — pass params.id as third argument if present
            return route.handler(req, res, params.id);
          }
        }
      }

      // Legacy: GET/PUT /api/admin/users/:id/quotas (kept for backward compat)
      {
        const quotaMatch = matchRoute('/api/admin/users/:id/quotas', pathname);
        if (quotaMatch) {
          if (method === 'GET') {
            const user = await requireAdmin(req, res);
            if (!user) return;
            const quotas = adminConfig.get(`user_quotas_${quotaMatch.id}`);
            return json(res, 200, quotas || {});
          }

          if (method === 'PUT') {
            const user = await requireAdmin(req, res);
            if (!user) return;
            const body = await parseJsonBody(req);
            adminConfig.set(`user_quotas_${quotaMatch.id}`, body);
            return json(res, 200, body);
          }
        }
      }

      /* ---------- User Preferences ---------- */

      // GET /api/users/me/preferences
      if (method === 'GET' && pathname === '/api/users/me/preferences') {
        const user = await requireAuth(req, res);
        if (!user) return;
        const prefs = preferences.get(user.id) || {
          userId: user.id,
          locale: 'en',
          theme: 'system',
          defaultAgentId: null,
          onboardingComplete: false,
        };
        return json(res, 200, prefs);
      }

      // PUT /api/users/me/preferences
      if (method === 'PUT' && pathname === '/api/users/me/preferences') {
        const user = await requireAuth(req, res);
        if (!user) return;
        const body = await parseJsonBody(req);
        const prefs = preferences.set(user.id, body);
        return json(res, 200, prefs);
      }

      // POST /api/users/me/apikeys — store an API key
      if (method === 'POST' && pathname === '/api/users/me/apikeys') {
        const user = await requireAuth(req, res);
        if (!user) return;

        const encKey = getEncryptionKey();
        if (!encKey) {
          return json(res, 503, { error: 'Encryption not configured (ENCRYPTION_KEY missing)' });
        }

        const body = await parseJsonBody(req);
        if (!body.provider || !body.key) {
          return json(res, 400, { error: 'provider and key are required' });
        }

        preferences.setApiKey(user.id, String(body.provider), String(body.key), encKey);
        return json(res, 201, { ok: true, provider: body.provider });
      }

      // DELETE /api/users/me/apikeys/:provider
      {
        const apikeyMatch = matchRoute('/api/users/me/apikeys/:provider', pathname);
        if (apikeyMatch && method === 'DELETE') {
          const user = await requireAuth(req, res);
          if (!user) return;

          const encKey = getEncryptionKey();
          if (!encKey) {
            return json(res, 503, { error: 'Encryption not configured (ENCRYPTION_KEY missing)' });
          }

          // To "delete" a key, we read the encrypted object, remove the provider, re-encrypt
          const db = getDb ? getDb() : null;
          if (!db) return json(res, 500, { error: 'Database not available' });

          const row = db.prepare('SELECT apiKeys FROM user_preferences WHERE userId = ?').get(user.id);
          if (!row || !row.apiKeys || row.apiKeys === '{}') {
            return json(res, 404, { error: 'API key not found' });
          }

          let keys;
          try {
            if (row.apiKeys.includes(':')) {
              keys = JSON.parse(preferences.decrypt(row.apiKeys, encKey));
            } else {
              keys = JSON.parse(row.apiKeys);
            }
          } catch {
            keys = {};
          }

          if (!(apikeyMatch.provider in keys)) {
            return json(res, 404, { error: 'API key not found' });
          }

          delete keys[apikeyMatch.provider];

          const encrypted = Object.keys(keys).length > 0
            ? preferences.encrypt(JSON.stringify(keys), encKey)
            : '{}';
          const now = new Date().toISOString();
          db.prepare('UPDATE user_preferences SET apiKeys = ?, updatedAt = ? WHERE userId = ?')
            .run(encrypted, now, user.id);

          return json(res, 200, { ok: true });
        }
      }

      /* ---------- Setup Wizard ---------- */

      // GET /api/setup/status
      if (method === 'GET' && pathname === '/api/setup/status') {
        const setupComplete = adminConfig.get('setup_complete') || false;
        const currentStep = adminConfig.get('setup_step') || 1;
        return json(res, 200, {
          complete: !!setupComplete,
          currentStep,
          totalSteps: 5,
        });
      }

      // POST /api/setup/complete
      if (method === 'POST' && pathname === '/api/setup/complete') {
        const user = await requireAdmin(req, res);
        if (!user) return;
        adminConfig.set('setup_complete', true);
        adminConfig.set('setup_step', 5);
        return json(res, 200, { ok: true, complete: true });
      }

      /* ---------- i18n ---------- */
      {
        const i18nMatch = matchRoute('/api/i18n/:locale', pathname);
        if (i18nMatch && method === 'GET') {
          const locale = i18nMatch.locale.replace(/[^a-zA-Z0-9_-]/g, ''); // sanitize
          const filePath = resolve(PUBLIC_DIR, 'i18n', `${locale}.json`);

          // Ensure we stay inside the i18n directory
          if (!filePath.startsWith(resolve(PUBLIC_DIR, 'i18n'))) {
            return json(res, 403, { error: 'Forbidden' });
          }

          try {
            const data = await readFile(filePath, 'utf-8');
            return json(res, 200, JSON.parse(data));
          } catch (err) {
            if (err.code === 'ENOENT') {
              return json(res, 404, { error: `Locale '${locale}' not found` });
            }
            throw err;
          }
        }
      }

      /* ---------- File Upload ---------- */
      if (method === 'POST' && pathname === '/api/upload') {
        const user = await authenticate(req);
        if (!user) return json(res, 401, { error: 'Unauthorized' });

        const contentType = req.headers['content-type'] || '';
        if (!contentType.startsWith('multipart/form-data')) {
          return json(res, 400, { error: 'Expected multipart/form-data' });
        }

        // Parse multipart boundary
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) return json(res, 400, { error: 'Missing boundary' });
        const boundary = boundaryMatch[1];

        // Collect body (limit 20MB)
        const MAX_SIZE = 20 * 1024 * 1024;
        const chunks = [];
        let totalSize = 0;
        for await (const chunk of req) {
          totalSize += chunk.length;
          if (totalSize > MAX_SIZE) return json(res, 413, { error: 'File too large (max 20MB)' });
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);

        // Simple multipart parser — find the first file part
        const boundaryBuf = Buffer.from(`--${boundary}`);
        const parts = [];
        let pos = 0;
        while (pos < body.length) {
          const start = body.indexOf(boundaryBuf, pos);
          if (start === -1) break;
          const nextStart = body.indexOf(boundaryBuf, start + boundaryBuf.length + 2);
          if (nextStart === -1) break;
          const partData = body.subarray(start + boundaryBuf.length + 2, nextStart - 2);
          parts.push(partData);
          pos = nextStart;
        }

        if (parts.length === 0) return json(res, 400, { error: 'No file found in upload' });

        // Parse the first part's headers and content
        const part = parts[0];
        const headerEndIdx = part.indexOf('\r\n\r\n');
        if (headerEndIdx === -1) return json(res, 400, { error: 'Malformed multipart part' });
        const headerStr = part.subarray(0, headerEndIdx).toString();
        const fileContent = part.subarray(headerEndIdx + 4);

        // Extract filename and content-type
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);
        const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);
        const filename = filenameMatch ? filenameMatch[1] : 'upload';
        const fileMimeType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

        // Save to uploads directory
        const { mkdir, writeFile } = await import('node:fs/promises');
        const uploadsDir = join(resolve(fileURLToPath(import.meta.url), '../../'), '.scratchy-data', 'uploads', user.id);
        await mkdir(uploadsDir, { recursive: true });
        const fileId = crypto.randomUUID();
        const ext = extname(filename) || '.bin';
        const savedFilename = `${fileId}${ext}`;
        await writeFile(join(uploadsDir, savedFilename), fileContent);

        // Return the file info
        const fileUrl = `/api/uploads/${user.id}/${savedFilename}`;
        return json(res, 200, {
          ok: true,
          file: {
            id: fileId,
            filename,
            mimeType: fileMimeType,
            size: fileContent.length,
            url: fileUrl,
          },
        });
      }

      // Serve uploaded files
      if (method === 'GET' && pathname.startsWith('/api/uploads/')) {
        const parts = pathname.split('/').filter(Boolean); // ['api', 'uploads', userId, filename]
        if (parts.length !== 4) return json(res, 404, { error: 'Not found' });
        const [, , fileUserId, filename] = parts;

        // Validate filename to prevent path traversal
        if (filename.includes('..') || filename.includes('/')) {
          return json(res, 400, { error: 'Invalid filename' });
        }

        const uploadsDir = join(resolve(fileURLToPath(import.meta.url), '../../'), '.scratchy-data', 'uploads', fileUserId);
        const filePath = join(uploadsDir, filename);

        try {
          const { readFile } = await import('node:fs/promises');
          const content = await readFile(filePath);
          const mimeTypes = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf', '.txt': 'text/plain',
            '.json': 'application/json', '.csv': 'text/csv',
          };
          const ext = extname(filename).toLowerCase();
          const mime = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' });
          res.end(content);
          return;
        } catch {
          return json(res, 404, { error: 'File not found' });
        }
      }

      // Unknown API route
      if (pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'Not found' });
      }

      /* ---------- Static files ---------- */
      if (method === 'GET' || method === 'HEAD') {
        const served = await serveStatic(req, res, pathname);
        if (served) return;

        // SPA fallback — serve index.html for non-file routes
        const spaServed = await serveStatic(req, res, '/');
        if (spaServed) return;
      }

      // Catch-all 404
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[router] Request error:', err);
      const status = err.status ?? 500;
      json(res, status, { error: err.message ?? 'Internal server error' });
    }
  };
}
