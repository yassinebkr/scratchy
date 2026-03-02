/**
 * @skill api-engineering
 * REST API design, validation, middleware, error handling.
 * Agents: Api
 */
export default {
  id: 'api-engineering',
  name: 'API Engineering',
  description: 'REST endpoint design, request validation, middleware patterns, error handling',
  category: 'backend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: API Engineering

### Endpoint Design
- RESTful paths: \`/api/{resource}\` (collection), \`/api/{resource}/:id\` (item), \`/api/{resource}/:id/{action}\` (action)
- HTTP methods: GET (read), POST (create), PUT (full replace), PATCH (partial update), DELETE (remove)
- Status codes: 200 (ok), 201 (created), 204 (no content), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 500 (server error)

### Response Envelope (always use this)
\`\`\`js
// Success
res.json({ ok: true, data: result });

// Error
res.status(400).json({ ok: false, error: 'Validation failed', details: errors });

// List with pagination
res.json({ ok: true, data: items, pagination: { total, offset, limit } });
\`\`\`

### Validation Pattern
\`\`\`js
function handleCreateWidget(req, res) {
  const { name, type } = req.body;

  // Guard clauses — return early on failure
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ ok: false, error: 'name is required (string)' });
  }
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ ok: false, error: 'type must be one of: ' + VALID_TYPES.join(', ') });
  }

  // Sanitize
  const safeName = name.trim().slice(0, 200);

  // Execute
  try {
    const result = createWidget({ name: safeName, type });
    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    console.error('[api] createWidget failed:', err.message);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
}
\`\`\`

### Middleware Patterns
- **Auth check**: Verify session/token before handler, return 401 if missing, 403 if insufficient
- **Rate limiting**: Track requests per userId per window (e.g., 100/min), return 429 with Retry-After
- **Request logging**: Log method, path, userId, duration (but NEVER log request bodies with credentials)
- **CORS**: Only allow configured origins, never \`*\` in production

### Documentation (JSDoc every endpoint)
\`\`\`js
/**
 * POST /api/widgets
 * Create a new widget.
 * @param {string} req.body.name — Widget name (required, max 200 chars)
 * @param {string} req.body.type — Widget type (required, one of: chart, table, form)
 * @returns {{ ok: true, data: Widget }} 201 on success
 * @returns {{ ok: false, error: string }} 400 on validation failure
 */
\`\`\`

### Rules
- Never trust client input — validate everything server-side
- Never expose internal error details to clients (stack traces, SQL errors)
- Always use try/catch around database operations
- Consistent field naming: camelCase in JSON responses
- Pagination on all list endpoints (default limit: 50, max: 200)`,
};
