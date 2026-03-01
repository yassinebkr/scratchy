/**
 * @module state/workspaces
 * Named workspace persistence backed by SQLite.
 * Users can save/load/switch between named canvas layouts.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the workspaces module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
  _seedTemplates();
}

function d() {
  if (!db) throw new Error('workspaces.init(db) must be called before using the workspace store');
  return db;
}

/* ------------------------------------------------------------------ */
/*  Pre-built workspace templates                                     */
/* ------------------------------------------------------------------ */

const BUILTIN_TEMPLATES = [
  {
    key: 'dashboard',
    name: 'Dashboard',
    description: 'Overview workspace with stats, quick actions, and activity feed',
    icon: '📊',
    category: 'general',
    tier: 'free',
    sortOrder: 1,
    layoutMode: 'auto',
    ops: [
      { op: 'upsert', id: 'ws-greeting', type: 'hero', data: { title: 'Welcome back', subtitle: 'Your workspace overview', badge: 'Dashboard', gradient: true } },
      { op: 'upsert', id: 'ws-stats', type: 'stats', data: { title: 'Today', items: [{ label: 'Messages', value: '0' }, { label: 'Tasks', value: '0' }, { label: 'Active Agents', value: '1' }] } },
      { op: 'upsert', id: 'ws-actions', type: 'buttons', data: { title: 'Quick Actions', buttons: [{ label: 'New Chat', action: 'new-chat', style: 'primary' }, { label: 'Browse Agents', action: 'agents', style: 'ghost' }, { label: 'Notes', action: 'open-notes', style: 'ghost' }] } },
    ],
    surfaces: ['canvas', 'chat'],
  },
  {
    key: 'dev',
    name: 'Developer',
    description: 'Code-focused layout with terminal, file tree, and editor surfaces',
    icon: '💻',
    category: 'development',
    tier: 'free',
    sortOrder: 2,
    layoutMode: 'columns',
    ops: [
      { op: 'upsert', id: 'ws-dev-header', type: 'hero', data: { title: 'Dev Workspace', subtitle: 'Terminal + Files + Code', badge: 'DEV', icon: '💻' }, layout: { zone: 'full' } },
      { op: 'upsert', id: 'ws-dev-actions', type: 'buttons', data: { title: 'Tools', buttons: [{ label: 'Terminal', action: 'open-terminal', style: 'primary' }, { label: 'Files', action: 'open-files', style: 'ghost' }, { label: 'Editor', action: 'open-editor', style: 'ghost' }] } },
    ],
    surfaces: ['terminal', 'filetree', 'editor', 'chat'],
  },
  {
    key: 'writing',
    name: 'Writing',
    description: 'Distraction-free writing environment with notes and a clean canvas',
    icon: '✍️',
    category: 'creative',
    tier: 'free',
    sortOrder: 3,
    layoutMode: 'focus',
    ops: [
      { op: 'upsert', id: 'ws-write-header', type: 'hero', data: { title: 'Writing Studio', subtitle: 'Focus mode — minimal distractions', icon: '✍️' }, layout: { zone: 'full' } },
      { op: 'upsert', id: 'ws-write-tools', type: 'buttons', data: { title: 'Quick Access', buttons: [{ label: 'Notes', action: 'open-notes', style: 'primary' }, { label: 'New Note', action: 'new-note', style: 'ghost' }] } },
    ],
    surfaces: ['canvas', 'chat'],
  },
  {
    key: 'research',
    name: 'Research',
    description: 'Research workspace with web search, notes, and reference management',
    icon: '🔍',
    category: 'research',
    tier: 'free',
    sortOrder: 4,
    layoutMode: 'columns',
    ops: [
      { op: 'upsert', id: 'ws-research-header', type: 'hero', data: { title: 'Research Hub', subtitle: 'Search, collect, and organize findings', badge: 'RESEARCH', icon: '🔍' }, layout: { zone: 'full' } },
      { op: 'upsert', id: 'ws-research-actions', type: 'buttons', data: { title: 'Tools', buttons: [{ label: 'Web Search', action: 'web-search', style: 'primary' }, { label: 'Notes', action: 'open-notes', style: 'ghost' }, { label: 'Bookmarks', action: 'open-bookmarks', style: 'ghost' }] } },
      { op: 'upsert', id: 'ws-research-tips', type: 'card', data: { title: 'Tip', text: 'Ask your agent to research a topic — results appear here as tiles you can pin.' } },
    ],
    surfaces: ['canvas', 'chat'],
  },
  {
    key: 'design',
    name: 'Design Studio',
    description: 'Visual workspace for UI design iteration with Iris',
    icon: '🎨',
    category: 'creative',
    tier: 'pro',
    sortOrder: 5,
    layoutMode: 'auto',
    ops: [
      { op: 'upsert', id: 'ws-design-header', type: 'hero', data: { title: 'Design Studio', subtitle: 'Iterate on visuals with your design agent', badge: 'DESIGN', icon: '🎨', gradient: true } },
      { op: 'upsert', id: 'ws-design-actions', type: 'buttons', data: { title: 'Canvas', buttons: [{ label: 'Clear Canvas', action: 'canvas-clear', style: 'ghost' }, { label: 'Export', action: 'export-canvas', style: 'ghost' }] } },
    ],
    surfaces: ['canvas', 'chat'],
  },
  {
    key: 'data',
    name: 'Data Analysis',
    description: 'Charts, tables, and data visualization workspace',
    icon: '📈',
    category: 'analysis',
    tier: 'pro',
    sortOrder: 6,
    layoutMode: 'auto',
    ops: [
      { op: 'upsert', id: 'ws-data-header', type: 'hero', data: { title: 'Data Lab', subtitle: 'Visualize, analyze, and present data', badge: 'DATA', icon: '📈', gradient: true } },
      { op: 'upsert', id: 'ws-data-placeholder', type: 'card', data: { title: 'Getting Started', text: 'Paste data or ask your agent to generate charts. Tiles appear here as interactive visualizations.' } },
    ],
    surfaces: ['canvas', 'chat'],
  },
];

