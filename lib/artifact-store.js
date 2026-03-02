/**
 * @fileoverview Shared Artifact Store — cross-team context sharing.
 *
 * Workers publish artifacts (code files, API contracts, schemas, etc.) that
 * other workers — including those in different teams — can reference.
 *
 * In-memory only: artifacts don't survive Scratchy restart (acceptable since
 * team routing is transient). For durability, callers can persist to SQLite.
 *
 * Usage:
 *   - Worker publishes: artifactStore.publish('api-contract', content, { author, team })
 *   - Server builds context: artifactStore.getForTeam(teamId) → summary for prompt
 *   - Worker requests: artifactStore.get('api-contract') → full content
 *   - Cleanup: artifactStore.expire(maxAgeMs) — remove stale artifacts
 *
 * @module lib/artifact-store
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Artifact
 * @property {string} id — unique artifact identifier
 * @property {string} content — the artifact content
 * @property {string} authorAgentId — agent that created it
 * @property {string} authorAgentName — agent display name
 * @property {string} teamId — team that created it
 * @property {string} teamName — team display name
 * @property {string} userId — owning user
 * @property {string} [mimeType] — optional content type hint
 * @property {number} createdAt — epoch ms
 * @property {number} updatedAt — epoch ms (last publish)
 * @property {number} accessCount — how many times it's been read
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum artifact content size (64 KB) */
const MAX_ARTIFACT_SIZE = 64 * 1024;

/** Maximum artifacts per user (prevent abuse) */
const MAX_ARTIFACTS_PER_USER = 50;

/** Default expiry: 1 hour (artifacts are transient) */
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

// ─── Store ──────────────────────────────────────────────────────────────────

/** @type {Map<string, Artifact>} — artifactId → Artifact */
const _artifacts = new Map();

/** @type {Map<string, Set<string>>} — userId → Set<artifactId> */
const _userIndex = new Map();

/** @type {Map<string, Set<string>>} — teamId → Set<artifactId> */
const _teamIndex = new Map();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Publish an artifact (create or update).
 *
 * @param {string} id — artifact identifier (e.g. 'api-contract', 'db-schema')
 * @param {string} content — artifact content
 * @param {Object} meta
 * @param {string} meta.userId
 * @param {string} meta.authorAgentId
 * @param {string} meta.authorAgentName
 * @param {string} meta.teamId
 * @param {string} meta.teamName
 * @param {string} [meta.mimeType]
 * @returns {{ ok: boolean, error?: string }}
 */
export function publish(id, content, meta) {
  if (!id || typeof id !== 'string') {
    return { ok: false, error: 'Artifact id is required' };
  }
  if (!content || typeof content !== 'string') {
    return { ok: false, error: 'Artifact content is required' };
  }
  if (content.length > MAX_ARTIFACT_SIZE) {
    return { ok: false, error: `Artifact too large (${Math.round(content.length / 1024)}KB > ${MAX_ARTIFACT_SIZE / 1024}KB limit)` };
  }

  const { userId, authorAgentId, authorAgentName, teamId, teamName, mimeType } = meta;
  if (!userId || !teamId) {
    return { ok: false, error: 'userId and teamId are required' };
  }

  // Per-user limit check
  const userArtifacts = _userIndex.get(userId);
  if (userArtifacts && userArtifacts.size >= MAX_ARTIFACTS_PER_USER && !_artifacts.has(id)) {
    return { ok: false, error: `Artifact limit reached (${MAX_ARTIFACTS_PER_USER} per user)` };
  }

  const now = Date.now();
  const existing = _artifacts.get(id);

  const artifact = {
    id,
    content,
    authorAgentId: authorAgentId || 'unknown',
    authorAgentName: authorAgentName || 'Unknown',
    teamId,
    teamName: teamName || teamId,
    userId,
    mimeType: mimeType || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    accessCount: existing?.accessCount || 0,
  };

  _artifacts.set(id, artifact);

  // Update indexes
  if (!_userIndex.has(userId)) _userIndex.set(userId, new Set());
  _userIndex.get(userId).add(id);

  if (!_teamIndex.has(teamId)) _teamIndex.set(teamId, new Set());
  _teamIndex.get(teamId).add(id);

  console.log(`[artifact-store] Published "${id}" by ${authorAgentName} (team: ${teamName}, ${Math.round(content.length / 1024)}KB)`);
  return { ok: true };
}

/**
 * Get an artifact by id.
 *
 * @param {string} id
 * @returns {Artifact|null}
 */
