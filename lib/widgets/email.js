/**
 * @module lib/widgets/email
 * Email widget for Scratchy v2.
 *
 * SECURITY BOUNDARY:
 *   Agent CAN:  read inbox, search, view email, pre-fill compose form
 *   Agent CANNOT: send emails. Ever. Structurally impossible.
 *
 *   Sending is ONLY available via POST /api/emails/:id/send (REST),
 *   which lives in routes/widgets.js — unreachable from WS widget actions.
 *   The send function is not exported from this module.
 *
 * Actions (all agent-safe):
 *   mail-inbox     — Show Gmail inbox (requires OAuth)
 *   mail-search    — Search Gmail messages
 *   mail-read      — View a specific email
 *   mail-compose   — Show compose form (pre-filled or blank)
 *   mail-save-draft — Save compose data as draft in DB
 *   mail-connect   — Start Google OAuth flow
 *   mail-status    — Check Google connection status
 *   mail-drafts    — List saved drafts
 *   mail-delete    — Delete a draft
 */

import crypto from 'node:crypto';
import { google } from 'googleapis';
import { upsert, patch, remove, toast } from './framework.js';
import * as googleAuth from '../google-auth.js';

/** @type {import('better-sqlite3').Database} */
let db;

/** @type {(userId: string, ops: any[]) => void} */
let broadcast;

// ─── Schema ─────────────────────────────────────────────────────────────────

function ensureTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS email_drafts (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      "to"      TEXT NOT NULL DEFAULT '',
      subject   TEXT NOT NULL DEFAULT '',
      body      TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_email_drafts_userId ON email_drafts(userId)');
}

// ─── Draft CRUD (SQLite) ────────────────────────────────────────────────────

function listDrafts(userId) {
  return db.prepare('SELECT * FROM email_drafts WHERE userId = ? ORDER BY updatedAt DESC').all(userId);
}

function getDraft(id, userId) {
  return db.prepare('SELECT * FROM email_drafts WHERE id = ? AND userId = ?').get(id, userId);
}

function saveDraft(userId, { to, subject, body }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO email_drafts (id, userId, "to", subject, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, to || '', subject || '', body || '');
  return { id, userId, to, subject, body };
}

function updateDraft(id, userId, { to, subject, body }) {
  const sets = ['updatedAt = datetime(\'now\')'];
  const values = [];
  if (to !== undefined) { sets.push('"to" = ?'); values.push(to); }
  if (subject !== undefined) { sets.push('subject = ?'); values.push(subject); }
  if (body !== undefined) { sets.push('body = ?'); values.push(body); }
  values.push(id, userId);
  db.prepare(`UPDATE email_drafts SET ${sets.join(', ')} WHERE id = ? AND userId = ?`).run(...values);
  return getDraft(id, userId);
}

function deleteDraft(id, userId) {
  const result = db.prepare('DELETE FROM email_drafts WHERE id = ? AND userId = ?').run(id, userId);
  return result.changes > 0;
}

// ─── Gmail Read (Google API) ────────────────────────────────────────────────

/**
 * Fetch Gmail inbox messages.
 * @param {string} userId
 * @param {number} [maxResults=15]
 * @returns {Promise<Array>}
 */
async function fetchInbox(userId, maxResults = 15) {
  const client = await googleAuth.getClient(userId);
  if (!client) return [];

  const gmail = google.gmail({ version: 'v1', auth: client });
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX'],
  });

  if (!res.data.messages?.length) return [];

  // Batch fetch headers for each message
  const messages = [];
  for (const msg of res.data.messages.slice(0, maxResults)) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = detail.data.payload?.headers || [];
      messages.push({
        id: msg.id,
        threadId: msg.threadId,
        from: headers.find(h => h.name === 'From')?.value || '(unknown)',
        subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
        date: headers.find(h => h.name === 'Date')?.value || '',
        snippet: detail.data.snippet || '',
        unread: (detail.data.labelIds || []).includes('UNREAD'),
      });
    } catch { /* skip failed messages */ }
  }

  return messages;
}

/**
 * Search Gmail messages.
 * @param {string} userId
 * @param {string} query
 * @param {number} [maxResults=10]
 * @returns {Promise<Array>}
 */
async function searchGmail(userId, query, maxResults = 10) {
  const client = await googleAuth.getClient(userId);
  if (!client) return [];

  const gmail = google.gmail({ version: 'v1', auth: client });
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  if (!res.data.messages?.length) return [];

  const messages = [];
  for (const msg of res.data.messages.slice(0, maxResults)) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = detail.data.payload?.headers || [];
      messages.push({
        id: msg.id,
        from: headers.find(h => h.name === 'From')?.value || '',
        subject: headers.find(h => h.name === 'Subject')?.value || '',
        date: headers.find(h => h.name === 'Date')?.value || '',
        snippet: detail.data.snippet || '',
      });
    } catch { /* skip */ }
  }

  return messages;
}

/**
 * Get full email content.
 * @param {string} userId
 * @param {string} messageId
 * @returns {Promise<Object|null>}
 */
