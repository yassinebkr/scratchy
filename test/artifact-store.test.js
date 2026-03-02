import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  publish,
  get,
  listForUser,
  listForTeam,
  buildPromptContext,
  remove,
  removeForUser,
  expire,
  stats,
  clear,
  _testing,
} from '../lib/artifact-store.js';

const META = {
  userId: 'user-1',
  authorAgentId: 'agent-api',
  authorAgentName: 'ApiWorker',
  teamId: 'team-backend',
  teamName: 'Backend Dev Team',
};

describe('artifact-store — publish & get', () => {
  beforeEach(() => clear());

  it('publishes and retrieves an artifact', () => {
    const res = publish('api-contract', '{"endpoints": ["/users"]}', META);
    assert.equal(res.ok, true);

    const artifact = get('api-contract');
    assert.ok(artifact);
    assert.equal(artifact.id, 'api-contract');
    assert.equal(artifact.content, '{"endpoints": ["/users"]}');
    assert.equal(artifact.authorAgentName, 'ApiWorker');
    assert.equal(artifact.teamName, 'Backend Dev Team');
    assert.equal(artifact.accessCount, 1);
  });

  it('updates existing artifact on re-publish', () => {
    publish('schema', 'v1', META);
    publish('schema', 'v2', META);

    const artifact = get('schema');
    assert.equal(artifact.content, 'v2');
    assert.ok(artifact.createdAt <= artifact.updatedAt);
  });

  it('returns null for nonexistent artifact', () => {
    assert.equal(get('nope'), null);
  });

  it('rejects empty id', () => {
    const res = publish('', 'content', META);
    assert.equal(res.ok, false);
    assert.match(res.error, /id is required/);
  });

  it('rejects empty content', () => {
    const res = publish('test', '', META);
    assert.equal(res.ok, false);
    assert.match(res.error, /content is required/);
  });

  it('rejects oversized content', () => {
    const big = 'x'.repeat(65 * 1024);
    const res = publish('big', big, META);
    assert.equal(res.ok, false);
    assert.match(res.error, /too large/);
  });

  it('rejects missing userId/teamId', () => {
    const res = publish('test', 'content', { authorAgentId: 'a', authorAgentName: 'A' });
    assert.equal(res.ok, false);
    assert.match(res.error, /userId and teamId/);
  });

  it('enforces per-user limit', () => {
    for (let i = 0; i < _testing.MAX_ARTIFACTS_PER_USER; i++) {
      publish(`item-${i}`, `content-${i}`, META);
    }
    const res = publish('one-too-many', 'overflow', META);
    assert.equal(res.ok, false);
    assert.match(res.error, /limit reached/);
  });

  it('allows update even at limit', () => {
    for (let i = 0; i < _testing.MAX_ARTIFACTS_PER_USER; i++) {
      publish(`item-${i}`, `content-${i}`, META);
    }
    // Update existing — should succeed
    const res = publish('item-0', 'updated', META);
    assert.equal(res.ok, true);
    assert.equal(get('item-0').content, 'updated');
  });

  it('increments accessCount on get', () => {
    publish('counter', 'data', META);
    get('counter');
    get('counter');
    get('counter');
    assert.equal(get('counter').accessCount, 4); // 3 previous + this one
  });
});

describe('artifact-store — listing', () => {
  beforeEach(() => clear());

  it('lists artifacts for a user', () => {
    publish('a', 'content-a', META);
    publish('b', 'content-b', META);

    const list = listForUser('user-1');
    assert.equal(list.length, 2);
    assert.ok(list.some(a => a.id === 'a'));
    assert.ok(list.some(a => a.id === 'b'));
  });

  it('returns empty for unknown user', () => {
    assert.deepEqual(listForUser('nobody'), []);
  });

  it('lists artifacts for a team', () => {
    publish('x', 'content', META);
    publish('y', 'content', { ...META, teamId: 'other-team', teamName: 'Other' });

    const backendList = listForTeam('team-backend');
    assert.equal(backendList.length, 1);
    assert.equal(backendList[0].id, 'x');

    const otherList = listForTeam('other-team');
    assert.equal(otherList.length, 1);
    assert.equal(otherList[0].id, 'y');
  });
});

describe('artifact-store — prompt context', () => {
  beforeEach(() => clear());

  it('builds prompt context block', () => {
    publish('api-contract', '{"endpoints": ["/users", "/posts"]}', META);
    publish('db-schema', 'CREATE TABLE users (id INT);', META);

    const ctx = buildPromptContext('user-1');
    assert.ok(ctx.includes('[Available Artifacts]'));
    assert.ok(ctx.includes('api-contract'));
    assert.ok(ctx.includes('db-schema'));
    assert.ok(ctx.includes('ApiWorker'));
  });

  it('returns empty string when no artifacts', () => {
    assert.equal(buildPromptContext('nobody'), '');
  });
});

describe('artifact-store — removal', () => {
  beforeEach(() => clear());

  it('removes a specific artifact', () => {
    publish('a', 'content', META);
    publish('b', 'content', META);

    assert.equal(remove('a'), true);
    assert.equal(get('a'), null);
    assert.ok(get('b'));
    assert.equal(listForUser('user-1').length, 1);
  });

  it('returns false for nonexistent artifact', () => {
    assert.equal(remove('nope'), false);
  });

  it('removes all artifacts for a user', () => {
    publish('a', 'x', META);
    publish('b', 'y', META);
    publish('c', 'z', { ...META, userId: 'user-2' });

    const count = removeForUser('user-1');
    assert.equal(count, 2);
    assert.equal(listForUser('user-1').length, 0);
    assert.equal(listForUser('user-2').length, 1);
  });
});

describe('artifact-store — expiry', () => {
  beforeEach(() => clear());

  it('expires old artifacts', () => {
    publish('old', 'data', META);

    // Backdate the artifact
    const a = _testing._artifacts.get('old');
    a.updatedAt = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago

    publish('new', 'data', META);

    const expired = expire(60 * 60 * 1000); // 1 hour
    assert.equal(expired, 1);
    assert.equal(get('old'), null);
    assert.ok(get('new'));
  });

  it('returns 0 when nothing to expire', () => {
    publish('fresh', 'data', META);
    assert.equal(expire(), 0);
  });
});

describe('artifact-store — stats', () => {
  beforeEach(() => clear());

  it('reports correct stats', () => {
    publish('a', 'hello', META);
    publish('b', 'world!', { ...META, userId: 'user-2', teamId: 'team-2', teamName: 'Team 2' });

    const s = stats();
    assert.equal(s.totalArtifacts, 2);
    assert.equal(s.totalSize, 11); // 'hello' + 'world!'
    assert.equal(s.userCount, 2);
    assert.equal(s.teamCount, 2);
  });
});
