/**
 * @module server/routes/teams
 * Team management API routes.
 *
 * Endpoints:
 *   GET    /api/teams              — list user's teams
 *   POST   /api/teams              — create a team
 *   GET    /api/teams/:id          — get team details
 *   PUT    /api/teams/:id          — update team
 *   DELETE /api/teams/:id          — delete team (owner only)
 *
 *   POST   /api/teams/:id/members          — add member
 *   PUT    /api/teams/:id/members/:userId  — update member role
 *   DELETE /api/teams/:id/members/:userId  — remove member
 *
 *   POST   /api/teams/:id/agents          — assign agent
 *   PUT    /api/teams/:id/agents/:agentId — update agent role
 *   DELETE /api/teams/:id/agents/:agentId — remove agent
 *
 *   GET    /api/teams/:id/memory          — list shared memory
 *   POST   /api/teams/:id/memory          — add memory entry
 *   PUT    /api/teams/:id/memory/:memId   — update memory entry
 *   DELETE /api/teams/:id/memory/:memId   — delete memory entry
 */

import * as teams from '../../state/teams.js';
import { TEAM_PACKAGES } from '../../lib/team-router.js';
import * as agents from '../../state/agents.js';

/* ── Input-validation helpers ── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s) { return typeof s === 'string' && UUID_RE.test(s); }

const MAX_NAME  = 200;
const MAX_DESC  = 2000;
const MAX_KEY   = 200;
const MAX_CONTENT = 50000;
const MAX_SHORT = 100;        // icon, color, role …
const VALID_ROLES = ['owner', 'admin', 'member', 'viewer'];
const VALID_AGENT_ROLES = ['owner', 'admin', 'worker', 'viewer'];

/**
 * Create the team routes handler.
 * @param {Object} opts
 * @param {Function} opts.authenticate — (req) => user | null
 * @param {Function} opts.matchRoute — (pattern, pathname) => params | null
 * @returns {Object} Route handler with { handle(req, res, pathname, method) }
 */
