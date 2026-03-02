/**
 * @module state/teams
 * Team store backed by SQLite.
 * Provides CRUD for teams, members, agents, and shared memory.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the teams module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('teams.init(db) must be called before using the team store');
  return db;
}

/* ------------------------------------------------------------------ */
/*  Teams CRUD                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a new team. The creator becomes the owner automatically.
 * @param {string} name
 * @param {string} ownerId — user ID of the creator
 * @param {Object} [opts]
 * @param {string} [opts.description='']
 * @param {string} [opts.icon='👥']
 * @param {string} [opts.color='blue']
 * @returns {Object} The created team with members array
 */
export function createTeam(name, ownerId, opts = {}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Team name must be a non-empty string');
  }

  const id = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { description = '', icon = '👥', color = 'blue' } = opts;

  const insertTeam = d().prepare(`
    INSERT INTO teams (id, name, description, ownerId, icon, color, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMember = d().prepare(`
    INSERT INTO team_members (id, teamId, userId, role, joinedAt)
    VALUES (?, ?, ?, 'owner', ?)
  `);

  // Transaction: create team + add owner as member
  d().transaction(() => {
    insertTeam.run(id, name.trim(), description, ownerId, icon, color, now, now);
    insertMember.run(memberId, id, ownerId, now);
  })();

  return getTeam(id);
}

/**
 * Get a team by ID, including members and agents.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getTeam(id) {
  const team = d().prepare('SELECT * FROM teams WHERE id = ?').get(id);
  if (!team) return undefined;

  team.members = d().prepare(`
    SELECT tm.id as membershipId, tm.userId, tm.role, tm.joinedAt,
           u.username, u.displayName
    FROM team_members tm
    JOIN users u ON u.id = tm.userId
    WHERE tm.teamId = ?
    ORDER BY tm.joinedAt ASC
  `).all(id);

  team.agents = d().prepare(`
    SELECT ta.id as assignmentId, ta.agentId, ta.role, ta.addedAt, ta.addedBy,
           a.name as agentName, a.model, a.avatar, a.enabled
    FROM team_agents ta
    JOIN agents a ON a.id = ta.agentId
    WHERE ta.teamId = ?
    ORDER BY ta.addedAt ASC
  `).all(id);

  return team;
}

/**
 * List teams a user belongs to.
 * @param {string} userId
 * @returns {Object[]} Teams with member count and agent count
 */
export function listUserTeams(userId) {
  const rows = d().prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM team_members WHERE teamId = t.id) as memberCount,
      (SELECT COUNT(*) FROM team_agents WHERE teamId = t.id) as agentCount
    FROM teams t
    JOIN team_members tm ON tm.teamId = t.id
    WHERE tm.userId = ?
    ORDER BY t.updatedAt DESC
  `).all(userId);
  return rows.map(t => ({ ...t, agents: _getTeamAgents(t.id) }));
}

/**
 * List all teams (admin).
 * @returns {Object[]}
 */
export function listAllTeams() {
  const rows = d().prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM team_members WHERE teamId = t.id) as memberCount,
      (SELECT COUNT(*) FROM team_agents WHERE teamId = t.id) as agentCount
    FROM teams t
    ORDER BY t.updatedAt DESC
  `).all();
  return rows.map(t => ({ ...t, agents: _getTeamAgents(t.id) }));
}

/**
 * Get agent assignments for a team (id, name, role).
 * @param {string} teamId
 * @returns {Array<{id: string, name: string, role: string}>}
 */
function _getTeamAgents(teamId) {
  return d().prepare(`
    SELECT a.id, a.name, ta.role
    FROM team_agents ta
    JOIN agents a ON a.id = ta.agentId
    WHERE ta.teamId = ?
    ORDER BY ta.role ASC, a.name ASC
  `).all(teamId);
}

/**
 * Update a team.
 * @param {string} id
 * @param {Object} patch — { name, description, icon, color }
 * @returns {Object|undefined}
 */
export function updateTeam(id, patch) {
  const allowed = ['name', 'description', 'icon', 'color'];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in patch) {
      let val = patch[key];
      if (key === 'name') {
        if (!val || typeof val !== 'string' || !val.trim()) {
          throw new Error('Team name must be a non-empty string');
        }
        val = val.trim();
      }
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (sets.length === 0) return getTeam(id);

  sets.push('updatedAt = ?');
  values.push(new Date().toISOString());
  values.push(id);

  d().prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTeam(id);
}

/**
 * Delete a team.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTeam(id) {
  const result = d().prepare('DELETE FROM teams WHERE id = ?').run(id);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/*  Members                                                           */
/* ------------------------------------------------------------------ */

/**
 * Add a member to a team.
 * @param {string} teamId
 * @param {string} userId
 * @param {'admin'|'member'} [role='member']
 * @returns {Object} The membership record
 */
export function addMember(teamId, userId, role = 'member') {
  if (!['admin', 'member'].includes(role)) {
    throw new Error('Member role must be admin or member');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    d().prepare(`
      INSERT INTO team_members (id, teamId, userId, role, joinedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, teamId, userId, role, now);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      throw new Error('User is already a member of this team');
    }
    throw err;
  }

  // Touch team updatedAt
  d().prepare('UPDATE teams SET updatedAt = ? WHERE id = ?').run(now, teamId);

  return d().prepare(`
    SELECT tm.*, u.username, u.displayName
    FROM team_members tm
    JOIN users u ON u.id = tm.userId
    WHERE tm.id = ?
  `).get(id);
}

