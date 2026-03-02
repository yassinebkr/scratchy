/**
 * @module server/seed-teams
 * Seeds default teams (Backend Dev + Frontend) on first startup.
 * Runs after seed-agents.js — requires agents to exist.
 *
 * Teams are created with a system owner and pre-assigned agents
 * from the TEAM_PACKAGES definitions in lib/team-router.js.
 *
 * Idempotent: only creates teams that don't already exist (by name).
 */

import crypto from 'node:crypto';
import { TEAM_PACKAGES } from '../lib/team-router.js';

/**
 * The team packages to auto-seed. Keys match TEAM_PACKAGES.
 * Only these packages get auto-created — the legacy ones (devops, content,
 * support, fullstack) are templates users can instantiate manually.
 */
const AUTO_SEED_PACKAGES = ['backend-dev', 'frontend'];

/**
 * Seed default teams into the database.
 * Creates each team, assigns a system owner, and links agents by name.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function seedTeams(db) {
  // Get existing team names to avoid duplicates
  const existingNames = new Set(
    db.prepare('SELECT name FROM teams').all().map(r => r.name.toLowerCase())
  );

  // Get a system/admin user to be team owner — find the first admin user,
  // or fall back to the first user, or create a system user placeholder
  let ownerId = null;
  const adminUser = db.prepare(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1"
  ).get();

  if (adminUser) {
    ownerId = adminUser.id;
  } else {
    const anyUser = db.prepare('SELECT id FROM users ORDER BY createdAt ASC LIMIT 1').get();
    if (anyUser) {
      ownerId = anyUser.id;
    }
  }

  // If no users exist yet, we can't create teams (need an owner).
  // Teams will be created when the first user signs up and visits the teams page,
  // or on next restart after a user exists.
  if (!ownerId) {
    console.log('[seed-teams] No users exist yet — team seeding deferred until first user signup');
    return;
  }

  // Build agent name → id lookup (builtin agents only)
  const agentRows = db.prepare("SELECT id, name FROM agents WHERE isBuiltin = 1").all();
  const agentByName = new Map(agentRows.map(r => [r.name.toLowerCase(), r.id]));

  let created = 0;

  const insertTeam = db.prepare(`
    INSERT INTO teams (id, name, description, ownerId, icon, color, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMember = db.prepare(`
    INSERT INTO team_members (id, teamId, userId, role, joinedAt)
    VALUES (?, ?, ?, 'owner', ?)
  `);

  const insertAgent = db.prepare(`
    INSERT INTO team_agents (id, teamId, agentId, role, addedBy, addedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const pkgKey of AUTO_SEED_PACKAGES) {
      const pkg = TEAM_PACKAGES[pkgKey];
      if (!pkg) {
        console.warn(`[seed-teams] Package '${pkgKey}' not found in TEAM_PACKAGES — skipping`);
        continue;
      }

      // Skip if team with this name already exists
      if (existingNames.has(pkg.name.toLowerCase())) {
        continue;
      }

      const teamId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Create team
      insertTeam.run(
        teamId,
        pkg.name,
        pkg.description,
        ownerId,
        pkg.icon,
        pkg.color,
        now,
        now
      );

      // Add owner as member
      insertMember.run(crypto.randomUUID(), teamId, ownerId, now);

      // Assign agents from the package
      let agentsAdded = 0;
      for (const agentDef of pkg.agents) {
        const agentId = agentByName.get(agentDef.name.toLowerCase());
        if (!agentId) {
          console.warn(`[seed-teams] Agent '${agentDef.name}' not found — skipping assignment to ${pkg.name}`);
          continue;
        }

        insertAgent.run(
          crypto.randomUUID(),
          teamId,
          agentId,
          agentDef.role,
          ownerId,
          now
        );
        agentsAdded++;
      }

      console.log(`[seed-teams] Created team '${pkg.name}' with ${agentsAdded} agents (owner: ${ownerId})`);
      created++;
    }
  });

  tx();

  if (created > 0) {
    console.log(`[seed-teams] Seeded ${created} default team(s)`);
  } else {
    console.log('[seed-teams] Default teams already exist — nothing to seed');
  }
}
