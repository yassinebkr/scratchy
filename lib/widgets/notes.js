/**
 * @module lib/widgets/notes
 * Notes widget for Scratchy v2.
 *
 * Provides a simple note-taking system with CRUD operations.
 * Supports both user-facing canvas actions and agent-driven
 * read/edit/append actions for AI assistants.
 *
 * Actions:
 *   sn-list         — List all notes for the user
 *   sn-save-note    — Create or update a note
 *   sn-delete       — Delete a note by index or ID
 *   sn-agent-read   — Agent reads a specific note (returns content)
 *   sn-agent-edit   — Agent replaces a note's title/content
 *   sn-agent-append — Agent appends text to a note
 *
 * @example
 * ```js
 * import { notesWidget } from './notes.js';
 * registry.register(notesWidget);
 * ```
 */

import crypto from 'node:crypto';
import { upsert, patch, remove, toast } from './framework.js';

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {import('better-sqlite3').Database} */
let db;

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Ensure the `notes` table exists.
 * @param {import('better-sqlite3').Database} database
 */
function ensureTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      title     TEXT NOT NULL DEFAULT 'Untitled',
      content   TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notes_userId ON notes(userId);
    CREATE INDEX IF NOT EXISTS idx_notes_updatedAt ON notes(updatedAt);
  `);
}

// ─── Data Access ────────────────────────────────────────────────────────────

/**
 * Get all notes for a user, ordered by most recently updated.
 * @param {string} userId
 * @returns {Array<{id: string, title: string, content: string, createdAt: string, updatedAt: string}>}
 */
function listNotes(userId) {
  return db.prepare(
    'SELECT id, title, content, createdAt, updatedAt FROM notes WHERE userId = ? ORDER BY updatedAt DESC'
  ).all(userId);
}

/**
 * Get a single note by ID.
 * @param {string} noteId
 * @param {string} userId
 * @returns {Object|undefined}
 */
function getNoteById(noteId, userId) {
  return db.prepare(
    'SELECT id, title, content, createdAt, updatedAt FROM notes WHERE id = ? AND userId = ?'
  ).get(noteId, userId);
}

/**
 * Get a note by its index in the user's list (0-based, ordered by updatedAt DESC).
 * @param {string} userId
 * @param {number} index
 * @returns {Object|undefined}
 */
function getNoteByIndex(userId, index) {
  const notes = listNotes(userId);
  return notes[index];
}

/**
 * Create a new note.
 * @param {string} userId
 * @param {string} title
 * @param {string} content
 * @returns {Object}
 */
function createNote(userId, title, content) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO notes (id, userId, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, userId, title, content, now, now);
  return { id, title, content, createdAt: now, updatedAt: now };
}

/**
 * Update an existing note.
 * @param {string} noteId
 * @param {string} userId
 * @param {Object} fields
 * @param {string} [fields.title]
 * @param {string} [fields.content]
 * @returns {Object|undefined}
 */
function updateNote(noteId, userId, fields) {
  const sets = [];
  const values = [];

  if (fields.title !== undefined) {
    sets.push('title = ?');
    values.push(fields.title);
  }
  if (fields.content !== undefined) {
    sets.push('content = ?');
    values.push(fields.content);
  }

  if (sets.length === 0) return getNoteById(noteId, userId);

  sets.push('updatedAt = ?');
  values.push(new Date().toISOString());
  values.push(noteId, userId);

  db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND userId = ?`).run(...values);
  return getNoteById(noteId, userId);
}

/**
 * Delete a note.
 * @param {string} noteId
 * @param {string} userId
 * @returns {boolean}
 */
function deleteNote(noteId, userId) {
  const result = db.prepare('DELETE FROM notes WHERE id = ? AND userId = ?').run(noteId, userId);
  return result.changes > 0;
}

// ─── GenUI Builders ─────────────────────────────────────────────────────────

/**
 * Build the note list view as GenUI ops.
 * @param {Array<Object>} notes
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildNoteList(notes) {
  if (notes.length === 0) {
    return [
      upsert('sn-empty', 'card', {
        title: '📝 No Notes Yet',
        text: 'Create your first note to get started.',
      }),
      upsert('sn-actions', 'buttons', {
        title: 'Notes',
        buttons: [
          { label: '+ New Note', action: 'sn-save-note', style: 'primary' },
        ],
      }),
    ];
  }

  /** @type {import('./framework.js').GenUIOp[]} */
  const ops = [];

  // Summary stats
  ops.push(upsert('sn-header', 'stats', {
    title: '📝 Notes',
    items: [
      { label: 'Total', value: String(notes.length) },
      { label: 'Last Updated', value: formatDate(notes[0].updatedAt) },
    ],
  }));

  // Note list as a table
  ops.push(upsert('sn-list', 'table', {
    title: 'Your Notes',
    headers: ['#', 'Title', 'Updated'],
    rows: notes.map((n, i) => [
      String(i + 1),
      n.title || 'Untitled',
      formatDate(n.updatedAt),
    ]),
  }));

  // Action buttons
  ops.push(upsert('sn-actions', 'buttons', {
    title: 'Actions',
    buttons: [
      { label: '+ New Note', action: 'sn-save-note', style: 'primary' },
    ],
  }));

  return ops;
}