async function getEmailContent(userId, messageId) {
  const client = await googleAuth.getClient(userId);
  if (!client) return null;

  const gmail = google.gmail({ version: 'v1', auth: client });
  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = detail.data.payload?.headers || [];
  let body = '';

  // Extract plain text body
  function extractBody(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.parts) {
      for (const sub of part.parts) {
        const found = extractBody(sub);
        if (found) return found;
      }
    }
    return '';
  }

  body = extractBody(detail.data.payload) || detail.data.snippet || '';

  return {
    id: detail.data.id,
    threadId: detail.data.threadId,
    from: headers.find(h => h.name === 'From')?.value || '',
    to: headers.find(h => h.name === 'To')?.value || '',
    subject: headers.find(h => h.name === 'Subject')?.value || '',
    date: headers.find(h => h.name === 'Date')?.value || '',
    body,
    labels: detail.data.labelIds || [],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(dateStr).slice(0, 20);
  }
}

function extractName(fromStr) {
  if (!fromStr) return '?';
  const match = fromStr.match(/^([^<]+)</);
  return match ? match[1].trim() : fromStr.split('@')[0];
}

// ─── GenUI Builders ─────────────────────────────────────────────────────────

function buildInbox(messages, email) {
  const ops = [];

  ops.push(upsert('mail-header', 'stats', {
    title: `📬 ${email || 'Email'}`,
    items: [
      { label: 'Inbox', value: String(messages.length) },
      { label: 'Unread', value: String(messages.filter(m => m.unread).length) },
    ],
  }));

  if (messages.length > 0) {
    ops.push(upsert('mail-list', 'table', {
      title: 'Inbox',
      headers: ['', 'From', 'Subject', 'Date'],
      rows: messages.map(m => [
        m.unread ? '🔵' : '  ',
        truncate(extractName(m.from), 25),
        truncate(m.subject, 40),
        formatDate(m.date),
      ]),
    }));
  } else {
    ops.push(upsert('mail-list', 'card', {
      title: 'Inbox Empty',
      text: 'No messages in your inbox.',
    }));
  }

  ops.push(upsert('mail-actions', 'buttons', {
    buttons: [
      { label: '✉️ Compose', action: 'mail-compose', style: 'primary' },
      { label: '🔄 Refresh', action: 'mail-inbox', style: 'ghost' },
      { label: '📁 Drafts', action: 'mail-drafts', style: 'ghost' },
    ],
  }));

  return ops;
}

function buildComposeForm(prefill = {}) {
  return [
    upsert('mail-compose', 'form', {
      title: '✉️ Compose Email',
      id: 'email-compose-form',
      fields: [
        { name: 'to', type: 'email', label: 'To', placeholder: 'recipient@example.com', value: prefill.to || '' },
        { name: 'subject', type: 'text', label: 'Subject', placeholder: 'Email subject', value: prefill.subject || '' },
        { name: 'body', type: 'textarea', label: 'Message', placeholder: 'Write your message...', value: prefill.body || '' },
      ],
      actions: [
        // NOTE: "Send" saves as draft first, then the frontend Send button
        // in sc-email.js calls POST /api/emails/:id/send (REST-only, human-only).
        // The agent can pre-fill this form but CANNOT trigger send.
        { label: '💾 Save Draft', action: 'mail-save-draft', style: 'primary' },
        { label: '← Inbox', action: 'mail-inbox', style: 'ghost' },
      ],
    }),
  ];
}

function buildEmailView(email) {
  const ops = [];

  ops.push(upsert('mail-view-header', 'kv', {
    title: email.subject || '(no subject)',
    items: [
      { key: 'From', value: email.from },
      { key: 'To', value: email.to },
      { key: 'Date', value: formatDate(email.date) },
    ],
  }));

  ops.push(upsert('mail-view-body', 'card', {
    title: 'Message',
    text: email.body || '(empty)',
  }));

  ops.push(upsert('mail-view-actions', 'buttons', {
    buttons: [
      { label: '↩️ Reply', action: 'mail-compose', style: 'primary' },
      { label: '← Inbox', action: 'mail-inbox', style: 'ghost' },
    ],
  }));

  return ops;
}

function buildDraftsList(drafts) {
  const ops = [];

  if (drafts.length > 0) {
    ops.push(upsert('mail-drafts-list', 'table', {
      title: '📝 Drafts',
      headers: ['To', 'Subject', 'Updated'],
      rows: drafts.map(d => [
        truncate(d.to, 30) || '(no recipient)',
        truncate(d.subject, 40) || '(no subject)',
        formatDate(d.updatedAt),
      ]),
    }));
  } else {
    ops.push(upsert('mail-drafts-list', 'card', {
      title: '📝 Drafts',
      text: 'No drafts saved.',
    }));
  }

  ops.push(upsert('mail-drafts-actions', 'buttons', {
    buttons: [
      { label: '✉️ Compose', action: 'mail-compose', style: 'primary' },
      { label: '← Inbox', action: 'mail-inbox', style: 'ghost' },
    ],
  }));

  return ops;
}

