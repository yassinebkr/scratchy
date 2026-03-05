/**
 * @module routes/widgets
 * API routes for v2 built-in widgets: Notes, Calendar, Email.
 *
 * All routes require authentication. Data is per-user (userId from session).
 */

import crypto from 'node:crypto';
import * as googleAuth from '../../lib/google-auth.js';

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

  // ── Email Drafts (using email_drafts table) ─────────────

  async function emailList(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const rows = db.prepare('SELECT * FROM email_drafts WHERE userId = ? ORDER BY updatedAt DESC LIMIT 50').all(user.id);
    // Add virtual status field for frontend compat (drafts are always 'draft')
    json(res, 200, rows.map(r => ({ ...r, status: 'draft' })));
    return true;
  }

  async function emailGet(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const row = db.prepare('SELECT * FROM email_drafts WHERE id = ? AND userId = ?').get(id, user.id);
    if (!row) return json(res, 404, { error: 'Draft not found' }), true;
    json(res, 200, { ...row, status: 'draft' });
    return true;
  }

  async function emailCreate(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const body = await parseBody(req);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO email_drafts (id, userId, "to", subject, body, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, user.id, String(body?.to || ''), body?.subject || '', body?.body || '', now, now);

    const row = db.prepare('SELECT * FROM email_drafts WHERE id = ?').get(id);
    json(res, 201, row);
    return true;
  }

  /**
   * SECURITY: This is the ONLY path that can send emails.
   * It's a REST endpoint — only reachable from authenticated browser requests.
   * The WS widget action handler has NO send action. Agents cannot reach this.
   *
   * Flow: draft saved in email_drafts → human clicks Send → this endpoint
   * → Gmail API creates draft + sends it via drafts.send().
   */
  async function emailSend(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;

    // Look up draft from the new email_drafts table
    const draft = db.prepare('SELECT * FROM email_drafts WHERE id = ? AND userId = ?').get(id, user.id);
    if (!draft) return json(res, 404, { error: 'Draft not found' }), true;
    if (!draft.to) return json(res, 400, { error: 'Recipient address required' }), true;

    // Get Gmail client for this user
    const client = await googleAuth.getClient(user.id);
    if (!client) {
      return json(res, 403, { error: 'Google account not connected. Please connect via email widget.' }), true;
    }

    try {
      const { google: gapis } = await import('googleapis');
      const gmail = gapis.gmail({ version: 'v1', auth: client });

      // Build RFC 2822 message
      const messageParts = [
        `To: ${draft.to}`,
        `Subject: ${draft.subject || '(no subject)'}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        draft.body || '',
      ];
      const rawMessage = Buffer.from(messageParts.join('\r\n')).toString('base64url');

      // Create draft then send it (uses gmail.compose scope, not gmail.send)
      const created = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: rawMessage } },
      });

      const sent = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: created.data.id },
      });

      // Clean up: delete the local draft
      db.prepare('DELETE FROM email_drafts WHERE id = ?').run(id);

      console.log(`[email] Sent via Gmail: to=${draft.to} subject=${draft.subject} gmailId=${sent.data.id}`);
      json(res, 200, { ok: true, gmailMessageId: sent.data.id });
      return true;
    } catch (err) {
      console.error('[email] Gmail send error:', err.message);
      const msg = err.message?.includes('invalid_grant')
        ? 'Google session expired. Please reconnect your account.'
        : `Send failed: ${err.message}`;
      return json(res, 500, { error: msg }), true;
    }
  }

  async function emailDelete(req, res, id) {
    const user = await requireAuth(req, res); if (!user) return true;
    const db = getDb();
    if (!db) return json(res, 500, { error: 'Database unavailable' }), true;
    const existing = db.prepare('SELECT id FROM email_drafts WHERE id = ? AND userId = ?').get(id, user.id);
    if (!existing) return json(res, 404, { error: 'Draft not found' }), true;
    db.prepare('DELETE FROM email_drafts WHERE id = ?').run(id);
    json(res, 200, { ok: true });
    return true;
  }

  // ── Google OAuth status ──
  async function emailGoogleStatus(req, res) {
    const user = await requireAuth(req, res); if (!user) return true;
    const status = googleAuth.getStatus(user.id);
    json(res, 200, status);
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

    // ── Email (drafts + send) ──
    if (method === 'GET' && pathname === '/api/emails')     return emailList(req, res);
    if (method === 'POST' && pathname === '/api/emails')    return emailCreate(req, res);
    if (method === 'GET' && pathname === '/api/emails/google-status') return emailGoogleStatus(req, res);
    { const m = matchRoute('/api/emails/:id', pathname);
      if (m) {
        if (method === 'GET')    return emailGet(req, res, m.id);
        if (method === 'DELETE') return emailDelete(req, res, m.id);
      }
    }
    // SECURITY: This is the ONLY send path. REST-only. Human-only.
    // No widget action can reach this. The agent has no way to call HTTP endpoints.
    { const m = matchRoute('/api/emails/:id/send', pathname);
      if (m && method === 'POST') return emailSend(req, res, m.id);
    }

    return false; // Not handled
  }

  return { handle };
}