/**
 * Format an ISO date string for display.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoDate.slice(0, 10);
  }
}

// ─── Action Handlers ────────────────────────────────────────────────────────

/**
 * Handle sn-list: show all notes for the user.
 * @param {string} userId
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleList(userId) {
  const notes = listNotes(userId);
  return buildNoteList(notes);
}

/**
 * Handle sn-save-note: create or update a note.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleSave(userId, context) {
  const { id, title = 'Untitled', content = '' } = context;

  if (id) {
    // Update existing
    const note = updateNote(String(id), userId, {
      title: String(title),
      content: String(content),
    });
    if (!note) {
      return [toast('Note not found', 'error')];
    }
    return [
      toast('Note updated', 'success'),
      ...buildNoteList(listNotes(userId)),
    ];
  }

  // Create new
  createNote(userId, String(title), String(content));
  return [
    toast('Note created', 'success'),
    ...buildNoteList(listNotes(userId)),
  ];
}

/**
 * Handle sn-delete: delete a note by ID or index.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleDelete(userId, context) {
  let noteId = context.id ? String(context.id) : null;

  // Support deletion by index
  if (!noteId && context.index !== undefined) {
    const note = getNoteByIndex(userId, Number(context.index));
    if (note) noteId = note.id;
  }

  if (!noteId) {
    return [toast('Note ID or index required', 'error')];
  }

  const deleted = deleteNote(noteId, userId);
  if (!deleted) {
    return [toast('Note not found', 'error')];
  }

  return [
    toast('Note deleted', 'success'),
    ...buildNoteList(listNotes(userId)),
  ];
}

/**
 * Handle sn-agent-read: agent reads a specific note by index.
 * Returns the note content as a card for the agent to see.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleAgentRead(userId, context) {
  const index = context.index !== undefined ? Number(context.index) : 0;
  const note = getNoteByIndex(userId, index);

  if (!note) {
    return [toast(`No note at index ${index}`, 'error')];
  }

  return [
    upsert('sn-reading', 'card', {
      title: `📖 ${note.title}`,
      text: note.content || '(empty)',
    }),
    upsert('sn-reading-meta', 'kv', {
      title: 'Note Details',
      items: [
        { key: 'ID', value: note.id },
        { key: 'Created', value: formatDate(note.createdAt) },
        { key: 'Updated', value: formatDate(note.updatedAt) },
      ],
    }),
  ];
}

/**
 * Handle sn-agent-edit: agent replaces a note's title and/or content.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleAgentEdit(userId, context) {
  const index = context.index !== undefined ? Number(context.index) : null;
  let noteId = context.id ? String(context.id) : null;

  if (!noteId && index !== null) {
    const note = getNoteByIndex(userId, index);
    if (note) noteId = note.id;
  }

  if (!noteId) {
    return [toast('Note ID or index required for edit', 'error')];
  }

  const fields = {};
  if (context.title !== undefined) fields.title = String(context.title);
  if (context.content !== undefined) fields.content = String(context.content);

  const updated = updateNote(noteId, userId, fields);
  if (!updated) {
    return [toast('Note not found', 'error')];
  }

  return [
    toast('Note updated by agent', 'success'),
    ...buildNoteList(listNotes(userId)),
  ];
}

/**
 * Handle sn-agent-append: agent appends text to an existing note.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleAgentAppend(userId, context) {
  const index = context.index !== undefined ? Number(context.index) : null;
  let noteId = context.id ? String(context.id) : null;

  if (!noteId && index !== null) {
    const note = getNoteByIndex(userId, index);
    if (note) noteId = note.id;
  }

  if (!noteId) {
    return [toast('Note ID or index required for append', 'error')];
  }

  const existing = getNoteById(noteId, userId);
  if (!existing) {
    return [toast('Note not found', 'error')];
  }

  const separator = context.separator !== undefined ? String(context.separator) : '\n\n';
  const appendText = String(context.text || '');
  const newContent = existing.content
    ? existing.content + separator + appendText
    : appendText;

  updateNote(noteId, userId, { content: newContent });

  return [
    toast('Text appended to note', 'success'),
    ...buildNoteList(listNotes(userId)),
  ];
}

// ─── Widget Definition ──────────────────────────────────────────────────────

/** @type {import('./framework.js').WidgetDef} */
export const notesWidget = {
  prefix: 'sn',
  name: 'Notes',

  /**
   * Initialize the notes widget — ensure DB table exists.
   * @param {import('./framework.js').WidgetContext} ctx
   */
  init(ctx) {
    db = ctx.db;
    ensureTable(db);
    console.log('[notes] Widget initialized');
  },

  /**
   * Route an action to the appropriate handler.
   * @param {string} userId
   * @param {string} action
   * @param {Record<string, unknown>} context
   * @returns {import('./framework.js').GenUIOp[]}
   */
  handleAction(userId, action, context) {
    switch (action) {
      case 'sn-list':
        return handleList(userId);
      case 'sn-save-note':
        return handleSave(userId, context);
      case 'sn-delete':
        return handleDelete(userId, context);
      case 'sn-agent-read':
        return handleAgentRead(userId, context);
      case 'sn-agent-edit':
        return handleAgentEdit(userId, context);
      case 'sn-agent-append':
        return handleAgentAppend(userId, context);
      default:
        return [toast(`Unknown notes action: ${action}`, 'error')];
    }
  },

  /**
   * Cleanup (no-op for notes).
   */
  destroy() {
    db = null;
  },
};
