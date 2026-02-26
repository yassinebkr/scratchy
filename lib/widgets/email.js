/**
 * @module lib/widgets/email
 * Email widget for Scratchy v2.
 *
 * Provides email compose, send, inbox view, and deletion.
 * Uses the Resend API (https://api.resend.com) via native fetch.
 * Sent emails are logged in SQLite for inbox display.
 *
 * Actions:
 *   mail-inbox   — Show sent/received email log
 *   mail-compose — Show the compose form
 *   mail-send    — Send an email via Resend API
 *   mail-delete  — Delete an email from the log
 *
 * @example
 * ```js
 * import { emailWidget } from './email.js';
 * registry.register(emailWidget);
 * ```
 */

import crypto from 'node:crypto';
import { upsert, toast } from './framework.js';

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {import('better-sqlite3').Database} */
let db;

/** @type {string} Resend API key */
let resendApiKey = '';

/** @type {string} Default sender address */
let senderAddress = 'onboarding@resend.dev';

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Ensure the `emails` table exists.
 * @param {import('better-sqlite3').Database} database
 */
function ensureTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      "to"      TEXT NOT NULL,
      subject   TEXT NOT NULL DEFAULT '(no subject)',
      body      TEXT NOT NULL DEFAULT '',
      sentAt    TEXT,
      status    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','failed')),
      resendId  TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_emails_userId ON emails(userId);
    CREATE INDEX IF NOT EXISTS idx_emails_sentAt ON emails(sentAt);
  `);
}

// ─── Data Access ────────────────────────────────────────────────────────────

/**
 * List emails for a user, most recent first.
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Array<Object>}
 */
function listEmails(userId, limit = 20) {
  return db.prepare(
    'SELECT * FROM emails WHERE userId = ? ORDER BY createdAt DESC LIMIT ?'
  ).all(userId, limit);
}

/**
 * Get a single email by ID.
 * @param {string} emailId
 * @param {string} userId
 * @returns {Object|undefined}
 */
function getEmailById(emailId, userId) {
  return db.prepare(
    'SELECT * FROM emails WHERE id = ? AND userId = ?'
  ).get(emailId, userId);
}

/**
 * Insert an email record.
 * @param {string} userId
 * @param {Object} fields
 * @returns {Object}
 */
function insertEmail(userId, fields) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO emails (id, userId, "to", subject, body, sentAt, status, resendId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    fields.to,
    fields.subject || '(no subject)',
    fields.body || '',
    fields.sentAt || null,
    fields.status || 'draft',
    fields.resendId || null,
    now,
  );

  return getEmailById(id, userId);
}

/**
 * Update an email's status.
 * @param {string} emailId
 * @param {string} status
 * @param {string} [resendId]
 * @param {string} [sentAt]
 */
function updateEmailStatus(emailId, status, resendId, sentAt) {
  const sets = ['status = ?'];
  const values = [status];
  if (resendId) { sets.push('resendId = ?'); values.push(resendId); }
  if (sentAt) { sets.push('sentAt = ?'); values.push(sentAt); }
  values.push(emailId);

  db.prepare(`UPDATE emails SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Delete an email.
 * @param {string} emailId
 * @param {string} userId
 * @returns {boolean}
 */
function deleteEmail(emailId, userId) {
  const result = db.prepare(
    'DELETE FROM emails WHERE id = ? AND userId = ?'
  ).run(emailId, userId);
  return result.changes > 0;
}

// ─── Resend API ─────────────────────────────────────────────────────────────

/**
 * Send an email via the Resend API.
 * @param {Object} params
 * @param {string} params.to - Recipient address
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Plain text body
 * @param {string} [params.from] - Sender address override
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
async function sendViaResend({ to, subject, body, from }) {
  if (!resendApiKey) {
    return { success: false, error: 'Resend API key not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || senderAddress,
        to: [to],
        subject,
        text: body,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[email] Resend API error:', res.status, errBody);
      return { success: false, error: `Resend API ${res.status}: ${errBody}` };
    }

    const data = await res.json();
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[email] Resend API fetch error:', err);
    return { success: false, error: err.message };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Truncate a string for display.
 * @param {string} str
 * @param {number} [max=60]
 * @returns {string}
 */
function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/**
 * Format date for display.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoDate.slice(0, 16);
  }
}

/**
 * Status badge emoji.
 * @param {string} status
 * @returns {string}
 */
function statusIcon(status) {
  switch (status) {
    case 'sent': return '✅';
    case 'failed': return '❌';
    case 'draft': return '📝';
    default: return '📧';
  }
}

// ─── GenUI Builders ─────────────────────────────────────────────────────────

