/**
 * @module routes/widgets
 * API routes for v2 built-in widgets: Notes, Calendar, Email.
 *
 * All routes require authentication. Data is per-user (userId from session).
 */

import crypto from 'node:crypto';

/**
 * Create widget route handlers.
 * @param {Object} opts
 * @param {Function} opts.authenticate — (req) => user | null
 * @param {Function} opts.getDb       — () => Database | null
 * @returns {{ handle: (req, res, pathname) => Promise<boolean> }}
 */
export function createWidgetRoutes({ authenticate, getDb }) {

  function json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }

  async function parseBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf-8');
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch { return null; }
  }

  async function requireAuth(req, res) {
    const user = await authenticate(req);
    if (!user) { json(res, 401, { error: 'Authentication required' }); return null; }
    return user;
  }

  // ── Notes CRUD ─────────────────────────────────────────────

  async function notesList(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const rows = db.prepare('SELECT * FROM notes WHERE userId = ? ORDER BY updatedAt DESC').all(user.id);
    json(res, 200, rows);
    return true;
  }

  async function notesGet(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const row = db.prepare('SELECT * FROM notes WHERE id = ? AND userId = ?').get(id, user.id);
    if (!row) return json(res, 404, { error: 'Note not found' }), true;
    json(res, 200, row);
    return true;
  }

  async function notesCreate(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const body = await parseBody(req);
    if (!body) return json(res, 400, { error: 'Invalid JSON' }), true;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = body.title ? String(body.title) : 'Untitled';
    const content = body.content != null ? String(body.content) : '';

    db.prepare('INSERT INTO notes (id, userId, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, user.id, title, content, now, now);

    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    json(res, 201, row);
    return true;
  }

  async function notesUpdate(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;

    const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND userId = ?').get(id, user.id);
    if (!existing) return json(res, 404, { error: 'Note not found' }), true;

    const body = await parseBody(req);
    if (!body) return json(res, 400, { error: 'Invalid JSON' }), true;

    const now = new Date().toISOString();
    const updates = [];
    const params = [];
    if (body.title != null) { updates.push('title = ?'); params.push(String(body.title)); }
    if (body.content != null) { updates.push('content = ?'); params.push(String(body.content)); }
    updates.push('updatedAt = ?'); params.push(now);
    params.push(id);

    db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    json(res, 200, row);
    return true;
  }

  async function notesDelete(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;

    const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND userId = ?').get(id, user.id);
    if (!existing) return json(res, 404, { error: 'Note not found' }), true;

    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    json(res, 200, { ok: true });
    return true;
  }

  // ── Calendar CRUD ──────────────────────────────────────────

  async function calendarList(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');

    let query = 'SELECT * FROM calendar_events WHERE userId = ?';
    const params = [user.id];
    if (start) { query += ' AND startTime >= ?'; params.push(start); }
    if (end) { query += ' AND startTime <= ?'; params.push(end); }
    query += ' ORDER BY startTime ASC';

    const rows = db.prepare(query).all(...params);
    json(res, 200, rows);
    return true;
  }

  async function calendarGet(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const row = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND userId = ?').get(id, user.id);
    if (!row) return json(res, 404, { error: 'Event not found' }), true;
    json(res, 200, row);
    return true;
  }

  async function calendarCreate(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const body = await parseBody(req);
    if (!body || !body.title || !body.startTime) {
      return json(res, 400, { error: 'title and startTime are required' }), true;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO calendar_events (id, userId, title, startTime, endTime, allDay, color, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, user.id, String(body.title), body.startTime, body.endTime || null,
           body.allDay ? 1 : 0, body.color || 'blue', now);

    const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    json(res, 201, row);
    return true;
  }

  async function calendarUpdate(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const existing = db.prepare('SELECT id FROM calendar_events WHERE id = ? AND userId = ?').get(id, user.id);
    if (!existing) return json(res, 404, { error: 'Event not found' }), true;
    const body = await parseBody(req);
    if (!body) return json(res, 400, { error: 'Invalid JSON' }), true;

    const updates = [];
    const params = [];
    for (const col of ['title', 'startTime', 'endTime', 'color']) {
      if (body[col] != null) { updates.push(`${col} = ?`); params.push(String(body[col])); }
    }
    if (body.allDay != null) { updates.push('allDay = ?'); params.push(body.allDay ? 1 : 0); }
    if (updates.length === 0) return json(res, 400, { error: 'No fields to update' }), true;
    params.push(id);

    db.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    json(res, 200, row);
    return true;
  }

  async function calendarDelete(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const existing = db.prepare('SELECT id FROM calendar_events WHERE id = ? AND userId = ?').get(id, user.id);
    if (!existing) return json(res, 404, { error: 'Event not found' }), true;
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
    json(res, 200, { ok: true });
    return true;
  }

  // ── Email CRUD + Send ──────────────────────────────────────

  async function emailList(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const rows = db.prepare('SELECT * FROM emails WHERE userId = ? ORDER BY createdAt DESC LIMIT 50').all(user.id);
    json(res, 200, rows);
    return true;
  }

  async function emailGet(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const row = db.prepare('SELECT * FROM emails WHERE id = ? AND userId = ?').get(id, user.id);
    if (!row) return json(res, 404, { error: 'Email not found' }), true;
    json(res, 200, row);
    return true;
  }

  async function emailCreate(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const body = await parseBody(req);
    if (!body || !body.to) return json(res, 400, { error: 'to is required' }), true;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO emails (id, userId, "to", subject, body, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'draft', ?)`)
      .run(id, user.id, String(body.to), body.subject || '(no subject)', body.body || '', now);

    const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    json(res, 201, row);
    return true;
  }

  async function emailSend(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const email = db.prepare('SELECT * FROM emails WHERE id = ? AND userId = ?').get(id, user.id);
    if (!email) return json(res, 404, { error: 'Email not found' }), true;
    if (email.status === 'sent') return json(res, 400, { error: 'Email already sent' }), true;

    // Send via Resend API
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return json(res, 503, { error: 'Email service not configured (RESEND_API_KEY)' }), true;

    try {
      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'onboarding@resend.dev',
          to: email.to,
          subject: email.subject,
          html: email.body,
        }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({ message: 'Unknown error' }));
        db.prepare("UPDATE emails SET status = 'failed' WHERE id = ?").run(id);
        return json(res, 500, { error: `Send failed: ${err.message || JSON.stringify(err)}` }), true;
      }

      const result = await sendRes.json();
      const now = new Date().toISOString();
      db.prepare("UPDATE emails SET status = 'sent', sentAt = ?, resendId = ? WHERE id = ?")
        .run(now, result.id || null, id);

      const updated = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
      json(res, 200, { ok: true, email: updated });
      return true;
    } catch (err) {
      db.prepare("UPDATE emails SET status = 'failed' WHERE id = ?").run(id);
      return json(res, 500, { error: `Send error: ${err.message}` }), true;
    }
  }

  async function emailDelete(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const existing = db.prepare('SELECT id FROM emails WHERE id = ? AND userId = ?').get(id, user.id);
    if (!existing) return json(res, 404, { error: 'Email not found' }), true;
    db.prepare('DELETE FROM emails WHERE id = ?').run(id);
    json(res, 200, { ok: true });
    return true;
  }

  // ── Route matcher ──────────────────────────────────────────

  function matchRoute(pattern, pathname) {
    const pp = pattern.split('/');
    const parts = pathname.split('/');
    if (pp.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pp[i] !== parts[i]) return null;
    }
    return params;
  }

  /**
   * Handle a widget API request.
   * @returns {Promise<boolean>} true if handled
   */
  async function handle(req, res, pathname) {
    const method = req.method;

    // ── Notes ──
    if (method === 'GET' && pathname === '/api/notes')     return notesList(req, res);
    if (method === 'POST' && pathname === '/api/notes')    return notesCreate(req, res);
    { const m = matchRoute('/api/notes/:id', pathname);
      if (m) {
        if (method === 'GET')    return notesGet(req, res, m.id);
        if (method === 'PUT')    return notesUpdate(req, res, m.id);
        if (method === 'DELETE') return notesDelete(req, res, m.id);
      }
    }

    // ── Calendar ──
    if (method === 'GET' && pathname === '/api/calendar')     return calendarList(req, res);
    if (method === 'POST' && pathname === '/api/calendar')    return calendarCreate(req, res);
    { const m = matchRoute('/api/calendar/:id', pathname);
      if (m) {
        if (method === 'GET')    return calendarGet(req, res, m.id);
        if (method === 'PUT')    return calendarUpdate(req, res, m.id);
        if (method === 'DELETE') return calendarDelete(req, res, m.id);
      }
    }

    // ── Email ──
    if (method === 'GET' && pathname === '/api/emails')     return emailList(req, res);
    if (method === 'POST' && pathname === '/api/emails')    return emailCreate(req, res);
    { const m = matchRoute('/api/emails/:id', pathname);
      if (m) {
        if (method === 'GET')    return emailGet(req, res, m.id);
        if (method === 'DELETE') return emailDelete(req, res, m.id);
      }
    }
    { const m = matchRoute('/api/emails/:id/send', pathname);
      if (m && method === 'POST') return emailSend(req, res, m.id);
    }

    return false; // Not handled
  }

  return { handle };
}
