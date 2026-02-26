/**
 * @module server/auth
 * Authentication middleware and helpers.
 * Uses Node.js built-in crypto (scrypt) — no external dependencies.
 */

import crypto from 'node:crypto';
import { getSession } from '../state/sessions.js';
import { getUser } from '../state/users.js';

/** scrypt parameters */
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;   // N
const SCRYPT_BLOCK = 8;      // r
const SCRYPT_PARALLEL = 1;   // p
const SALT_LENGTH = 16;

/**
 * Hash a plaintext password using scrypt.
 * Returns a string in the format: salt:hash (both hex-encoded).
 * @param {string} plain - Plaintext password
 * @returns {Promise<string>} The salt:hash string
 */
export function hashPassword(plain) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    crypto.scrypt(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL }, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derived.toString('hex')}`);
    });
  });
}

/**
 * Verify a plaintext password against a stored hash.
 * @param {string} plain - Plaintext password to check
 * @param {string} hash - Stored hash in salt:hex format
 * @returns {Promise<boolean>} True if the password matches
 */
export function verifyPassword(plain, hash) {
  return new Promise((resolve, reject) => {
    const [saltHex, keyHex] = hash.split(':');
    if (!saltHex || !keyHex) return resolve(false);

    const salt = Buffer.from(saltHex, 'hex');
    const storedKey = Buffer.from(keyHex, 'hex');

    crypto.scrypt(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL }, (err, derived) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(storedKey, derived));
    });
  });
}

/**
 * Generate a cryptographically secure random token (hex string).
 * @param {number} [bytes=32] - Number of random bytes (token will be 2× chars)
 * @returns {string} Hex-encoded token
 */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Express/Connect auth middleware.
 * Checks for a Bearer token in the Authorization header or a `session` cookie.
 * On success, attaches `req.user` (full user row) and `req.session` (session row).
 * On failure, responds with 401.
 *
 * @param {import('http').IncomingMessage & { user?: any, session?: any, cookies?: Record<string,string> }} req
 * @param {import('http').ServerResponse} res
 * @param {Function} next
 */
export function authMiddleware(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return sendUnauthorized(res, 'Missing authentication token');
  }

  const session = getSession(token);
  if (!session) {
    return sendUnauthorized(res, 'Invalid or expired session');
  }

  const user = getUser(session.userId);
  if (!user) {
    return sendUnauthorized(res, 'User not found');
  }

  // Attach to request
  req.user = user;
  req.session = session;
  next();
}

/**
 * Extract a session token from the request.
 * Checks Authorization: Bearer <token> first, then falls back to cookies.
 * @param {import('http').IncomingMessage & { cookies?: Record<string,string> }} req
 * @returns {string|null}
 */
function extractToken(req) {
  // 1. Authorization header
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Cookie (pre-parsed by cookie middleware or manual parse)
  if (req.cookies?.session) {
    return req.cookies.session;
  }

  // 3. Fallback: parse cookie header manually
  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^\s;]+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Send a 401 Unauthorized JSON response.
 * @param {import('http').ServerResponse} res
 * @param {string} message
 */
function sendUnauthorized(res, message) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized', message }));
}
