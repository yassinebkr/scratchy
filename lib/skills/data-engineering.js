/**
 * @skill data-engineering
 * SQLite schema design, state modules, migrations, caching.
 * Agents: Data
 */
export default {
  id: 'data-engineering',
  name: 'Data Engineering',
  description: 'SQLite schema design, CRUD state modules, migrations, caching strategies',
  category: 'backend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Data Engineering

### Schema Design (better-sqlite3)
\`\`\`js
// Standard table pattern — every table gets these columns
db.exec(\\\`
  CREATE TABLE IF NOT EXISTS widgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'generic',
    config TEXT DEFAULT '{}',
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
\\\`);

// Always add indexes on foreign keys and frequently queried columns
db.exec('CREATE INDEX IF NOT EXISTS idx_widgets_owner ON widgets(owner_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_widgets_type ON widgets(type)');
\`\`\`

### Naming Conventions
- Tables: snake_case, plural (users, team_agents, widget_configs)
- Columns: snake_case in SQL (owner_id, created_at)
- JS functions: camelCase (getWidgetById, createWidget)
- Primary keys: TEXT (UUID), never INTEGER autoincrement (allows distributed IDs)
- JSON columns: TEXT with JSON stored as string (parse in JS, not SQLite JSON functions)

### CRUD Module Pattern
\`\`\`js
import crypto from 'node:crypto';

let db;
export function init(database) {
  db = database;
  db.exec(\\\`CREATE TABLE IF NOT EXISTS ...\\\`);
}

export function create(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO widgets (id, name, type, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, data.name, data.type, data.ownerId, now, now);
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) || null;
}

export function list(ownerId, { limit = 50, offset = 0 } = {}) {
  const items = db.prepare('SELECT * FROM widgets WHERE owner_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(ownerId, limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM widgets WHERE owner_id = ?').get(ownerId).count;
  return { items, total, limit, offset };
}

export function update(id, patch) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(patch)) {
    fields.push(key + ' = ?');
    values.push(val);
  }
  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  db.prepare('UPDATE widgets SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
  return get(id);
}

export function remove(id) {
  return db.prepare('DELETE FROM widgets WHERE id = ?').run(id);
}
\`\`\`

### Migration Strategy
- Migrations are idempotent: \`CREATE TABLE IF NOT EXISTS\`, \`CREATE INDEX IF NOT EXISTS\`
- Column additions: \`ALTER TABLE ... ADD COLUMN ... DEFAULT ...\` (SQLite supports this)
- For destructive changes: create new table, copy data, drop old table (inside transaction)
- Always run migrations inside db.transaction() for atomicity

### Caching
- In-memory Map with TTL: \`{ value, expiresAt }\`
- Cache key = entity type + id (e.g., \`widget:abc123\`)
- Invalidate on write (create/update/delete clears relevant cache entries)
- Max cache size: 1000 entries per entity type (LRU eviction)
- Never cache user-specific data across users — namespace by userId

### Data Integrity Rules
- All foreign keys reference existing tables
- NOT NULL on required fields — never allow silent nulls
- Default values for optional fields
- Unique constraints where business logic requires it
- Cascading deletes only where explicitly intended (prefer SET NULL or application-level cleanup)
- Transaction wrapping for multi-table writes`,
};