export function createTeamRoutes({ authenticate, matchRoute }) {

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
   * Read and parse JSON body from request.
   * @param {import('node:http').IncomingMessage} req
   * @returns {Promise<Object>}
   */
  function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let len = 0;
      req.on('data', (chunk) => {
        len += chunk.length;
        if (len > 1_048_576) { req.destroy(); reject(new Error('Payload too large')); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  /**
   * Require authentication.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {Promise<Object|null>}
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
   * Require team membership. Returns { user, membership } or null.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} teamId
   * @returns {Promise<{ user: Object, membership: { isMember: boolean, role: string } }|null>}
   */
  async function requireMember(req, res, teamId) {
    const user = await requireAuth(req, res);
    if (!user) return null;

    // Admin bypasses membership check
    if (user.role === 'admin') {
      return { user, membership: { isMember: true, role: 'admin' } };
    }

    const membership = teams.checkMembership(teamId, user.id);
    if (!membership.isMember) {
      json(res, 403, { error: 'You are not a member of this team' });
      return null;
    }

    return { user, membership };
  }

  /**
   * Require team management rights (owner or admin member).
   */
  async function requireManager(req, res, teamId) {
    const ctx = await requireMember(req, res, teamId);
    if (!ctx) return null;

    if (ctx.user.role !== 'admin' && !teams.canManage(teamId, ctx.user.id)) {
      json(res, 403, { error: 'Team admin or owner required' });
      return null;
    }

    return ctx;
  }

  /* ---------------------------------------------------------------- */
  /*  Route handler                                                   */
  /* ---------------------------------------------------------------- */

  return {
    /**
     * Handle a team API request. Returns true if handled, false otherwise.
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     * @param {string} pathname
     * @returns {Promise<boolean>}
     */
    async handle(req, res, pathname) {
      const method = req.method ?? 'GET';

      // ── GET /api/teams — list user's teams ──
      if (method === 'GET' && pathname === '/api/teams') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const list = user.role === 'admin'
          ? teams.listAllTeams()
          : teams.listUserTeams(user.id);

        json(res, 200, list);
        return true;
      }

      // ── POST /api/teams — create team ──
      if (method === 'POST' && pathname === '/api/teams') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const body = await parseJsonBody(req);
        if (typeof body.name !== 'string' || !body.name.trim()) {
          json(res, 400, { ok: false, error: 'name is required and must be a non-empty string' });
          return true;
        }
        const name = body.name.trim().slice(0, MAX_NAME);
        const description = body.description != null ? String(body.description).trim().slice(0, MAX_DESC) : undefined;
        const icon = body.icon != null ? String(body.icon).trim().slice(0, MAX_SHORT) : undefined;
        const color = body.color != null ? String(body.color).trim().slice(0, MAX_SHORT) : undefined;

        try {
          const team = teams.createTeam(name, user.id, { description, icon, color });
          json(res, 201, team);
        } catch (err) {
          json(res, 400, { ok: false, error: 'Failed to create team' });
        }
        return true;
      }

      // ── Pre-built packages (must be before /:id to avoid conflict) ──
      // GET /api/teams/packages
      if (method === 'GET' && pathname === '/api/teams/packages') {
        json(res, 200, TEAM_PACKAGES);
        return true;
      }

      // POST /api/teams/packages/:key
      {
        const m = matchRoute('/api/teams/packages/:key', pathname);
        if (m && method === 'POST') {
          const user = await requireAuth(req, res);
          if (!user) return true;

          if (typeof m.key !== 'string' || !m.key.trim() || m.key.length > MAX_SHORT) {
            json(res, 400, { ok: false, error: 'Invalid package key' });
            return true;
          }
          const pkg = TEAM_PACKAGES[m.key];
          if (!pkg) {
            json(res, 404, { ok: false, error: 'Package not found' });
            return true;
          }

          try {
            const team = teams.createTeam(pkg.name, user.id, {
              description: pkg.description,
              icon: pkg.icon,
              color: pkg.color,
            });

            const builtins = agents.getBuiltinAgents();
            for (const agentDef of pkg.agents) {
              const builtin = builtins.find(a =>
                a.name.toLowerCase() === agentDef.builtinId.toLowerCase() ||
                a.name.toLowerCase() === agentDef.name.toLowerCase()
              );
              if (builtin) {
                teams.addAgent(team.id, builtin.id, {
                  role: agentDef.role,
                  addedBy: user.id,
                });
              }
            }

            const fullTeam = teams.getTeam(team.id);
            json(res, 201, fullTeam);
          } catch (err) {
            json(res, 400, { ok: false, error: 'Failed to create team from package' });
          }
          return true;
        }
      }

      // ── Team memory routes (must be before /:id to avoid conflict) ──
      // PUT /api/teams/:id/memory/:memId
      {
        const m = matchRoute('/api/teams/:id/memory/:memId', pathname);
        if (m) {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }
          if (!isUUID(m.memId)) { json(res, 400, { ok: false, error: 'Invalid memory entry ID format' }); return true; }

          if (method === 'PUT') {
            const ctx = await requireMember(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            // Sanitize updatable fields
            const sanitized = {};
            if (body.key != null) {
              if (typeof body.key !== 'string' || !body.key.trim()) { json(res, 400, { ok: false, error: 'key must be a non-empty string' }); return true; }
              sanitized.key = body.key.trim().slice(0, MAX_KEY);
            }
            if (body.content != null) {
              if (typeof body.content !== 'string') { json(res, 400, { ok: false, error: 'content must be a string' }); return true; }
              sanitized.content = body.content.trim().slice(0, MAX_CONTENT);
            }

            try {
              const updated = teams.updateMemory(m.memId, sanitized);
              if (!updated) { json(res, 404, { ok: false, error: 'Memory entry not found' }); return true; }
              json(res, 200, updated);
            } catch (err) {
              json(res, 400, { ok: false, error: 'Failed to update memory entry' });
            }
            return true;
          }

          if (method === 'DELETE') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const deleted = teams.deleteMemory(m.memId);
            json(res, deleted ? 200 : 404, deleted ? { ok: true } : { ok: false, error: 'Not found' });
            return true;
          }

          return false;
        }
      }

      // GET/POST /api/teams/:id/memory
      {
        const m = matchRoute('/api/teams/:id/memory', pathname);
        if (m) {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }

          if (method === 'GET') {
            const ctx = await requireMember(req, res, m.id);
            if (!ctx) return true;

            const entries = teams.getMemory(m.id);
            json(res, 200, entries);
            return true;
          }

          if (method === 'POST') {
            const ctx = await requireMember(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            if (typeof body.key !== 'string' || !body.key.trim()) {
              json(res, 400, { ok: false, error: 'key is required and must be a non-empty string' });
              return true;
            }
            if (typeof body.content !== 'string' || !body.content.trim()) {
              json(res, 400, { ok: false, error: 'content is required and must be a non-empty string' });
              return true;
            }
            const key = body.key.trim().slice(0, MAX_KEY);
            const content = body.content.trim().slice(0, MAX_CONTENT);

            try {
              const entry = teams.addMemory(m.id, key, content, {
                createdBy: ctx.user.id,
              });
              json(res, 201, entry);
            } catch (err) {
              json(res, 400, { ok: false, error: 'Failed to add memory entry' });
            }
            return true;
          }

          return false;
        }
      }

      // ── Team member routes ──
      // PUT/DELETE /api/teams/:id/members/:userId
      {
        const m = matchRoute('/api/teams/:id/members/:userId', pathname);
        if (m) {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }
          if (!isUUID(m.userId)) { json(res, 400, { ok: false, error: 'Invalid user ID format' }); return true; }

          if (method === 'PUT') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            if (typeof body.role !== 'string' || !body.role.trim()) {
              json(res, 400, { ok: false, error: 'role is required and must be a non-empty string' });
              return true;
            }
            const role = body.role.trim().toLowerCase();
            if (!VALID_ROLES.includes(role)) {
              json(res, 400, { ok: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` });
              return true;
            }

            try {
              const updated = teams.updateMemberRole(m.id, m.userId, role);
              json(res, updated ? 200 : 404, updated ? { ok: true } : { ok: false, error: 'Member not found' });
            } catch (err) {
              json(res, 400, { ok: false, error: 'Failed to update member role' });
            }
            return true;
          }

          if (method === 'DELETE') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            // Can't remove yourself if you're the owner
            if (m.userId === ctx.user.id && teams.isOwner(m.id, m.userId)) {
              json(res, 400, { ok: false, error: 'Cannot remove team owner' });
              return true;
            }

            try {
              const removed = teams.removeMember(m.id, m.userId);
              json(res, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: 'Member not found' });
            } catch (err) {
              json(res, 400, { ok: false, error: 'Failed to remove member' });
            }
            return true;
          }

          return false;
        }
      }

      // POST /api/teams/:id/members
      {
        const m = matchRoute('/api/teams/:id/members', pathname);
        if (m && method === 'POST') {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }

          const ctx = await requireManager(req, res, m.id);
          if (!ctx) return true;

          const body = await parseJsonBody(req);
          if (!isUUID(body.userId)) {
            json(res, 400, { ok: false, error: 'userId is required and must be a valid UUID' });
            return true;
          }
          const role = body.role ? String(body.role).trim().toLowerCase() : 'member';
          if (!VALID_ROLES.includes(role)) {
            json(res, 400, { ok: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` });
            return true;
          }

          try {
            const member = teams.addMember(m.id, body.userId, role);
            json(res, 201, member);
          } catch (err) {
            json(res, 400, { ok: false, error: 'Failed to add member' });
          }
          return true;
        }
      }

      // ── Team agent routes ──
      // PUT/DELETE /api/teams/:id/agents/:agentId
      {
        const m = matchRoute('/api/teams/:id/agents/:agentId', pathname);
        if (m) {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }
          if (!isUUID(m.agentId)) { json(res, 400, { ok: false, error: 'Invalid agent ID format' }); return true; }

          if (method === 'PUT') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            if (typeof body.role !== 'string' || !body.role.trim()) {
              json(res, 400, { ok: false, error: 'role is required and must be a non-empty string' });
              return true;
            }
            const role = body.role.trim().toLowerCase();
            if (!VALID_AGENT_ROLES.includes(role)) {
              json(res, 400, { ok: false, error: `role must be one of: ${VALID_AGENT_ROLES.join(', ')}` });
              return true;
            }

            try {
              const updated = teams.updateAgentRole(m.id, m.agentId, role);
              json(res, updated ? 200 : 404, updated ? { ok: true } : { ok: false, error: 'Agent not found in team' });
            } catch (err) {
              json(res, 400, { ok: false, error: 'Failed to update agent role' });
            }
            return true;
          }

          if (method === 'DELETE') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const removed = teams.removeAgent(m.id, m.agentId);
            json(res, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: 'Agent not found in team' });
            return true;
          }

          return false;
        }
      }

      // POST /api/teams/:id/agents
      {
        const m = matchRoute('/api/teams/:id/agents', pathname);
        if (m && method === 'POST') {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }

          const ctx = await requireManager(req, res, m.id);
          if (!ctx) return true;

          const body = await parseJsonBody(req);
          if (!isUUID(body.agentId)) {
            json(res, 400, { ok: false, error: 'agentId is required and must be a valid UUID' });
            return true;
          }
          const role = body.role ? String(body.role).trim().toLowerCase() : 'worker';
          if (!VALID_AGENT_ROLES.includes(role)) {
            json(res, 400, { ok: false, error: `role must be one of: ${VALID_AGENT_ROLES.join(', ')}` });
            return true;
          }

          try {
            const assignment = teams.addAgent(m.id, body.agentId, {
              role,
              addedBy: ctx.user.id,
            });
            json(res, 201, assignment);
          } catch (err) {
            json(res, 400, { ok: false, error: 'Failed to assign agent' });
          }
          return true;
        }
      }

      // ── GET/PUT/DELETE /api/teams/:id ──
      {
        const m = matchRoute('/api/teams/:id', pathname);
        if (m) {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid team ID format' }); return true; }

          if (method === 'GET') {
            const ctx = await requireMember(req, res, m.id);
            if (!ctx) return true;

            const team = teams.getTeam(m.id);
            if (!team) { json(res, 404, { ok: false, error: 'Team not found' }); return true; }

            json(res, 200, team);
            return true;
          }

          if (method === 'PUT') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            // Sanitize allowed fields
            const sanitized = {};
            if (body.name != null) {
              if (typeof body.name !== 'string' || !body.name.trim()) { json(res, 400, { ok: false, error: 'name must be a non-empty string' }); return true; }
              sanitized.name = body.name.trim().slice(0, MAX_NAME);
            }
            if (body.description != null) sanitized.description = String(body.description).trim().slice(0, MAX_DESC);
            if (body.icon != null) sanitized.icon = String(body.icon).trim().slice(0, MAX_SHORT);
            if (body.color != null) sanitized.color = String(body.color).trim().slice(0, MAX_SHORT);

            try {
              const updated = teams.updateTeam(m.id, sanitized);
              if (!updated) { json(res, 404, { ok: false, error: 'Team not found' }); return true; }
              json(res, 200, updated);
            } catch (err) {
              json(res, 400, { ok: false, error: 'Failed to update team' });
            }
            return true;
          }

          if (method === 'DELETE') {
            const user = await requireAuth(req, res);
            if (!user) return true;

            // Only owner or global admin can delete
            if (user.role !== 'admin' && !teams.isOwner(m.id, user.id)) {
              json(res, 403, { ok: false, error: 'Only the team owner can delete this team' });
              return true;
            }

            const deleted = teams.deleteTeam(m.id);
            json(res, deleted ? 200 : 404, deleted ? { ok: true } : { ok: false, error: 'Team not found' });
            return true;
          }
        }
      }

      return false;
    },
  };
}
