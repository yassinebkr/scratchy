/**
 * @module server/routes/byok
 * BYOK (Bring Your Own Key) API routes.
 *
 * POST   /api/byok/keys      — add/update an API key
 * GET    /api/byok/keys      — list user's keys (no secret values)
 * DELETE /api/byok/keys/:provider — remove a key
 * POST   /api/byok/validate  — validate a key without storing
 */

import { getBYOK, validateKey, detectProvider } from '../../lib/byok.js';

/**
 * Handle BYOK API requests.
 * @param {string} method
 * @param {string} pathname
 * @param {object} user — authenticated user
 * @param {object} body — parsed request body (for POST)
 * @param {Function} json — response helper
 * @param {object} res
 * @returns {boolean} — true if handled
 */
export async function handleBYOK(method, pathname, user, body, json, res) {
  const byok = getBYOK();

  // POST /api/byok/keys — add/update key
  if (method === 'POST' && pathname === '/api/byok/keys') {
    const { key, label } = body || {};
    if (!key || typeof key !== 'string' || key.length < 10) {
      return json(res, 400, { error: 'Invalid API key' });
    }
    try {
      const result = await byok.setKey(user.id, key.trim(), label || '');
      return json(res, 200, {
        success: true,
        provider: result.provider,
        label: result.label,
        message: `${result.provider} key saved. Your plan has been upgraded to BYOK.`,
      });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  // GET /api/byok/keys — list keys
  if (method === 'GET' && pathname === '/api/byok/keys') {
    const keys = byok.listKeys(user.id);
    return json(res, 200, { keys });
  }

  // DELETE /api/byok/keys/:provider
  if (method === 'DELETE' && pathname.startsWith('/api/byok/keys/')) {
    const provider = pathname.split('/').pop();
    if (!provider) return json(res, 400, { error: 'Provider required' });
    byok.deleteKey(user.id, provider);
    return json(res, 200, { success: true, message: `${provider} key removed.` });
  }

  // POST /api/byok/validate — validate without storing
  if (method === 'POST' && pathname === '/api/byok/validate') {
    const { key } = body || {};
    if (!key) return json(res, 400, { error: 'Key required' });
    const provider = detectProvider(key.trim());
    const result = await validateKey(key.trim(), provider);
    return json(res, 200, result);
  }

  return false; // not handled
}