/**
 * Update a member's role.
 * @param {string} teamId
 * @param {string} userId
 * @param {'admin'|'member'} role
 * @returns {boolean}
 */
export function updateMemberRole(teamId, userId, role) {
  if (!['owner', 'admin', 'member'].includes(role)) {
    throw new Error('Invalid role');
  }
  const result = d().prepare(
    'UPDATE team_members SET role = ? WHERE teamId = ? AND userId = ?'
  ).run(role, teamId, userId);
  return result.changes > 0;
}

/**
 * Remove a member from a team.
 * @param {string} teamId
 * @param {string} userId
 * @returns {boolean}
 */
export function removeMember(teamId, userId) {
  // Don't allow removing the owner
  const member = d().prepare(
    'SELECT role FROM team_members WHERE teamId = ? AND userId = ?'
  ).get(teamId, userId);

  if (!member) return false;
  if (member.role === 'owner') {
    throw new Error('Cannot remove the team owner');
  }

  const result = d().prepare(
    'DELETE FROM team_members WHERE teamId = ? AND userId = ?'
  ).run(teamId, userId);

  if (result.changes > 0) {
    d().prepare('UPDATE teams SET updatedAt = ? WHERE id = ?')
      .run(new Date().toISOString(), teamId);
  }

  return result.changes > 0;
}

/**
 * Check if a user is a member of a team.
 * @param {string} teamId
 * @param {string} userId
 * @returns {{ isMember: boolean, role: string|null }}
 */
export function checkMembership(teamId, userId) {
  const row = d().prepare(
    'SELECT role FROM team_members WHERE teamId = ? AND userId = ?'
  ).get(teamId, userId);
  return { isMember: !!row, role: row?.role || null };
}

/* ------------------------------------------------------------------ */
/*  Team Agents                                                       */
/* ------------------------------------------------------------------ */

/**
 * Assign an agent to a team.
 * @param {string} teamId
 * @param {string} agentId
 * @param {Object} [opts]
 * @param {'orchestrator'|'worker'|'reviewer'} [opts.role='worker']
 * @param {string} [opts.addedBy]
 * @returns {Object}
 */
