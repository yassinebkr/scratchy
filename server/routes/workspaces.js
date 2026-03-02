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

/* ── Input-validation helpers ── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s) { return typeof s === 'string' && UUID_RE.test(s); }

const MAX_NAME  = 200;
const MAX_DESC  = 2000;
const MAX_SHORT = 100;
const VALID_LAYOUT_MODES = ['auto', 'dashboard', 'focus', 'columns', 'rows'];

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
        if (typeof body.name !== 'string' || !body.name.trim()) {
          json(res, 400, { ok: false, error: 'name is required and must be a non-empty string' });
          return true;
        }
        const name = body.name.trim().slice(0, MAX_NAME);
        const description = body.description != null ? String(body.description).trim().slice(0, MAX_DESC) : '';
        const icon = body.icon != null ? String(body.icon).trim().slice(0, MAX_SHORT) : undefined;
        if (body.ops != null && !Array.isArray(body.ops)) {
          json(res, 400, { ok: false, error: 'ops must be an array' });
          return true;
        }
        if (body.surfaces != null && !Array.isArray(body.surfaces)) {
          json(res, 400, { ok: false, error: 'surfaces must be an array' });
          return true;
        }
        const layoutMode = body.layoutMode ? String(body.layoutMode).trim() : 'auto';
        if (!VALID_LAYOUT_MODES.includes(layoutMode)) {
          json(res, 400, { ok: false, error: `layoutMode must be one of: ${VALID_LAYOUT_MODES.join(', ')}` });
          return true;
        }

        try {
          const ws = workspacesState.createWorkspace(user.id, {
            name,
            description,
            icon,
            ops: body.ops || [],
            surfaces: body.surfaces || [],
            layoutMode,
            isDefault: !!body.isDefault,
          });
          json(res, 201, ws);
        } catch (err) {
          json(res, 500, { ok: false, error: 'Failed to create workspace' });
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

          if (typeof m.key !== 'string' || !m.key.trim() || m.key.length > MAX_SHORT) {
            json(res, 400, { ok: false, error: 'Invalid template key' });
            return true;
          }

          const body = await parseBody(req);
          const template = workspacesState.getTemplate(m.key);
          if (!template) {
            json(res, 404, { ok: false, error: 'Template not found' });
            return true;
          }

          // Check tier access
          const tierOrder = { free: 0, pro: 1, max: 2 };
          const userLevel = tierOrder[getUserTier(user)] || 0;
          const templateLevel = tierOrder[template.tier] || 0;
          if (templateLevel > userLevel) {
            json(res, 403, { ok: false, error: 'This template requires a higher plan tier' });
            return true;
          }

          const templateName = body.name ? String(body.name).trim().slice(0, MAX_NAME) : undefined;

          try {
            const ws = workspacesState.createFromTemplate(
              user.id,
              m.key,
              templateName
            );
            json(res, 201, ws);
          } catch (err) {
            json(res, 500, { ok: false, error: 'Failed to create workspace from template' });
          }
          return true;
        }
      }

      // POST /api/workspaces/save-current — save current canvas state
      if (method === 'POST' && pathname === '/api/workspaces/save-current') {
        const user = await requireAuth(req, res);
        if (!user) return true;

        const body = await parseBody(req);
        if (typeof body.name !== 'string' || !body.name.trim()) {
          json(res, 400, { ok: false, error: 'name is required and must be a non-empty string' });
          return true;
        }
        const name = body.name.trim().slice(0, MAX_NAME);
        if (body.ops != null && !Array.isArray(body.ops)) {
          json(res, 400, { ok: false, error: 'ops must be an array' });
          return true;
        }
        if (body.surfaces != null && !Array.isArray(body.surfaces)) {
          json(res, 400, { ok: false, error: 'surfaces must be an array' });
          return true;
        }
        const layoutMode = body.layoutMode ? String(body.layoutMode).trim() : 'auto';
        if (!VALID_LAYOUT_MODES.includes(layoutMode)) {
          json(res, 400, { ok: false, error: `layoutMode must be one of: ${VALID_LAYOUT_MODES.join(', ')}` });
          return true;
        }

        try {
          const ws = workspacesState.saveCurrentAsWorkspace(user.id, name, {
            ops: body.ops || [],
            surfaces: body.surfaces || [],
            layoutMode,
          });
          json(res, 201, ws);
        } catch (err) {
          json(res, 500, { ok: false, error: 'Failed to save workspace' });
        }
        return true;
      }

      // GET /api/workspaces/:id
      {
        const m = matchRoute('/api/workspaces/:id', pathname);
        if (m && !isUUID(m.id)) {
          // Skip non-UUID :id — could be a sub-path like /api/workspaces/active
          // (already matched above), so only reject if we actually matched /:id
        }

        if (m && method === 'GET') {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid workspace ID format' }); return true; }
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ws = workspacesState.getWorkspace(m.id);
          if (!ws || ws.userId !== user.id) {
            json(res, 404, { ok: false, error: 'Workspace not found' });
            return true;
          }

          json(res, 200, ws);
          return true;
        }

        // PATCH /api/workspaces/:id
        if (m && method === 'PATCH') {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid workspace ID format' }); return true; }
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ws = workspacesState.getWorkspace(m.id);
          if (!ws || ws.userId !== user.id) {
            json(res, 404, { ok: false, error: 'Workspace not found' });
            return true;
          }

          const body = await parseBody(req);
          const updates = {};
          if (body.name !== undefined) {
            if (typeof body.name !== 'string' || !body.name.trim()) { json(res, 400, { ok: false, error: 'name must be a non-empty string' }); return true; }
            updates.name = body.name.trim().slice(0, MAX_NAME);
          }
          if (body.description !== undefined) updates.description = String(body.description).trim().slice(0, MAX_DESC);
          if (body.icon !== undefined) updates.icon = String(body.icon).trim().slice(0, MAX_SHORT);
          if (body.ops !== undefined) {
            if (!Array.isArray(body.ops)) { json(res, 400, { ok: false, error: 'ops must be an array' }); return true; }
            updates.ops = body.ops;
          }
          if (body.surfaces !== undefined) {
            if (!Array.isArray(body.surfaces)) { json(res, 400, { ok: false, error: 'surfaces must be an array' }); return true; }
            updates.surfaces = body.surfaces;
          }
          if (body.layoutMode !== undefined) {
            const lm = String(body.layoutMode).trim();
            if (!VALID_LAYOUT_MODES.includes(lm)) { json(res, 400, { ok: false, error: `layoutMode must be one of: ${VALID_LAYOUT_MODES.join(', ')}` }); return true; }
            updates.layoutMode = lm;
          }
          if (body.isDefault !== undefined) updates.isDefault = !!body.isDefault;

          try {
            const updated = workspacesState.updateWorkspace(m.id, updates);
            json(res, 200, updated);
          } catch (err) {
            json(res, 500, { ok: false, error: 'Failed to update workspace' });
          }
          return true;
        }

        // DELETE /api/workspaces/:id
        if (m && method === 'DELETE') {
          if (!isUUID(m.id)) { json(res, 400, { ok: false, error: 'Invalid workspace ID format' }); return true; }
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ws = workspacesState.getWorkspace(m.id);
          if (!ws || ws.userId !== user.id) {
            json(res, 404, { ok: false, error: 'Workspace not found' });
            return true;
          }

          workspacesState.deleteWorkspace(m.id);
          json(res, 200, { ok: true });
          return true;
        }

        // POST /api/workspaces/:id/activate
        const activateMatch = matchRoute('/api/workspaces/:id/activate', pathname);
        if (activateMatch && method === 'POST') {
          if (!isUUID(activateMatch.id)) { json(res, 400, { ok: false, error: 'Invalid workspace ID format' }); return true; }
          const user = await requireAuth(req, res);
          if (!user) return true;

          const ok = workspacesState.activateWorkspace(user.id, activateMatch.id);
          if (!ok) {
            json(res, 404, { ok: false, error: 'Workspace not found or not yours' });
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
