/**
 * Chat history REST API routes.
 * GET  /api/chat/history — returns recent conversation history for the authenticated user.
 * DELETE /api/chat/history — clears conversation history for the authenticated user.
 */

/* ── Input-validation helpers ── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s) { return typeof s === 'string' && UUID_RE.test(s); }

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * Create chat routes.
 * @param {Object} opts
 * @param {Function} opts.authenticate — auth middleware (req) => user or null
 * @param {Function} opts.getDb — () => Database
 * @returns {Function} route handler (req, res, pathname) => Promise<boolean>
 */
export function createChatRoutes({ authenticate, getDb }) {
  return async function handleChatRoute(req, res, pathname) {
    // GET /api/chat/history?limit=50&before=<id>
    if (req.method === 'GET' && pathname === '/api/chat/history') {
      const user = await authenticate(req);
      if (!user) {
        jsonRes(res, 401, { ok: false, error: 'Authentication required' });
        return true;
      }

      const url = new URL(req.url, 'http://localhost');

      // Validate & clamp limit
      const rawLimit = url.searchParams.get('limit');
      let limit = 50;
      if (rawLimit != null) {
        limit = parseInt(rawLimit, 10);
        if (isNaN(limit) || limit < 1) limit = 1;
        if (limit > 200) limit = 200;
      }

      // Validate before cursor (numeric row id)
      const rawBefore = url.searchParams.get('before') || null;
      let before = null;
      if (rawBefore != null) {
        before = parseInt(rawBefore, 10);
        if (isNaN(before) || before < 0) {
          jsonRes(res, 400, { ok: false, error: 'before must be a positive integer' });
          return true;
        }
      }

      // Validate agentId if provided
      const rawAgentId = url.searchParams.get('agentId') || null;
      // Accept UUIDs or team-prefixed IDs (team:<uuid>)
      if (rawAgentId != null && !isUUID(rawAgentId) && !/^team:[0-9a-f-]{36}$/i.test(rawAgentId)) {
        jsonRes(res, 400, { ok: false, error: 'agentId must be a valid UUID or team:<uuid>' });
        return true;
      }
      const agentId = rawAgentId;

      const db = getDb();
      if (!db) {
        jsonRes(res, 503, { ok: false, error: 'Database unavailable' });
        return true;
      }

      try {
        let rows;
        if (agentId) {
          // Per-agent conversation history
          if (before != null) {
            rows = db.prepare(
              'SELECT id, agentId, role, content, model, createdAt FROM conversation_history WHERE userId = ? AND agentId = ? AND id < ? ORDER BY id DESC LIMIT ?'
            ).all(user.id, agentId, before, limit);
          } else {
            rows = db.prepare(
              'SELECT id, agentId, role, content, model, createdAt FROM conversation_history WHERE userId = ? AND agentId = ? ORDER BY id DESC LIMIT ?'
            ).all(user.id, agentId, limit);
          }
        } else {
          // All conversations (legacy / no agent filter)
          if (before != null) {
            rows = db.prepare(
              'SELECT id, agentId, role, content, model, createdAt FROM conversation_history WHERE userId = ? AND id < ? ORDER BY id DESC LIMIT ?'
            ).all(user.id, before, limit);
          } else {
            rows = db.prepare(
              'SELECT id, agentId, role, content, model, createdAt FROM conversation_history WHERE userId = ? ORDER BY id DESC LIMIT ?'
            ).all(user.id, limit);
          }
        }

        // Reverse to chronological order
        rows.reverse();

        jsonRes(res, 200, {
          messages: rows.map(r => ({
            id: r.id,
            agentId: r.agentId || null,
            role: r.role,
            content: r.content,
            model: r.model,
            createdAt: r.createdAt,
          })),
          hasMore: rows.length === limit,
          cursor: rows.length > 0 ? rows[0].id : null,
        });
      } catch (err) {
        jsonRes(res, 500, { ok: false, error: 'Failed to fetch chat history' });
      }
      return true;
    }

    // DELETE /api/chat/history — clear history for the authenticated user
    if (req.method === 'DELETE' && pathname === '/api/chat/history') {
      const user = await authenticate(req);
      if (!user) {
        jsonRes(res, 401, { ok: false, error: 'Authentication required' });
        return true;
      }

      const db = getDb();
      if (!db) {
        jsonRes(res, 503, { ok: false, error: 'Database unavailable' });
        return true;
      }

      const delUrl = new URL(req.url, 'http://localhost');
      const delAgentId = delUrl.searchParams.get('agentId') || null;

      // Validate agentId if provided
      if (delAgentId != null && !isUUID(delAgentId)) {
        jsonRes(res, 400, { ok: false, error: 'agentId must be a valid UUID' });
        return true;
      }

      try {
        if (delAgentId) {
          db.prepare('DELETE FROM conversation_history WHERE userId = ? AND agentId = ?').run(user.id, delAgentId);
        } else {
          db.prepare('DELETE FROM conversation_history WHERE userId = ?').run(user.id);
        }

        jsonRes(res, 200, { ok: true });
      } catch (err) {
        jsonRes(res, 500, { ok: false, error: 'Failed to clear chat history' });
      }
      return true;
    }

    return false; // not handled
  };
}
