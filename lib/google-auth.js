/**
 * @module lib/google-auth
 * Google OAuth2 manager for Scratchy v2.
 *
 * Handles per-user OAuth2 token storage, refresh, and client creation.
 * Tokens are stored in SQLite (encrypted at rest via DB-level encryption).
 *
 * SECURITY: Gmail scopes are readonly + compose (draft creation).
 * gmail.send is intentionally NOT requested — sending is done via
 * Gmail API drafts.send in the REST-only route, which creates a draft
 * first then sends it. The OAuth scope still needs gmail.compose for this.
 *
 * Scopes requested:
 *   - gmail.readonly   — read inbox, search, get messages
 *   - gmail.compose    — create drafts (agent pre-fill) + send drafts (human-only REST)
 *   - calendar         — read/write calendar events
 *   - tasks            — read/write tasks
 */

import { google } from 'googleapis';

// ─── Config ─────────────────────────────────────────────────────────────────

/** @type {{ clientId: string, clientSecret: string, redirectUri: string } | null} */
let oauthConfig = null;

/** @type {import('better-sqlite3').Database | null} */
let db = null;

/**
 * OAuth2 scopes — intentionally NO gmail.send.
 * gmail.compose allows creating drafts and sending them via drafts.send,
 * but the send path is only in the REST handler (human-only).
 */
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

// ─── Schema ─────────────────────────────────────────────────────────────────

function ensureTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS google_tokens (
      userId       TEXT PRIMARY KEY,
      accessToken  TEXT NOT NULL,
      refreshToken TEXT,
      expiryDate   INTEGER,
      email        TEXT,
      updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ─── Init ───────────────────────────────────────────────────────────────────

/**
 * Initialize the Google Auth module.
 * @param {import('better-sqlite3').Database} database
 * @param {{ clientId: string, clientSecret: string, redirectUri: string }} config
 */
export function init(database, config) {
  db = database;
  oauthConfig = config;
  ensureTable(db);
  console.log('[google-auth] Initialized');
}

/**
 * Check if Google OAuth is configured.
 * @returns {boolean}
 */
export function isConfigured() {
  return !!(oauthConfig?.clientId && oauthConfig?.clientSecret);
}

// ─── OAuth2 Client ──────────────────────────────────────────────────────────

/**
 * Create a bare OAuth2 client (no tokens).
 * @returns {import('googleapis').Common.OAuth2Client}
 */
function createClient() {
  if (!oauthConfig) throw new Error('Google OAuth not configured');
  return new google.auth.OAuth2(
    oauthConfig.clientId,
    oauthConfig.clientSecret,
    oauthConfig.redirectUri,
  );
}

/**
 * Get the OAuth2 authorization URL for a user.
 * @param {string} userId
 * @returns {string}
 */
export function getAuthUrl(userId) {
  const client = createClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: userId,
  });
}

/**
 * Exchange an authorization code for tokens and store them.
 * @param {string} userId
 * @param {string} code
 * @returns {Promise<{ email: string | null }>}
 */
export async function exchangeCode(userId, code) {
  const client = createClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Get the user's email address
  let email = null;
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    email = profile.data.emailAddress || null;
  } catch { /* non-critical */ }

  // Store tokens
  db.prepare(`
    INSERT INTO google_tokens (userId, accessToken, refreshToken, expiryDate, email, updatedAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(userId) DO UPDATE SET
      accessToken = excluded.accessToken,
      refreshToken = COALESCE(excluded.refreshToken, google_tokens.refreshToken),
      expiryDate = excluded.expiryDate,
      email = excluded.email,
      updatedAt = datetime('now')
  `).run(
    userId,
    tokens.access_token,
    tokens.refresh_token || null,
    tokens.expiry_date || null,
    email,
  );

  return { email };
}

/**
 * Get an authenticated OAuth2 client for a user.
 * Automatically refreshes expired tokens.
 * @param {string} userId
 * @returns {Promise<import('googleapis').Common.OAuth2Client | null>}
 */
export async function getClient(userId) {
  const row = db.prepare('SELECT * FROM google_tokens WHERE userId = ?').get(userId);
  if (!row) return null;

  const client = createClient();
  client.setCredentials({
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
    expiry_date: row.expiryDate,
  });

  // Auto-refresh if expired
  if (row.expiryDate && Date.now() > row.expiryDate - 60000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      db.prepare(`
        UPDATE google_tokens SET accessToken = ?, expiryDate = ?, updatedAt = datetime('now')
        WHERE userId = ?
      `).run(credentials.access_token, credentials.expiry_date, userId);
      client.setCredentials(credentials);
    } catch (err) {
      console.error('[google-auth] Token refresh failed:', err.message);
      return null;
    }
  }

  return client;
}

/**
 * Check if a user has Google OAuth connected.
 * @param {string} userId
 * @returns {{ connected: boolean, email: string | null }}
 */
export function getStatus(userId) {
  const row = db.prepare('SELECT email FROM google_tokens WHERE userId = ?').get(userId);
  return { connected: !!row, email: row?.email || null };
}

/**
 * Disconnect Google OAuth for a user (revoke + delete tokens).
 * @param {string} userId
 */
export async function disconnect(userId) {
  const row = db.prepare('SELECT accessToken FROM google_tokens WHERE userId = ?').get(userId);
  if (row) {
    try {
      const client = createClient();
      await client.revokeToken(row.accessToken);
    } catch { /* best effort */ }
    db.prepare('DELETE FROM google_tokens WHERE userId = ?').run(userId);
  }
}
