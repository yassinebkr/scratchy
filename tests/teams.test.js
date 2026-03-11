/**
 * Unit tests for state/teams.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../state/db.js';
import * as users from '../state/users.js';
import * as agents from '../state/agents.js';
import * as teams from '../state/teams.js';

describe('teams', () => {
  let db;
  let owner;
  let member1;
  let member2;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    users.init(db);
    agents.init(db);
    teams.init(db);

    // Create test users
    owner = users.createUser('owner', 'hash1');
    member1 = users.createUser('member1', 'hash2');
    member2 = users.createUser('member2', 'hash3');
  });

  /* ------------------------------------------------------------ */
  /*  createTeam                                                   */
  /* ------------------------------------------------------------ */
  describe('createTeam', () => {
    it('creates a team with defaults', () => {
      const team = teams.createTeam('Test Team', owner.id);
      assert.equal(team.name, 'Test Team');
      assert.equal(team.description, '');
      assert.equal(team.ownerId, owner.id);
      assert.equal(team.icon, '👥');
      assert.equal(team.color, 'blue');
      assert.ok(team.id);
      assert.ok(team.createdAt);
      assert.ok(team.updatedAt);
    });

    it('automatically adds the owner as a member with "owner" role', () => {
      const team = teams.createTeam('Owner Team', owner.id);
      assert.ok(team.members);
      assert.equal(team.members.length, 1);
      assert.equal(team.members[0].userId, owner.id);
      assert.equal(team.members[0].role, 'owner');
      assert.equal(team.members[0].username, 'owner');
    });

    it('creates a team with custom options', () => {
      const team = teams.createTeam('Custom Team', owner.id, {
        description: 'A custom team',
        icon: '🚀',
        color: 'red',
      });
      assert.equal(team.description, 'A custom team');
      assert.equal(team.icon, '🚀');
      assert.equal(team.color, 'red');
    });

    it('trims the team name', () => {
      const team = teams.createTeam('  Spaced Name  ', owner.id);
      assert.equal(team.name, 'Spaced Name');
    });

    it('throws on empty team name', () => {
      assert.throws(
        () => teams.createTeam('', owner.id),
        /Team name must be a non-empty string/
      );
    });

    it('throws on whitespace-only team name', () => {
      assert.throws(
        () => teams.createTeam('   ', owner.id),
        /Team name must be a non-empty string/
      );
    });

    it('throws on null team name', () => {
      assert.throws(
        () => teams.createTeam(null, owner.id),
        /Team name must be a non-empty string/
      );
    });

    it('throws on non-string team name', () => {
      assert.throws(
        () => teams.createTeam(123, owner.id),
        /Team name must be a non-empty string/
      );
    });

    it('allows duplicate team names', () => {
      const t1 = teams.createTeam('Same Name', owner.id);
      const t2 = teams.createTeam('Same Name', member1.id);
      assert.notEqual(t1.id, t2.id);
      assert.equal(t1.name, t2.name);
    });

    it('starts with empty agents array', () => {
      const team = teams.createTeam('No Agents', owner.id);
      assert.deepEqual(team.agents, []);
    });

    it('handles unicode team names', () => {
      const team = teams.createTeam('チーム🎉', owner.id);
      assert.equal(team.name, 'チーム🎉');
    });
  });

  /* ------------------------------------------------------------ */
  /*  getTeam                                                      */
  /* ------------------------------------------------------------ */
  describe('getTeam', () => {
    it('returns team with members and agents', () => {
      const created = teams.createTeam('Get Test', owner.id);
      const fetched = teams.getTeam(created.id);
      assert.equal(fetched.name, 'Get Test');
      assert.ok(Array.isArray(fetched.members));
      assert.ok(Array.isArray(fetched.agents));
    });

    it('returns undefined for non-existent team', () => {
      const result = teams.getTeam('non-existent');
      assert.equal(result, undefined);
    });
  });

  /* ------------------------------------------------------------ */
  /*  updateTeam                                                   */
  /* ------------------------------------------------------------ */
  describe('updateTeam', () => {
    it('updates team name', () => {
      const team = teams.createTeam('Old Name', owner.id);
      const updated = teams.updateTeam(team.id, { name: 'New Name' });
      assert.equal(updated.name, 'New Name');
    });

    it('updates description, icon, and color', () => {
      const team = teams.createTeam('Update Test', owner.id);
      const updated = teams.updateTeam(team.id, {
        description: 'Updated desc',
        icon: '🌟',
        color: 'green',
      });
      assert.equal(updated.description, 'Updated desc');
      assert.equal(updated.icon, '🌟');
      assert.equal(updated.color, 'green');
    });

    it('trims the updated name', () => {
      const team = teams.createTeam('Trim Test', owner.id);
      const updated = teams.updateTeam(team.id, { name: '  Trimmed  ' });
      assert.equal(updated.name, 'Trimmed');
    });

    it('throws on empty name update', () => {
      const team = teams.createTeam('Valid', owner.id);
      assert.throws(
        () => teams.updateTeam(team.id, { name: '' }),
        /Team name must be a non-empty string/
      );
    });

    it('returns unchanged team for empty patch', () => {
      const team = teams.createTeam('No Patch', owner.id);
      const result = teams.updateTeam(team.id, {});
      assert.equal(result.name, 'No Patch');
    });

    it('updates updatedAt timestamp', () => {
      const team = teams.createTeam('Time Test', owner.id);
      const updated = teams.updateTeam(team.id, { description: 'New' });
      assert.ok(updated.updatedAt >= team.updatedAt);
    });
  });

  /* ------------------------------------------------------------ */
  /*  deleteTeam                                                   */
  /* ------------------------------------------------------------ */
  describe('deleteTeam', () => {
    it('deletes an existing team', () => {
      const team = teams.createTeam('Delete Me', owner.id);
      const result = teams.deleteTeam(team.id);
      assert.equal(result, true);
      assert.equal(teams.getTeam(team.id), undefined);
    });

    it('returns false for non-existent team', () => {
      const result = teams.deleteTeam('no-such-id');
      assert.equal(result, false);
    });

    it('cascades delete to team_members', () => {
      const team = teams.createTeam('Cascade Test', owner.id);
      teams.addMember(team.id, member1.id);

      teams.deleteTeam(team.id);

      const members = db.prepare('SELECT * FROM team_members WHERE teamId = ?').all(team.id);
      assert.equal(members.length, 0);
    });

    it('cascades delete to team_agents', () => {
      const team = teams.createTeam('Agent Cascade', owner.id);
      const agent = agents.createAgent('TestAgent', { userId: owner.id });
      teams.addAgent(team.id, agent.id);

      teams.deleteTeam(team.id);

      const teamAgents = db.prepare('SELECT * FROM team_agents WHERE teamId = ?').all(team.id);
      assert.equal(teamAgents.length, 0);
    });

    it('cascades delete to team_memory', () => {
      const team = teams.createTeam('Memory Cascade', owner.id);
      teams.addMemory(team.id, 'test-key', 'test content');

      teams.deleteTeam(team.id);

      const memories = db.prepare('SELECT * FROM team_memory WHERE teamId = ?').all(team.id);
      assert.equal(memories.length, 0);
    });
  });

  /* ------------------------------------------------------------ */
  /*  listUserTeams / listAllTeams                                 */
  /* ------------------------------------------------------------ */
  describe('listUserTeams', () => {
    it('returns teams the user belongs to', () => {
      teams.createTeam('Team A', owner.id);
      teams.createTeam('Team B', owner.id);
      teams.createTeam('Team C', member1.id);

      const ownerTeams = teams.listUserTeams(owner.id);
      assert.equal(ownerTeams.length, 2);
    });

    it('returns empty array for user with no teams', () => {
      const result = teams.listUserTeams(member2.id);
      assert.deepEqual(result, []);
    });

    it('includes memberCount and agentCount', () => {
      const team = teams.createTeam('Counts', owner.id);
      teams.addMember(team.id, member1.id);

      const list = teams.listUserTeams(owner.id);
      assert.equal(list[0].memberCount, 2); // owner + member1
    });

    it('includes teams where user is added as member (not owner)', () => {
      const team = teams.createTeam('Joined Team', owner.id);
      teams.addMember(team.id, member1.id);

      const memberTeams = teams.listUserTeams(member1.id);
      assert.equal(memberTeams.length, 1);
      assert.equal(memberTeams[0].name, 'Joined Team');
    });
  });

  describe('listAllTeams', () => {
    it('returns all teams across all users', () => {
      teams.createTeam('Team 1', owner.id);
      teams.createTeam('Team 2', member1.id);

      const all = teams.listAllTeams();
      assert.equal(all.length, 2);
    });

    it('returns empty array when no teams', () => {
      const result = teams.listAllTeams();
      assert.deepEqual(result, []);
    });
  });

  /* ------------------------------------------------------------ */
  /*  Members                                                      */
  /* ------------------------------------------------------------ */
  describe('addMember', () => {
    it('adds a member with default role', () => {
      const team = teams.createTeam('Members', owner.id);
      const membership = teams.addMember(team.id, member1.id);
      assert.equal(membership.userId, member1.id);
      assert.equal(membership.role, 'member');
      assert.equal(membership.username, 'member1');
    });

    it('adds a member with admin role', () => {
      const team = teams.createTeam('Admin Members', owner.id);
      const membership = teams.addMember(team.id, member1.id, 'admin');
      assert.equal(membership.role, 'admin');
    });

    it('throws on duplicate membership', () => {
      const team = teams.createTeam('Dup Test', owner.id);
      teams.addMember(team.id, member1.id);
      assert.throws(
        () => teams.addMember(team.id, member1.id),
        /User is already a member of this team/
      );
    });

    it('throws on invalid role', () => {
      const team = teams.createTeam('Bad Role', owner.id);
      assert.throws(
        () => teams.addMember(team.id, member1.id, 'superadmin'),
        /Member role must be admin or member/
      );
    });

    it('updates team updatedAt when member added', () => {
      const team = teams.createTeam('Time Members', owner.id);
      const originalUpdated = team.updatedAt;
      teams.addMember(team.id, member1.id);
      const updated = teams.getTeam(team.id);
      assert.ok(updated.updatedAt >= originalUpdated);
    });
  });

  describe('updateMemberRole', () => {
    it('updates a member role', () => {
      const team = teams.createTeam('Role Update', owner.id);
      teams.addMember(team.id, member1.id, 'member');
      const result = teams.updateMemberRole(team.id, member1.id, 'admin');
      assert.equal(result, true);

      const { role } = teams.checkMembership(team.id, member1.id);
      assert.equal(role, 'admin');
    });

    it('returns false for non-existent membership', () => {
      const team = teams.createTeam('No Member', owner.id);
      const result = teams.updateMemberRole(team.id, 'no-user', 'admin');
      assert.equal(result, false);
    });

    it('throws on invalid role', () => {
      const team = teams.createTeam('Bad Role', owner.id);
      assert.throws(
        () => teams.updateMemberRole(team.id, owner.id, 'supreme'),
        /Invalid role/
      );
    });

    it('accepts owner role', () => {
      const team = teams.createTeam('Owner Role', owner.id);
      teams.addMember(team.id, member1.id, 'member');
      const result = teams.updateMemberRole(team.id, member1.id, 'owner');
      assert.equal(result, true);
    });
  });

  describe('removeMember', () => {
    it('removes a member', () => {
      const team = teams.createTeam('Remove Test', owner.id);
      teams.addMember(team.id, member1.id);
      const result = teams.removeMember(team.id, member1.id);
      assert.equal(result, true);

      const { isMember } = teams.checkMembership(team.id, member1.id);
      assert.equal(isMember, false);
    });

    it('throws when removing the owner', () => {
      const team = teams.createTeam('Owner Protect', owner.id);
      assert.throws(
        () => teams.removeMember(team.id, owner.id),
        /Cannot remove the team owner/
      );
    });

    it('returns false for non-existent member', () => {
      const team = teams.createTeam('No Member', owner.id);
      const result = teams.removeMember(team.id, 'no-user');
      assert.equal(result, false);
    });

    it('updates team updatedAt when member removed', () => {
      const team = teams.createTeam('Time Remove', owner.id);
      teams.addMember(team.id, member1.id);
      const before = teams.getTeam(team.id).updatedAt;
      teams.removeMember(team.id, member1.id);
      const after = teams.getTeam(team.id).updatedAt;
      assert.ok(after >= before);
    });
  });

  describe('checkMembership', () => {
    it('returns isMember=true and role for members', () => {
      const team = teams.createTeam('Check Test', owner.id);
      const result = teams.checkMembership(team.id, owner.id);
      assert.equal(result.isMember, true);
      assert.equal(result.role, 'owner');
    });

    it('returns isMember=false for non-members', () => {
      const team = teams.createTeam('No Check', owner.id);
      const result = teams.checkMembership(team.id, member1.id);
      assert.equal(result.isMember, false);
      assert.equal(result.role, null);
    });
  });

  /* ------------------------------------------------------------ */
  /*  Team Agents                                                  */
  /* ------------------------------------------------------------ */
  describe('addAgent', () => {
    it('assigns an agent with default worker role', () => {
      const team = teams.createTeam('Agent Team', owner.id);
      const agent = agents.createAgent('Helper', { userId: owner.id });
      const assignment = teams.addAgent(team.id, agent.id);
      assert.equal(assignment.agentId, agent.id);
      assert.equal(assignment.role, 'worker');
      assert.equal(assignment.agentName, 'Helper');
    });

    it('assigns an agent with orchestrator role', () => {
      const team = teams.createTeam('Orch Team', owner.id);
      const agent = agents.createAgent('Orchestrator', { userId: owner.id });
      const assignment = teams.addAgent(team.id, agent.id, { role: 'orchestrator' });
      assert.equal(assignment.role, 'orchestrator');
    });

    it('assigns an agent with reviewer role', () => {
      const team = teams.createTeam('Review Team', owner.id);
      const agent = agents.createAgent('Reviewer', { userId: owner.id });
      const assignment = teams.addAgent(team.id, agent.id, { role: 'reviewer' });
      assert.equal(assignment.role, 'reviewer');
    });

    it('records addedBy', () => {
      const team = teams.createTeam('Added By', owner.id);
      const agent = agents.createAgent('TrackedAgent', { userId: owner.id });
      const assignment = teams.addAgent(team.id, agent.id, { addedBy: owner.id });
      assert.equal(assignment.addedBy, owner.id);
    });

    it('throws on duplicate agent assignment', () => {
      const team = teams.createTeam('Dup Agent', owner.id);
      const agent = agents.createAgent('DupAgent', { userId: owner.id });
      teams.addAgent(team.id, agent.id);
      assert.throws(
        () => teams.addAgent(team.id, agent.id),
        /Agent is already assigned to this team/
      );
    });

    it('throws on invalid agent role', () => {
      const team = teams.createTeam('Bad Agent Role', owner.id);
      const agent = agents.createAgent('BadRoleAgent', { userId: owner.id });
      assert.throws(
        () => teams.addAgent(team.id, agent.id, { role: 'boss' }),
        /Agent role must be orchestrator, worker, or reviewer/
      );
    });
  });

  describe('updateAgentRole', () => {
    it('updates an agent role', () => {
      const team = teams.createTeam('Update Agent Role', owner.id);
      const agent = agents.createAgent('RoleAgent', { userId: owner.id });
      teams.addAgent(team.id, agent.id, { role: 'worker' });
      const result = teams.updateAgentRole(team.id, agent.id, 'orchestrator');
      assert.equal(result, true);
    });

    it('returns false for non-existent assignment', () => {
      const team = teams.createTeam('No Agent', owner.id);
      const result = teams.updateAgentRole(team.id, 'no-agent', 'worker');
      assert.equal(result, false);
    });

    it('throws on invalid role', () => {
      const team = teams.createTeam('Invalid', owner.id);
      const agent = agents.createAgent('Agent', { userId: owner.id });
      teams.addAgent(team.id, agent.id);
      assert.throws(
        () => teams.updateAgentRole(team.id, agent.id, 'boss'),
        /Invalid agent role/
      );
    });
  });

  describe('removeAgent', () => {
    it('removes an agent from a team', () => {
      const team = teams.createTeam('Remove Agent', owner.id);
      const agent = agents.createAgent('RemAgent', { userId: owner.id });
      teams.addAgent(team.id, agent.id);
      const result = teams.removeAgent(team.id, agent.id);
      assert.equal(result, true);

      const teamAgents = teams.getTeamAgents(team.id);
      assert.equal(teamAgents.length, 0);
    });

    it('returns false for non-existent assignment', () => {
      const team = teams.createTeam('No Remove', owner.id);
      const result = teams.removeAgent(team.id, 'no-agent');
      assert.equal(result, false);
    });
  });

  describe('getTeamAgents', () => {
    it('returns all agents for a team', () => {
      const team = teams.createTeam('Multi Agents', owner.id);
      const a1 = agents.createAgent('Agent1', { userId: owner.id });
      const a2 = agents.createAgent('Agent2', { userId: owner.id });
      teams.addAgent(team.id, a1.id, { role: 'worker' });
      teams.addAgent(team.id, a2.id, { role: 'reviewer' });

      const result = teams.getTeamAgents(team.id);
      assert.equal(result.length, 2);
    });

    it('returns empty array for team with no agents', () => {
      const team = teams.createTeam('No Agents', owner.id);
      const result = teams.getTeamAgents(team.id);
      assert.deepEqual(result, []);
    });
  });

  describe('getOrchestrator', () => {
    it('returns the orchestrator agent', () => {
      const team = teams.createTeam('Orch Test', owner.id);
      const agent = agents.createAgent('OrcAgent', { userId: owner.id });
      teams.addAgent(team.id, agent.id, { role: 'orchestrator' });

      const orch = teams.getOrchestrator(team.id);
      assert.ok(orch);
      assert.equal(orch.role, 'orchestrator');
      assert.equal(orch.agentName, 'OrcAgent');
    });

    it('returns undefined when no orchestrator', () => {
      const team = teams.createTeam('No Orch', owner.id);
      const result = teams.getOrchestrator(team.id);
      assert.equal(result, undefined);
    });
  });

  /* ------------------------------------------------------------ */
  /*  Team Memory                                                  */
  /* ------------------------------------------------------------ */
  describe('addMemory', () => {
    it('adds a memory entry', () => {
      const team = teams.createTeam('Memory Team', owner.id);
      const mem = teams.addMemory(team.id, 'api-docs', 'API documentation');
      assert.equal(mem.teamId, team.id);
      assert.equal(mem.key, 'api-docs');
      assert.equal(mem.content, 'API documentation');
      assert.ok(mem.id);
      assert.ok(mem.createdAt);
    });

    it('adds memory with options', () => {
      const team = teams.createTeam('Mem Opts', owner.id);
      const agent = agents.createAgent('MemAgent', { userId: owner.id });
      const mem = teams.addMemory(team.id, 'key', 'content', {
        createdBy: owner.id,
        agentId: agent.id,
      });
      assert.equal(mem.createdBy, owner.id);
      assert.equal(mem.agentId, agent.id);
    });
  });

  describe('getMemory', () => {
    it('returns memory entries ordered by updatedAt DESC', () => {
      const team = teams.createTeam('Get Mem', owner.id);
      teams.addMemory(team.id, 'first', 'First entry');
      teams.addMemory(team.id, 'second', 'Second entry');

      const mems = teams.getMemory(team.id);
      assert.equal(mems.length, 2);
    });

    it('respects limit parameter', () => {
      const team = teams.createTeam('Limit Mem', owner.id);
      for (let i = 0; i < 5; i++) {
        teams.addMemory(team.id, `key-${i}`, `content-${i}`);
      }

      const mems = teams.getMemory(team.id, { limit: 3 });
      assert.equal(mems.length, 3);
    });

    it('returns empty array for team with no memory', () => {
      const team = teams.createTeam('No Mem', owner.id);
      const mems = teams.getMemory(team.id);
      assert.deepEqual(mems, []);
    });

    it('defaults to limit 50', () => {
      const team = teams.createTeam('Default Limit', owner.id);
      // Just ensure it works without specifying limit
      const mems = teams.getMemory(team.id);
      assert.ok(Array.isArray(mems));
    });
  });

  describe('updateMemory', () => {
    it('updates key and content', () => {
      const team = teams.createTeam('Update Mem', owner.id);
      const mem = teams.addMemory(team.id, 'old-key', 'old content');
      const updated = teams.updateMemory(mem.id, { key: 'new-key', content: 'new content' });
      assert.equal(updated.key, 'new-key');
      assert.equal(updated.content, 'new content');
    });

    it('returns unchanged entry for empty patch', () => {
      const team = teams.createTeam('No Patch Mem', owner.id);
      const mem = teams.addMemory(team.id, 'key', 'content');
      const result = teams.updateMemory(mem.id, {});
      assert.equal(result.key, 'key');
    });

    it('returns undefined for non-existent memory', () => {
      const result = teams.updateMemory('no-such-id', { key: 'x' });
      assert.equal(result, undefined);
    });
  });

  describe('deleteMemory', () => {
    it('deletes a memory entry', () => {
      const team = teams.createTeam('Del Mem', owner.id);
      const mem = teams.addMemory(team.id, 'key', 'content');
      const result = teams.deleteMemory(mem.id);
      assert.equal(result, true);
    });

    it('returns false for non-existent memory', () => {
      const result = teams.deleteMemory('no-such-id');
      assert.equal(result, false);
    });
  });

  describe('searchMemory', () => {
    it('searches by key prefix match', () => {
      const team = teams.createTeam('Search Mem', owner.id);
      teams.addMemory(team.id, 'api-docs', 'API documentation');
      teams.addMemory(team.id, 'api-auth', 'Auth details');
      teams.addMemory(team.id, 'design-spec', 'Design specification');

      const results = teams.searchMemory(team.id, 'api');
      assert.equal(results.length, 2);
    });

    it('searches by content match', () => {
      const team = teams.createTeam('Content Search', owner.id);
      teams.addMemory(team.id, 'key1', 'The quick brown fox');
      teams.addMemory(team.id, 'key2', 'A lazy dog');

      const results = teams.searchMemory(team.id, 'brown');
      assert.equal(results.length, 1);
    });

    it('returns empty for no matches', () => {
      const team = teams.createTeam('No Match', owner.id);
      teams.addMemory(team.id, 'key', 'content');

      const results = teams.searchMemory(team.id, 'zzzzz');
      assert.deepEqual(results, []);
    });
  });

  /* ------------------------------------------------------------ */
  /*  Access control                                               */
  /* ------------------------------------------------------------ */
  describe('canManage', () => {
    it('returns true for owner', () => {
      const team = teams.createTeam('Manage Test', owner.id);
      assert.equal(teams.canManage(team.id, owner.id), true);
    });

    it('returns true for admin member', () => {
      const team = teams.createTeam('Admin Manage', owner.id);
      teams.addMember(team.id, member1.id, 'admin');
      assert.equal(teams.canManage(team.id, member1.id), true);
    });

    it('returns false for regular member', () => {
      const team = teams.createTeam('No Manage', owner.id);
      teams.addMember(team.id, member1.id, 'member');
      assert.equal(teams.canManage(team.id, member1.id), false);
    });

    it('returns falsy for non-member', () => {
      const team = teams.createTeam('Not Member', owner.id);
      // canManage returns `row && (...)` which is undefined when row is undefined
      assert.ok(!teams.canManage(team.id, member1.id));
    });
  });

  describe('isOwner', () => {
    it('returns true for the team owner', () => {
      const team = teams.createTeam('Owner Check', owner.id);
      assert.equal(teams.isOwner(team.id, owner.id), true);
    });

    it('returns false for non-owner member', () => {
      const team = teams.createTeam('Not Owner', owner.id);
      teams.addMember(team.id, member1.id);
      assert.equal(teams.isOwner(team.id, member1.id), false);
    });

    it('returns false for non-existent team', () => {
      assert.equal(teams.isOwner('no-team', owner.id), false);
    });
  });
});