export function addAgent(teamId, agentId, opts = {}) {
  const { role = 'worker', addedBy = null } = opts;
  if (!['orchestrator', 'worker', 'reviewer'].includes(role)) {
    throw new Error('Agent role must be orchestrator, worker, or reviewer');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    d().prepare(`
      INSERT INTO team_agents (id, teamId, agentId, role, addedBy, addedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, teamId, agentId, role, addedBy, now);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      throw new Error('Agent is already assigned to this team');
    }
    throw err;
  }

  d().prepare('UPDATE teams SET updatedAt = ? WHERE id = ?').run(now, teamId);

  return d().prepare(`
    SELECT ta.*, a.name as agentName, a.model, a.avatar
    FROM team_agents ta
    JOIN agents a ON a.id = ta.agentId
    WHERE ta.id = ?
  `).get(id);
}

/**
 * Update an agent's role in a team.
 * @param {string} teamId
 * @param {string} agentId
 * @param {'orchestrator'|'worker'|'reviewer'} role
 * @returns {boolean}
 */
export function updateAgentRole(teamId, agentId, role) {
  if (!['orchestrator', 'worker', 'reviewer'].includes(role)) {
    throw new Error('Invalid agent role');
  }
  const result = d().prepare(
    'UPDATE team_agents SET role = ? WHERE teamId = ? AND agentId = ?'
  ).run(role, teamId, agentId);
  return result.changes > 0;
}

/**
 * Remove an agent from a team.
 * @param {string} teamId
 * @param {string} agentId
 * @returns {boolean}
 */
export function removeAgent(teamId, agentId) {
  const result = d().prepare(
    'DELETE FROM team_agents WHERE teamId = ? AND agentId = ?'
  ).run(teamId, agentId);

  if (result.changes > 0) {
    d().prepare('UPDATE teams SET updatedAt = ? WHERE id = ?')
      .run(new Date().toISOString(), teamId);
  }

  return result.changes > 0;
}

/**
 * Get all agents assigned to a team.
 * @param {string} teamId
 * @returns {Object[]}
 */
export function getTeamAgents(teamId) {
  return d().prepare(`
    SELECT ta.*, a.name as agentName, a.model, a.avatar, a.systemPrompt, a.enabled
    FROM team_agents ta
    JOIN agents a ON a.id = ta.agentId
    WHERE ta.teamId = ?
    ORDER BY ta.role ASC, ta.addedAt ASC
  `).all(teamId);
}

/**
 * Get the orchestrator agent for a team (if one is assigned).
 * @param {string} teamId
 * @returns {Object|undefined}
 */
export function getOrchestrator(teamId) {
  return d().prepare(`
    SELECT ta.*, a.name as agentName, a.model, a.systemPrompt, a.avatar
    FROM team_agents ta
    JOIN agents a ON a.id = ta.agentId
    WHERE ta.teamId = ? AND ta.role = 'orchestrator'
    LIMIT 1
  `).get(teamId);
}

/* ------------------------------------------------------------------ */
/*  Team Memory (shared context)                                      */
/* ------------------------------------------------------------------ */

/**
 * Add a shared memory entry to a team.
 * @param {string} teamId
 * @param {string} key — topic/label
 * @param {string} content — the knowledge
 * @param {Object} [opts]
 * @param {Buffer} [opts.embedding]
 * @param {string} [opts.createdBy] — user ID
 * @param {string} [opts.agentId] — if written by an agent
 * @returns {Object}
 */
export function addMemory(teamId, key, content, opts = {}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { embedding = null, createdBy = null, agentId = null } = opts;

  d().prepare(`
    INSERT INTO team_memory (id, teamId, key, content, embedding, createdBy, agentId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, teamId, key, content, embedding, createdBy, agentId, now, now);

  return d().prepare('SELECT * FROM team_memory WHERE id = ?').get(id);
}

/**
 * Get all memory entries for a team.
 * @param {string} teamId
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Object[]}
 */
export function getMemory(teamId, opts = {}) {
  const { limit = 50 } = opts;
  return d().prepare(`
    SELECT id, teamId, key, content, createdBy, agentId, createdAt, updatedAt
    FROM team_memory
    WHERE teamId = ?
    ORDER BY updatedAt DESC
    LIMIT ?
  `).all(teamId, limit);
}

/**
 * Update a memory entry.
 * @param {string} memoryId
 * @param {Object} patch — { key, content, embedding }
 * @returns {Object|undefined}
 */
export function updateMemory(memoryId, patch) {
  const allowed = ['key', 'content', 'embedding'];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      values.push(patch[key]);
    }
  }

  if (sets.length === 0) return d().prepare('SELECT * FROM team_memory WHERE id = ?').get(memoryId);

  sets.push('updatedAt = ?');
  values.push(new Date().toISOString());
  values.push(memoryId);

  d().prepare(`UPDATE team_memory SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return d().prepare('SELECT * FROM team_memory WHERE id = ?').get(memoryId);
}

/**
 * Delete a memory entry.
 * @param {string} memoryId
 * @returns {boolean}
 */
export function deleteMemory(memoryId) {
  const result = d().prepare('DELETE FROM team_memory WHERE id = ?').run(memoryId);
  return result.changes > 0;
}

/**
 * Search team memory by key (prefix match).
 * @param {string} teamId
 * @param {string} query
 * @returns {Object[]}
 */
export function searchMemory(teamId, query) {
  return d().prepare(`
    SELECT id, teamId, key, content, createdBy, agentId, createdAt
    FROM team_memory
    WHERE teamId = ? AND (key LIKE ? OR content LIKE ?)
    ORDER BY updatedAt DESC
    LIMIT 20
  `).all(teamId, `%${query}%`, `%${query}%`);
}

/* ------------------------------------------------------------------ */
/*  Access control helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Check if a user can manage a team (owner or admin).
 * @param {string} teamId
 * @param {string} userId
 * @returns {boolean}
 */
export function canManage(teamId, userId) {
  const row = d().prepare(
    'SELECT role FROM team_members WHERE teamId = ? AND userId = ?'
  ).get(teamId, userId);
  return row && (row.role === 'owner' || row.role === 'admin');
}

/**
 * Check if a user is the owner of a team.
 * @param {string} teamId
 * @param {string} userId
 * @returns {boolean}
 */
export function isOwner(teamId, userId) {
  const team = d().prepare('SELECT ownerId FROM teams WHERE id = ?').get(teamId);
  return team?.ownerId === userId;
}
