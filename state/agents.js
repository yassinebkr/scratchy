/**
 * @module state/agents
 * Agent definitions store backed by SQLite.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the agents module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('agents.init(db) must be called before using the agent store');
  return db;
}

/** JSON fields that should be parsed on read */
const JSON_FIELDS = ['surfaces', 'mcpServers', 'skills'];

/**
 * Parse JSON fields in an agent row.
 * @param {Object} row
 * @returns {Object} Row with parsed JSON fields
 */
function parseRow(row) {
  if (!row) return undefined;
  const parsed = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof parsed[field] === 'string') {
      try { parsed[field] = JSON.parse(parsed[field]); } catch { parsed[field] = []; }
    }
  }
  return parsed;
}

/**
 * Create a new agent.
 * @param {string} name - Agent name (must be non-empty)
 * @param {Object} [opts]
 * @param {string} [opts.systemPrompt='']
 * @param {string} [opts.model='sonnet']
 * @param {number} [opts.temperature=0.7]
 * @param {any[]} [opts.surfaces=[]]
 * @param {any[]} [opts.mcpServers=[]]
 * @param {any[]} [opts.skills=[]]
 * @param {string|null} [opts.avatar=null]
 * @param {boolean} [opts.enabled=true]
 * @param {boolean} [opts.isBuiltin=false]
 * @param {string|null} [opts.userId=null]
 * @returns {Object} The created agent with parsed JSON fields
 */
export function createAgent(name, opts = {}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Agent name must be a non-empty string');
  }
  const model = opts.model !== undefined ? opts.model : 'sonnet';
  if (typeof model !== 'string') {
    throw new Error('Agent model must be a string');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const {
    systemPrompt = '',
    temperature = 0.7,
    surfaces = [],
    mcpServers = [],
    skills = [],
    avatar = null,
    enabled = true,
    isBuiltin = false,
    userId = null,
  } = opts;

  d().prepare(`
    INSERT INTO agents (id, name, systemPrompt, model, temperature, surfaces, mcpServers, skills, avatar, enabled, isBuiltin, userId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name.trim(), systemPrompt, model, temperature,
    JSON.stringify(surfaces), JSON.stringify(mcpServers), JSON.stringify(skills),
    avatar, enabled ? 1 : 0, isBuiltin ? 1 : 0, userId, now, now
  );

  return getAgent(id);
}

/**
 * Get an agent by ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getAgent(id) {
  const row = d().prepare('SELECT * FROM agents WHERE id = ?').get(id);
  return parseRow(row);
}

/**
 * List agents with optional filters.
 * @param {Object} [opts]
 * @param {string} [opts.userId] - Filter by owner
 * @param {boolean} [opts.enabled] - Filter by enabled status
 * @returns {Object[]}
 */
export function listAgents(opts = {}) {
  const clauses = [];
  const params = [];

  if (opts.userId !== undefined) {
    clauses.push('userId = ?');
    params.push(opts.userId);
  }
  if (opts.enabled !== undefined) {
    clauses.push('enabled = ?');
    params.push(opts.enabled ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = d().prepare(`SELECT * FROM agents ${where} ORDER BY createdAt ASC`).all(...params);
  return rows.map(parseRow);
}

/**
 * Update an agent with a partial patch.
 * @param {string} id
 * @param {Object} patch
 * @returns {Object|undefined} The updated agent, or undefined if not found
 */
export function updateAgent(id, patch) {
  const allowed = ['name', 'systemPrompt', 'model', 'temperature', 'surfaces', 'mcpServers', 'skills', 'avatar', 'enabled', 'isBuiltin', 'userId'];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in patch) {
      let val = patch[key];
      if (key === 'name') {
        if (!val || typeof val !== 'string' || !val.trim()) {
          throw new Error('Agent name must be a non-empty string');
        }
        val = val.trim();
      }
      if (key === 'model' && typeof val !== 'string') {
        throw new Error('Agent model must be a string');
      }
      if (JSON_FIELDS.includes(key)) {
        val = JSON.stringify(val);
      }
      if (key === 'enabled' || key === 'isBuiltin') {
        val = val ? 1 : 0;
      }
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (sets.length === 0) return getAgent(id);

  sets.push('updatedAt = ?');
  values.push(new Date().toISOString());
  values.push(id);

  d().prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getAgent(id);
}

/**
 * Delete an agent by ID.
 * @param {string} id
 * @returns {boolean} True if an agent was deleted
 */
export function deleteAgent(id) {
  const result = d().prepare('DELETE FROM agents WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * List agents owned by a specific user.
 * @param {string} userId
 * @returns {Object[]}
 */
export function listByUser(userId) {
  return listAgents({ userId });
}

/**
 * Get all builtin (system-provided) agents.
 * @returns {Object[]}
 */
export function getBuiltinAgents() {
  const rows = d().prepare('SELECT * FROM agents WHERE isBuiltin = 1 ORDER BY createdAt ASC').all();
  return rows.map(parseRow);
}
