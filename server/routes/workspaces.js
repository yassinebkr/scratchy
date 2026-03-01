/**
 * @module routes/workspaces
 * REST API for named workspace management.
 *
 * Endpoints:
 *   GET    /api/workspaces              — list user's workspaces
 *   POST   /api/workspaces              — create workspace
 *   GET    /api/workspaces/active       — get active workspace
 *   GET    /api/workspaces/templates    — list available templates
 *   POST   /api/workspaces/templates/:key — create workspace from template
 *   POST   /api/workspaces/save-current — save current canvas as workspace
 *   GET    /api/workspaces/:id          — get workspace
 *   PATCH  /api/workspaces/:id          — update workspace
 *   DELETE /api/workspaces/:id          — delete workspace
 *   POST   /api/workspaces/:id/activate — set as active
 */

import * as workspacesState from '../../state/workspaces.js';

/**
 * @param {object} opts
 * @param {Function} opts.authenticate — (req) => user | null
 * @param {Function} opts.matchRoute — (pattern, pathname) => params | null
 */
export function createWorkspaceRoutes(opts) {
  const { authenticate, matchRoute } = opts;

  /**
   * JSON response helper.
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
   * Parse JSON body.
   * @param {import('node:http').IncomingMessage} req
   * @returns {Promise<object>}
   */
  async function parseBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf-8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }

  /**
   * Require auth — returns user or sends 401.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
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
   * Get user plan tier from the users table.
   * @param {object} user
   * @returns {string}
   */
  function getUserTier(user) {
    return user.plan || 'free';
  }

  return {
    /**
     * Handle a request to /api/workspaces*.
     * @returns {Promise<boolean>} true if handled
     */
    async handle(req, res, pathname) {
      const method = req.method || 'GET';

      // GET /api/workspaces — list
      if (method === 'GET' && pathname === '/api/workspaces') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const workspaces = workspacesState.listWorkspaces(user.id);
        json(res, 200, workspaces);
        return true;
      }

      // POST /api/workspaces — create
      if (method === 'POST' && pathname === '/api/workspaces') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const body = await parseBody(req);
        if (!body.name) {
          json(res, 400, { error: 'name is required' });
          return true;
        }

        try {
          const ws = workspacesState.createWorkspace(user.id, {
            name: String(body.name),
            description: body.description ? String(body.description) : '',
            icon: body.icon ? String(body.icon) : undefined,
            ops: body.ops || [],
            surfaces: body.surfaces || [],
            layoutMode: body.layoutMode ? String(body.layoutMode) : 'auto',
            isDefault: !!body.isDefault,
          });
          json(res, 201, ws);
        } catch (err) {
          json(res, 500, { error: err.message });
        }
        return true;
      }

      // GET /api/workspaces/active — get active workspace
      if (method === 'GET' && pathname === '/api/workspaces/active') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const active = workspacesState.getActiveWorkspace(user.id);
        json(res, 200, active || { none: true });
        return true;
      }

      // GET /api/workspaces/templates — list templates
      if (method === 'GET' && pathname === '/api/workspaces/templates') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const templates = workspacesState.listTemplates(getUserTier(user));
        json(res, 200, templates);
        return true;
      }

      // POST /api/workspaces/templates/:key — create from template
      {
        const m = matchRoute('/api/workspaces/templates/:key', pathname);
        if (m && method === 'POST') {
          const user = await requireAuth(req, res);
          if (!user) return true;

          const body = await parseBody(req);
          const template = workspacesState.getTemplate(m.key);
          if (!template) {
            json(res, 404, { error: 'Template not found' });
            return true;
          }

          // Check tier access
          const tierOrder = { free: 0, pro: 1, max: 2 };
          const userLevel = tierOrder[getUserTier(user)] || 0;
          const templateLevel = tierOrder[template.tier] || 0;
          if (templateLevel > userLevel) {
            json(res, 403, { error: 'This template requires a higher plan tier' });
            return true;
          }

          try {
            const ws = workspacesState.createFromTemplate(
              user.id,
              m.key,
              body.name ? String(body.name) : undefined
            );
            json(res, 201, ws);
          } catch (err) {
            json(res, 500, { error: err.message });
          }
          return true;
        }
      }

      // POST /api/workspaces/save-current — save current canvas state
      if (method === 'POST' && pathname === '/api/workspaces/save-current') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const body = await parseBody(req);
        if (!body.name) {
          json(res, 400, { error: 'name is required' });
          return true;
        }

        try {
          const ws = workspacesState.saveCurrentAsWorkspace(user.id, String(body.name), {
            ops: body.ops || [],
            surfaces: body.surfaces || [],
            layoutMode: body.layoutMode || 'auto',
          });
          json(res, 201, ws);
        } catch (err) {
          json(res, 500, { error: err.message });
        }
        return true;
      }

      // GET /api/workspaces/:id
      {
        const m = matchRoute('/api/workspaces/:id', pathname);
        if (m && method === 'GET') {
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ws = workspacesState.getWorkspace(m.id);
          if (!ws || ws.userId !== user.id) {
            json(res, 404, { error: 'Workspace not found' });
            return true;
          }

          json(res, 200, ws);
          return true;
        }

        // PATCH /api/workspaces/:id
        if (m && method === 'PATCH') {
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ws = workspacesState.getWorkspace(m.id);
          if (!ws || ws.userId !== user.id) {
            json(res, 404, { error: 'Workspace not found' });
            return true;
          }

          const body = await parseBody(req);
          const updates = {};
          if (body.name !== undefined) updates.name = String(body.name);
          if (body.description !== undefined) updates.description = String(body.description);
          if (body.icon !== undefined) updates.icon = String(body.icon);
          if (body.ops !== undefined) updates.ops = body.ops;
          if (body.surfaces !== undefined) updates.surfaces = body.surfaces;
          if (body.layoutMode !== undefined) updates.layoutMode = String(body.layoutMode);
          if (body.isDefault !== undefined) updates.isDefault = !!body.isDefault;

          const updated = workspacesState.updateWorkspace(m.id, updates);
          json(res, 200, updated);
          return true;
        }

        // DELETE /api/workspaces/:id
        if (m && method === 'DELETE') {
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ws = workspacesState.getWorkspace(m.id);
          if (!ws || ws.userId !== user.id) {
            json(res, 404, { error: 'Workspace not found' });
            return true;
          }

          workspacesState.deleteWorkspace(m.id);
          json(res, 200, { ok: true });
          return true;
        }

        // POST /api/workspaces/:id/activate
        const activateMatch = matchRoute('/api/workspaces/:id/activate', pathname);
        if (activateMatch && method === 'POST') {
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ok = workspacesState.activateWorkspace(user.id, activateMatch.id);
          if (!ok) {
            json(res, 404, { error: 'Workspace not found or not yours' });
            return true;
          }

          const ws = workspacesState.getWorkspace(activateMatch.id);
          json(res, 200, ws);
          return true;
        }
      }

      return false;
    },
  };
}