/**
 * Build the inbox view.
 * @param {Array<Object>} emails
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildInbox(emails) {
  const ops = [];

  const sentCount = emails.filter(e => e.status === 'sent').length;
  const failedCount = emails.filter(e => e.status === 'failed').length;

  ops.push(upsert('mail-header', 'stats', {
    title: '📬 Email',
    items: [
      { label: 'Total', value: String(emails.length) },
      { label: 'Sent', value: String(sentCount) },
      { label: 'Failed', value: String(failedCount) },
    ],
  }));

  if (emails.length > 0) {
    ops.push(upsert('mail-list', 'table', {
      title: 'Email Log',
      headers: ['Status', 'To', 'Subject', 'Date'],
      rows: emails.map(e => [
        statusIcon(e.status),
        truncate(e.to, 30),
        truncate(e.subject, 40),
        formatDate(e.sentAt || e.createdAt),
      ]),
    }));
  } else {
    ops.push(upsert('mail-list', 'card', {
      title: 'No Emails',
      text: 'Your email log is empty. Compose your first email!',
    }));
  }

  ops.push(upsert('mail-actions', 'buttons', {
    title: 'Actions',
    buttons: [
      { label: '✉️ Compose', action: 'mail-compose', style: 'primary' },
      { label: '🔄 Refresh', action: 'mail-inbox', style: 'ghost' },
    ],
  }));

  return ops;
}

/**
 * Build the compose form.
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildComposeForm() {
  return [
    upsert('mail-compose', 'form', {
      title: '✉️ Compose Email',
      id: 'email-compose-form',
      fields: [
        { name: 'to', type: 'email', label: 'To', placeholder: 'recipient@example.com' },
        { name: 'subject', type: 'text', label: 'Subject', placeholder: 'Email subject' },
        { name: 'body', type: 'textarea', label: 'Message', placeholder: 'Write your message...' },
      ],
      actions: [
        { label: 'Send', action: 'mail-send', style: 'primary' },
        { label: 'Cancel', action: 'mail-inbox', style: 'ghost' },
      ],
    }),
  ];
}

// ─── Action Handlers ────────────────────────────────────────────────────────

/**
 * Handle mail-inbox: show the email log.
 * @param {string} userId
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleInbox(userId) {
  const emails = listEmails(userId);
  return buildInbox(emails);
}

/**
 * Handle mail-compose: show the compose form.
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleCompose() {
  return buildComposeForm();
}

/**
 * Handle mail-send: send an email via Resend.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {Promise<import('./framework.js').GenUIOp[]>}
 */
async function handleSend(userId, context) {
  const { to, subject, body } = context;

  if (!to) {
    return [toast('Recipient address is required', 'error')];
  }

  // Create draft record first
  const email = insertEmail(userId, {
    to: String(to),
    subject: subject ? String(subject) : '(no subject)',
    body: body ? String(body) : '',
    status: 'draft',
  });

  // Attempt to send via Resend
  const result = await sendViaResend({
    to: String(to),
    subject: subject ? String(subject) : '(no subject)',
    body: body ? String(body) : '',
  });

  if (result.success) {
    updateEmailStatus(email.id, 'sent', result.id, new Date().toISOString());
    return [
      toast('Email sent successfully!', 'success'),
      ...buildInbox(listEmails(userId)),
    ];
  }

  updateEmailStatus(email.id, 'failed');
  return [
    toast(`Failed to send: ${result.error}`, 'error'),
    ...buildInbox(listEmails(userId)),
  ];
}

/**
 * Handle mail-delete: remove an email from the log.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleDelete(userId, context) {
  const emailId = context.id ? String(context.id) : null;

  if (!emailId) {
    return [toast('Email ID required', 'error')];
  }

  const deleted = deleteEmail(emailId, userId);
  if (!deleted) {
    return [toast('Email not found', 'error')];
  }

  return [
    toast('Email deleted', 'success'),
    ...buildInbox(listEmails(userId)),
  ];
}

// ─── Widget Definition ──────────────────────────────────────────────────────

/** @type {import('./framework.js').WidgetDef} */
export const emailWidget = {
  prefix: 'mail',
  name: 'Email',

  /**
   * Initialize the email widget.
   * @param {import('./framework.js').WidgetContext} ctx
   */
  init(ctx) {
    db = ctx.db;
    ensureTable(db);

    // Read Resend API key from config
    resendApiKey = ctx.config.resendApiKey || '';
    senderAddress = ctx.config.senderAddress || 'onboarding@resend.dev';

    if (!resendApiKey) {
      console.warn('[email] No Resend API key configured — email sending will fail');
    }
    console.log('[email] Widget initialized');
  },

  /**
   * Route an action to the appropriate handler.
   * @param {string} userId
   * @param {string} action
   * @param {Record<string, unknown>} context
   * @returns {import('./framework.js').GenUIOp[]|Promise<import('./framework.js').GenUIOp[]>}
   */
  handleAction(userId, action, context) {
    switch (action) {
      case 'mail-inbox':
        return handleInbox(userId);
      case 'mail-compose':
        return handleCompose();
      case 'mail-send':
        return handleSend(userId, context);
      case 'mail-delete':
        return handleDelete(userId, context);
      default:
        return [toast(`Unknown email action: ${action}`, 'error')];
    }
  },

  /**
   * Cleanup.
   */
  destroy() {
    db = null;
    resendApiKey = '';
  },
};