function buildConnectPrompt() {
  return [
    upsert('mail-connect', 'card', {
      title: '📧 Connect Google Account',
      text: 'Connect your Google account to read and send emails.',
    }),
    upsert('mail-connect-btn', 'buttons', {
      buttons: [
        { label: '🔗 Connect Gmail', action: 'mail-connect', style: 'primary' },
      ],
    }),
  ];
}

// ─── Action Handlers ────────────────────────────────────────────────────────

async function handleInbox(userId) {
  const status = googleAuth.getStatus(userId);
  if (!status.connected) return buildConnectPrompt();

  try {
    const messages = await fetchInbox(userId);
    return buildInbox(messages, status.email);
  } catch (err) {
    console.error('[email] Inbox fetch error:', err.message);
    if (err.message?.includes('invalid_grant')) {
      return [
        toast('Google session expired. Please reconnect.', 'error'),
        ...buildConnectPrompt(),
      ];
    }
    return [toast(`Failed to load inbox: ${err.message}`, 'error')];
  }
}

async function handleSearch(userId, context) {
  const query = context.query || context.q || '';
  if (!query) return [toast('Search query required', 'error')];

  const status = googleAuth.getStatus(userId);
  if (!status.connected) return buildConnectPrompt();

  try {
    const messages = await searchGmail(userId, String(query));
    return buildInbox(messages, `Search: ${truncate(query, 30)}`);
  } catch (err) {
    return [toast(`Search failed: ${err.message}`, 'error')];
  }
}

async function handleRead(userId, context) {
  const messageId = context.id || context.messageId || '';
  if (!messageId) return [toast('Message ID required', 'error')];

  const status = googleAuth.getStatus(userId);
  if (!status.connected) return buildConnectPrompt();

  try {
    const email = await getEmailContent(userId, String(messageId));
    if (!email) return [toast('Message not found', 'error')];
    return buildEmailView(email);
  } catch (err) {
    return [toast(`Failed to load message: ${err.message}`, 'error')];
  }
}

function handleCompose(userId, context) {
  // Agent can pre-fill to, subject, body — but CANNOT send
  return buildComposeForm({
    to: context.to || '',
    subject: context.subject || '',
    body: context.body || '',
  });
}

function handleSaveDraft(userId, context) {
  const draft = saveDraft(userId, {
    to: context.to ? String(context.to) : '',
    subject: context.subject ? String(context.subject) : '',
    body: context.body ? String(context.body) : '',
  });

  return [
    toast('Draft saved', 'success'),
    ...buildComposeForm(draft),
  ];
}

function handleDrafts(userId) {
  const drafts = listDrafts(userId);
  return buildDraftsList(drafts);
}

function handleDelete(userId, context) {
  const draftId = context.id ? String(context.id) : null;
  if (!draftId) return [toast('Draft ID required', 'error')];
  if (!deleteDraft(draftId, userId)) return [toast('Draft not found', 'error')];
  return [toast('Draft deleted', 'success'), ...buildDraftsList(listDrafts(userId))];
}

function handleConnect(userId) {
  if (!googleAuth.isConfigured()) {
    return [toast('Google OAuth not configured on this server', 'error')];
  }
  const url = googleAuth.getAuthUrl(userId);
  // Return a link-card so the user can click through to Google consent
  return [
    upsert('mail-oauth', 'link-card', {
      title: '🔗 Connect Gmail',
      description: 'Click to authorize Scratchy to read your emails',
      url,
      icon: '📧',
    }),
  ];
}

function handleStatus(userId) {
  const status = googleAuth.getStatus(userId);
  return [
    upsert('mail-status', 'kv', {
      title: '📧 Email Status',
      items: [
        { key: 'Connected', value: status.connected ? '✅ Yes' : '❌ No' },
        { key: 'Account', value: status.email || '—' },
      ],
    }),
  ];
}

// ─── Widget Definition ──────────────────────────────────────────────────────

/** @type {import('./framework.js').WidgetDef} */
export const emailWidget = {
  prefix: 'mail',
  name: 'Email',

  init(ctx) {
    db = ctx.db;
    broadcast = (userId, ops) => ctx.broadcast(userId, ops);
    ensureTable(db);

    // Note: Google OAuth init happens in server/index.js, not here.
    // This widget only reads via googleAuth.getClient() — never sends.
    console.log('[email] Widget initialized (send = REST-only, human-only)');
  },

  handleAction(userId, action, context) {
    switch (action) {
      case 'mail-inbox':      return handleInbox(userId);
      case 'mail-search':     return handleSearch(userId, context);
      case 'mail-read':       return handleRead(userId, context);
      case 'mail-compose':    return handleCompose(userId, context);
      case 'mail-save-draft': return handleSaveDraft(userId, context);
      case 'mail-drafts':     return handleDrafts(userId);
      case 'mail-delete':     return handleDelete(userId, context);
      case 'mail-connect':    return handleConnect(userId);
      case 'mail-status':     return handleStatus(userId);

      // SECURITY: No mail-send action exists here. Intentional.
      // Send is ONLY in POST /api/emails/:id/send (routes/widgets.js).

      default:
        return [toast(`Unknown email action: ${action}`, 'error')];
    }
  },

  destroy() {
    db = null;
    broadcast = null;
  },
};
