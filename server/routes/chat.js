/**
 * Chat history REST API routes.
 * GET  /api/chat/history — returns recent conversation history for the authenticated user.
 * DELETE /api/chat/history — clears conversation history for the authenticated user.
 */

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
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return true;
      }

      const url = new URL(req.url, 'http://localhost');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
      const before = url.searchParams.get('before') || null;

      const db = getDb();
      if (!db) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database unavailable' }));
        return true;
      }

      let rows;
      if (before) {
        rows = db.prepare(
          'SELECT id, role, content, model, createdAt FROM conversation_history WHERE userId = ? AND id < ? ORDER BY id DESC LIMIT ?'
        ).all(user.id, before, limit);
      } else {
        rows = db.prepare(
          'SELECT id, role, content, model, createdAt FROM conversation_history WHERE userId = ? ORDER BY id DESC LIMIT ?'
        ).all(user.id, limit);
      }

      // Reverse to chronological order
      rows.reverse();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        messages: rows.map(r => ({
          id: r.id,
          role: r.role,
          content: r.content,
          model: r.model,
          createdAt: r.createdAt,
        })),
        hasMore: rows.length === limit,
        cursor: rows.length > 0 ? rows[0].id : null,
      }));
      return true;
    }

    // DELETE /api/chat/history — clear history for the authenticated user
    if (req.method === 'DELETE' && pathname === '/api/chat/history') {
      const user = await authenticate(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return true;
      }

      const db = getDb();
      if (!db) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database unavailable' }));
        return true;
      }

      db.prepare('DELETE FROM conversation_history WHERE userId = ?').run(user.id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    return false; // not handled
  };
}