export function get(id) {
  const artifact = _artifacts.get(id);
  if (artifact) {
    artifact.accessCount++;
  }
  return artifact || null;
}

/**
 * List all artifacts available to a user (from any of their teams).
 * Returns summaries (no content) for prompt injection.
 *
 * @param {string} userId
 * @returns {Array<{ id: string, authorAgentName: string, teamName: string, size: number, updatedAt: number }>}
 */
export function listForUser(userId) {
  const ids = _userIndex.get(userId);
  if (!ids) return [];

  return [...ids]
    .map(id => _artifacts.get(id))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(a => ({
      id: a.id,
      authorAgentName: a.authorAgentName,
      teamName: a.teamName,
      size: a.content.length,
      updatedAt: a.updatedAt,
    }));
}

/**
 * List artifacts from a specific team.
 *
 * @param {string} teamId
 * @returns {Array<{ id: string, authorAgentName: string, size: number }>}
 */
export function listForTeam(teamId) {
  const ids = _teamIndex.get(teamId);
  if (!ids) return [];

  return [...ids]
    .map(id => _artifacts.get(id))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(a => ({
      id: a.id,
      authorAgentName: a.authorAgentName,
      size: a.content.length,
    }));
}

/**
 * Build a context block for injecting into a worker/orchestrator prompt.
 * Lists available artifacts with summaries (first 200 chars of content).
 *
 * @param {string} userId
 * @returns {string} — prompt-ready context block, or empty string if none
 */
export function buildPromptContext(userId) {
  const artifacts = listForUser(userId);
  if (artifacts.length === 0) return '';

  const lines = ['[Available Artifacts]'];
  for (const a of artifacts) {
    const full = _artifacts.get(a.id);
    const preview = full ? full.content.slice(0, 200).replace(/\n/g, ' ') : '';
    lines.push(`- **${a.id}** (by ${a.authorAgentName}, ${a.teamName}, ${Math.round(a.size / 1024)}KB): ${preview}${a.size > 200 ? '...' : ''}`);
  }
  lines.push('');
  lines.push('To use an artifact, include its content directly or reference it by id.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Remove an artifact.
 *
 * @param {string} id
 * @returns {boolean} — true if removed
 */
export function remove(id) {
  const artifact = _artifacts.get(id);
  if (!artifact) return false;

  _artifacts.delete(id);

  const userSet = _userIndex.get(artifact.userId);
  if (userSet) {
    userSet.delete(id);
    if (userSet.size === 0) _userIndex.delete(artifact.userId);
  }

  const teamSet = _teamIndex.get(artifact.teamId);
  if (teamSet) {
    teamSet.delete(id);
    if (teamSet.size === 0) _teamIndex.delete(artifact.teamId);
  }

  return true;
}

/**
 * Remove all artifacts for a user.
 *
 * @param {string} userId
 * @returns {number} — count removed
 */
export function removeForUser(userId) {
  const ids = _userIndex.get(userId);
  if (!ids) return 0;

  let count = 0;
  for (const id of [...ids]) {
    if (remove(id)) count++;
  }
  return count;
}

/**
 * Expire old artifacts.
 *
 * @param {number} [maxAgeMs=DEFAULT_MAX_AGE_MS]
 * @returns {number} — count expired
 */
export function expire(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs;
  let count = 0;

  for (const [id, artifact] of _artifacts) {
    if (artifact.updatedAt < cutoff) {
      remove(id);
      count++;
    }
  }

  if (count > 0) {
    console.log(`[artifact-store] Expired ${count} artifact(s) older than ${Math.round(maxAgeMs / 60000)}min`);
  }
  return count;
}

/**
 * Get store stats.
 *
 * @returns {{ totalArtifacts: number, totalSize: number, userCount: number, teamCount: number }}
 */
export function stats() {
  let totalSize = 0;
  for (const a of _artifacts.values()) {
    totalSize += a.content.length;
  }
  return {
    totalArtifacts: _artifacts.size,
    totalSize,
    userCount: _userIndex.size,
    teamCount: _teamIndex.size,
  };
}

/**
 * Clear all artifacts (for testing or restart).
 */
export function clear() {
  _artifacts.clear();
  _userIndex.clear();
  _teamIndex.clear();
}

// ─── Testing exports ────────────────────────────────────────────────────────

export const _testing = {
  MAX_ARTIFACT_SIZE,
  MAX_ARTIFACTS_PER_USER,
  DEFAULT_MAX_AGE_MS,
  _artifacts,
  _userIndex,
  _teamIndex,
};
