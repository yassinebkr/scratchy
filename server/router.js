/**
 * @module router
 * Scratchy v2 — HTTP router (no external dependencies)
 *
 * Provides static file serving, JSON API routes, security headers,
 * and a built-in JSON body parser. Designed for Node.js built-in `http`.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Root directory for static assets */
const PUBLIC_DIR = resolve(__dirname, '..', 'public');

/** Package version — read once at startup */
const PKG_VERSION = '2.0.0-alpha.1';

/** MIME type map for static file serving */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Read the full request body as a UTF-8 string, with a size limit.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=1_048_576] 1 MB default
 * @returns {Promise<string>}
 */
function readBody(req, maxBytes = 1_048_576) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (chunk) => {
      len += chunk.length;
      if (len > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Parse JSON body from a request.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/**
 * Apply security headers to every response.
 * @param {import('node:http').ServerResponse} res
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
}

/**
 * Check CORS — same-origin only (block cross-origin API requests).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true if request was blocked
 */
function handleCors(req, res) {
  const origin = req.headers.origin;
  // If no Origin header, it's same-origin (non-CORS) — allow
  if (!origin) return false;

  const host = req.headers.host;
  // Allow if origin matches the host
  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return false;
  } catch {
    // malformed origin
  }

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Block cross-origin requests to API
  if (req.url?.startsWith('/api')) {
    json(res, 403, { error: 'Cross-origin requests not allowed' });
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Static file serving                                               */
/* ------------------------------------------------------------------ */

/**
 * Serve a static file from PUBLIC_DIR.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 * @returns {Promise<boolean>} true if file was served
 */
async function serveStatic(req, res, pathname) {
  // Strip query string (used for cache-busting ?v=xxx)
  const cleanPath = pathname.split('?')[0];

  // Resolve and ensure we stay inside PUBLIC_DIR (prevent directory traversal)
  let filePath = resolve(PUBLIC_DIR, '.' + cleanPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    json(res, 403, { error: 'Forbidden' });
    return true;
  }

  // If path is /, serve index.html
  if (cleanPath === '/') {
    filePath = join(PUBLIC_DIR, 'index.html');
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;

    const ext = extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await readFile(filePath);

    const headers = { 'Content-Type': mime, 'Content-Length': data.length };

    // Cache versioned assets aggressively; everything else gets short cache
    if (pathname.includes('?v=')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }

    res.writeHead(200, headers);
    res.end(data);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} RouterOpts
 * @property {import('./auth.js')} [auth]      — auth module (login, signup, etc.)
 * @property {Function}            [getDb]     — database getter
 * @property {string}              [version]   — package version override
 */

/**
 * Create the main HTTP request handler.
 *
 * @param {RouterOpts} [opts={}]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createRouter(opts = {}) {
  const auth = opts.auth ?? null;
  const version = opts.version ?? PKG_VERSION;
  const startedAt = Date.now();

  /**
   * Extract bearer token from Authorization header or cookie.
   * @param {import('node:http').IncomingMessage} req
   * @returns {string|null}
   */
  function extractToken(req) {
    // Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // Cookie: token=<token>
    const cookie = req.headers.cookie;
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)token=([^\s;]+)/);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Authenticate a request. Returns user object or null.
   * @param {import('node:http').IncomingMessage} req
   * @returns {Promise<{id:string, username:string, displayName:string}|null>}
   */
  async function authenticate(req) {
    if (!auth) return null;
    const token = extractToken(req);
    if (!token) return null;
    try {
      return await auth.validateSession(token);
    } catch {
      return null;
    }
  }

  /**
   * Require authentication — sends 401 if not authenticated.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {Promise<{id:string, username:string, displayName:string}|null>}
   */
  async function requireAuth(req, res) {
    const user = await authenticate(req);
    if (!user) {
      json(res, 401, { error: 'Authentication required' });
      return null;
    }
    return user;
  }

  /* -- Main request handler -- */
  return async function handleRequest(req, res) {
    // Security headers on every response
    setSecurityHeaders(res);

    // CORS check
    if (handleCors(req, res)) return;

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    try {
      /* ---------- API routes ---------- */

      // Health check (no auth required)
      if (method === 'GET' && pathname === '/api/health') {
        return json(res, 200, {
          status: 'ok',
          version,
          uptime: Math.floor((Date.now() - startedAt) / 1000),
        });
      }

      // Auth: login
      if (method === 'POST' && pathname === '/api/auth/login') {
        if (!auth) return json(res, 501, { error: 'Auth not configured' });
        const body = await parseJsonBody(req);
        const { username, password } = body;
        if (!username || !password) {
          return json(res, 400, { error: 'username and password required' });
        }
        try {
          const result = await auth.login(String(username), String(password));
          // Set cookie as well for browser convenience
          res.setHeader('Set-Cookie', `token=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
          return json(res, 200, result);
        } catch (err) {
          const status = err.status ?? 401;
          return json(res, status, { error: err.message ?? 'Login failed' });
        }
      }

      // Auth: signup
      if (method === 'POST' && pathname === '/api/auth/signup') {
        if (!auth) return json(res, 501, { error: 'Auth not configured' });
        const body = await parseJsonBody(req);
        const { username, password, displayName } = body;
        if (!username || !password) {
          return json(res, 400, { error: 'username and password required' });
        }
        try {
          const result = await auth.signup(
            String(username),
            String(password),
            displayName ? String(displayName) : undefined,
          );
          res.setHeader('Set-Cookie', `token=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
          return json(res, 201, result);
        } catch (err) {
          const status = err.status ?? 400;
          return json(res, status, { error: err.message ?? 'Signup failed' });
        }
      }

      // Auth: me (who am I?)
      if (method === 'GET' && pathname === '/api/auth/me') {
        const user = await requireAuth(req, res);
        if (!user) return; // 401 already sent
        return json(res, 200, {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        });
      }

      // Auth: logout
      if (method === 'POST' && pathname === '/api/auth/logout') {
        const token = extractToken(req);
        if (token && auth) {
          try { await auth.logout(token); } catch { /* ignore */ }
        }
        // Clear cookie
        res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { ok: true });
      }

      // Chat history (placeholder)
      if (method === 'GET' && pathname === '/api/history') {
        const user = await requireAuth(req, res);
        if (!user) return;
        // TODO: wire up to real history store
        return json(res, 200, []);
      }

      // Unknown API route
      if (pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'Not found' });
      }

      /* ---------- Static files ---------- */
      if (method === 'GET' || method === 'HEAD') {
        const served = await serveStatic(req, res, pathname);
        if (served) return;

        // SPA fallback — serve index.html for non-file routes
        const spaServed = await serveStatic(req, res, '/');
        if (spaServed) return;
      }

      // Catch-all 404
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[router] Request error:', err);
      const status = err.status ?? 500;
      json(res, status, { error: err.message ?? 'Internal server error' });
    }
  };
}