/**
 * Seed built-in workspace templates (idempotent).
 */
function _seedTemplates() {
  const stmt = d().prepare(`
    INSERT OR REPLACE INTO workspace_templates (key, name, description, icon, category, ops, surfaces, layoutMode, tier, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const tx = d().transaction(() => {
    for (const t of BUILTIN_TEMPLATES) {
      stmt.run(
        t.key, t.name, t.description, t.icon, t.category,
        JSON.stringify(t.ops), JSON.stringify(t.surfaces),
        t.layoutMode, t.tier, t.sortOrder
      );
    }
  });
  tx();
}

/* ------------------------------------------------------------------ */
/*  Workspace CRUD                                                    */
/* ------------------------------------------------------------------ */

/**
 * List all workspaces for a user.
 * @param {string} userId
 * @returns {object[]}
 */
export function listWorkspaces(userId) {
  const rows = d().prepare(
    'SELECT * FROM workspaces WHERE userId = ? ORDER BY isDefault DESC, updatedAt DESC'
  ).all(userId);

  return rows.map(_parseRow);
}

/**
 * Get a single workspace by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getWorkspace(id) {
  const row = d().prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  return row ? _parseRow(row) : null;
}

/**
 * Create a new workspace.
 * @param {string} userId
 * @param {object} data
 * @returns {object}
 */
export function createWorkspace(userId, data) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  d().prepare(`
    INSERT INTO workspaces (id, userId, name, description, icon, ops, surfaces, layoutMode, isDefault, templateKey, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId,
    data.name || 'Untitled Workspace',
    data.description || '',
    data.icon || '📐',
    JSON.stringify(data.ops || []),
    JSON.stringify(data.surfaces || []),
    data.layoutMode || 'auto',
    data.isDefault ? 1 : 0,
    data.templateKey || null,
    now, now
  );

  // If this is set as default, unset others
  if (data.isDefault) {
    d().prepare(
      'UPDATE workspaces SET isDefault = 0 WHERE userId = ? AND id != ?'
    ).run(userId, id);
  }

  return getWorkspace(id);
}

/**
 * Update a workspace.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
export function updateWorkspace(id, updates) {
  const ws = getWorkspace(id);
  if (!ws) return null;

  const fields = [];
  const values = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.icon !== undefined) { fields.push('icon = ?'); values.push(updates.icon); }
  if (updates.ops !== undefined) { fields.push('ops = ?'); values.push(JSON.stringify(updates.ops)); }
  if (updates.surfaces !== undefined) { fields.push('surfaces = ?'); values.push(JSON.stringify(updates.surfaces)); }
  if (updates.layoutMode !== undefined) { fields.push('layoutMode = ?'); values.push(updates.layoutMode); }
  if (updates.isDefault !== undefined) { fields.push('isDefault = ?'); values.push(updates.isDefault ? 1 : 0); }

  if (fields.length === 0) return ws;

  fields.push("updatedAt = datetime('now')");
  values.push(id);

  d().prepare(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // If setting as default, unset others
  if (updates.isDefault) {
    d().prepare(
      'UPDATE workspaces SET isDefault = 0 WHERE userId = ? AND id != ?'
    ).run(ws.userId, id);
  }

  return getWorkspace(id);
}

/**
 * Delete a workspace.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteWorkspace(id) {
  const result = d().prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Set a workspace as the active/default one for a user.
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {boolean}
 */
export function activateWorkspace(userId, workspaceId) {
  const ws = getWorkspace(workspaceId);
  if (!ws || ws.userId !== userId) return false;

  const tx = d().transaction(() => {
    d().prepare('UPDATE workspaces SET isDefault = 0 WHERE userId = ?').run(userId);
    d().prepare("UPDATE workspaces SET isDefault = 1, updatedAt = datetime('now') WHERE id = ?").run(workspaceId);
  });
  tx();

  return true;
}

/**
 * Get the active (default) workspace for a user.
 * @param {string} userId
 * @returns {object|null}
 */
export function getActiveWorkspace(userId) {
  const row = d().prepare(
    'SELECT * FROM workspaces WHERE userId = ? AND isDefault = 1'
  ).get(userId);
  return row ? _parseRow(row) : null;
}

/**
 * Create a workspace from a template.
 * @param {string} userId
 * @param {string} templateKey
 * @param {string} [name] — override template name
 * @returns {object}
 */
export function createFromTemplate(userId, templateKey, name) {
  const template = getTemplate(templateKey);
  if (!template) throw new Error(`Template '${templateKey}' not found`);

  return createWorkspace(userId, {
    name: name || template.name,
    description: template.description,
    icon: template.icon,
    ops: template.ops,
    surfaces: template.surfaces,
    layoutMode: template.layoutMode,
    templateKey: template.key,
  });
}

/**
 * Save the current canvas state as a new workspace (snapshot).
 * @param {string} userId
 * @param {string} name
 * @param {object} currentState — { ops, surfaces, layoutMode }
 * @returns {object}
 */
export function saveCurrentAsWorkspace(userId, name, currentState) {
  return createWorkspace(userId, {
    name,
    ops: currentState.ops || [],
    surfaces: currentState.surfaces || [],
    layoutMode: currentState.layoutMode || 'auto',
    icon: '💾',
  });
}

/* ------------------------------------------------------------------ */
/*  Templates                                                         */
/* ------------------------------------------------------------------ */

/**
 * List all workspace templates.
 * @param {string} [userTier='free'] — filter templates by user's plan tier
 * @returns {object[]}
 */
export function listTemplates(userTier = 'free') {
  const tierOrder = { free: 0, pro: 1, max: 2 };
  const userLevel = tierOrder[userTier] ?? 0;

  const rows = d().prepare(
    'SELECT * FROM workspace_templates ORDER BY sortOrder ASC'
  ).all();

  return rows.map(r => {
    const parsed = _parseTemplateRow(r);
    parsed.locked = (tierOrder[parsed.tier] ?? 0) > userLevel;
    return parsed;
  });
}

/**
 * Get a single template by key.
 * @param {string} key
 * @returns {object|null}
 */
export function getTemplate(key) {
  const row = d().prepare('SELECT * FROM workspace_templates WHERE key = ?').get(key);
  return row ? _parseTemplateRow(row) : null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function _parseRow(row) {
  return {
    ...row,
    ops: _safeJsonParse(row.ops, []),
    surfaces: _safeJsonParse(row.surfaces, []),
    isDefault: !!row.isDefault,
  };
}

function _parseTemplateRow(row) {
  return {
    ...row,
    ops: _safeJsonParse(row.ops, []),
    surfaces: _safeJsonParse(row.surfaces, []),
  };
}

function _safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
