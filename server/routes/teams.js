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
        if (!body.name) {
          json(res, 400, { error: 'name is required' });
          return true;
        }

        try {
          const team = teams.createTeam(String(body.name), user.id, {
            description: body.description ? String(body.description) : undefined,
            icon: body.icon ? String(body.icon) : undefined,
            color: body.color ? String(body.color) : undefined,
          });
          json(res, 201, team);
        } catch (err) {
          json(res, 400, { error: err.message });
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

          const pkg = TEAM_PACKAGES[m.key];
          if (!pkg) {
            json(res, 404, { error: `Package "${m.key}" not found` });
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
            json(res, 400, { error: err.message });
          }
          return true;
        }
      }

      // ── Team memory routes (must be before /:id to avoid conflict) ──
      // PUT /api/teams/:id/memory/:memId
      {
        const m = matchRoute('/api/teams/:id/memory/:memId', pathname);
        if (m) {
          if (method === 'PUT') {
            const ctx = await requireMember(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            try {
              const updated = teams.updateMemory(m.memId, body);
              if (!updated) { json(res, 404, { error: 'Memory entry not found' }); return true; }
              json(res, 200, updated);
            } catch (err) {
              json(res, 400, { error: err.message });
            }
            return true;
          }

          if (method === 'DELETE') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const deleted = teams.deleteMemory(m.memId);
            json(res, deleted ? 200 : 404, deleted ? { ok: true } : { error: 'Not found' });
            return true;
          }

          return false;
        }
      }

      // GET/POST /api/teams/:id/memory
      {
        const m = matchRoute('/api/teams/:id/memory', pathname);
        if (m) {
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
            if (!body.key || !body.content) {
              json(res, 400, { error: 'key and content are required' });
              return true;
            }

            try {
              const entry = teams.addMemory(m.id, String(body.key), String(body.content), {
                createdBy: ctx.user.id,
              });
              json(res, 201, entry);
            } catch (err) {
              json(res, 400, { error: err.message });
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
          if (method === 'PUT') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            if (!body.role) {
              json(res, 400, { error: 'role is required' });
              return true;
            }

            try {
              const updated = teams.updateMemberRole(m.id, m.userId, String(body.role));
              json(res, updated ? 200 : 404, updated ? { ok: true } : { error: 'Member not found' });
            } catch (err) {
              json(res, 400, { error: err.message });
            }
            return true;
          }

          if (method === 'DELETE') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            // Can't remove yourself if you're the owner
            if (m.userId === ctx.user.id && teams.isOwner(m.id, m.userId)) {
              json(res, 400, { error: 'Cannot remove team owner' });
              return true;
            }

            try {
              const removed = teams.removeMember(m.id, m.userId);
              json(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Member not found' });
            } catch (err) {
              json(res, 400, { error: err.message });
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
          const ctx = await requireManager(req, res, m.id);
          if (!ctx) return true;

          const body = await parseJsonBody(req);
          if (!body.userId) {
            json(res, 400, { error: 'userId is required' });
            return true;
          }

          try {
            const member = teams.addMember(m.id, String(body.userId), body.role || 'member');
            json(res, 201, member);
          } catch (err) {
            json(res, 400, { error: err.message });
          }
          return true;
        }
      }

      // ── Team agent routes ──
      // PUT/DELETE /api/teams/:id/agents/:agentId
      {
        const m = matchRoute('/api/teams/:id/agents/:agentId', pathname);
        if (m) {
          if (method === 'PUT') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            if (!body.role) {
              json(res, 400, { error: 'role is required' });
              return true;
            }

            try {
              const updated = teams.updateAgentRole(m.id, m.agentId, String(body.role));
              json(res, updated ? 200 : 404, updated ? { ok: true } : { error: 'Agent not found in team' });
            } catch (err) {
              json(res, 400, { error: err.message });
            }
            return true;
          }

          if (method === 'DELETE') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const removed = teams.removeAgent(m.id, m.agentId);
            json(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Agent not found in team' });
            return true;
          }

          return false;
        }
      }

      // POST /api/teams/:id/agents
      {
        const m = matchRoute('/api/teams/:id/agents', pathname);
        if (m && method === 'POST') {
          const ctx = await requireManager(req, res, m.id);
          if (!ctx) return true;

          const body = await parseJsonBody(req);
          if (!body.agentId) {
            json(res, 400, { error: 'agentId is required' });
            return true;
          }

          try {
            const assignment = teams.addAgent(m.id, String(body.agentId), {
              role: body.role || 'worker',
              addedBy: ctx.user.id,
            });
            json(res, 201, assignment);
          } catch (err) {
            json(res, 400, { error: err.message });
          }
          return true;
        }
      }

      // ── GET/PUT/DELETE /api/teams/:id ──
      {
        const m = matchRoute('/api/teams/:id', pathname);
        if (m) {
          if (method === 'GET') {
            const ctx = await requireMember(req, res, m.id);
            if (!ctx) return true;

            const team = teams.getTeam(m.id);
            if (!team) { json(res, 404, { error: 'Team not found' }); return true; }

            json(res, 200, team);
            return true;
          }

          if (method === 'PUT') {
            const ctx = await requireManager(req, res, m.id);
            if (!ctx) return true;

            const body = await parseJsonBody(req);
            try {
              const updated = teams.updateTeam(m.id, body);
              if (!updated) { json(res, 404, { error: 'Team not found' }); return true; }
              json(res, 200, updated);
            } catch (err) {
              json(res, 400, { error: err.message });
            }
            return true;
          }

          if (method === 'DELETE') {
            const user = await requireAuth(req, res);
            if (!user) return true;

            // Only owner or global admin can delete
            if (user.role !== 'admin' && !teams.isOwner(m.id, user.id)) {
              json(res, 403, { error: 'Only the team owner can delete this team' });
              return true;
            }

            const deleted = teams.deleteTeam(m.id);
            json(res, deleted ? 200 : 404, deleted ? { ok: true } : { error: 'Team not found' });
            return true;
          }
        }
      }

      return false;
    },
  };
}
