/**
 * @skill security-testing
 * Security audit, test scenario generation, spec compliance validation.
 * Inspired by: Superpowers (TDD + review workflow)
 * Agents: QA
 */
export default {
  id: 'security-testing',
  name: 'Security & Testing',
  description: 'Security auditing, test scenario generation, spec compliance, quality gates',
  category: 'quality',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Security & Testing

### Security Audit Checklist (apply to ALL code)

**Injection**
- [ ] All SQL uses prepared statements (no string concatenation)
- [ ] All file paths validated against allowed directories
- [ ] No eval(), new Function(), or vm.runInContext with user input
- [ ] No template literal injection in HTML responses
- [ ] JSON.parse wrapped in try/catch (malformed input = crash)

**Authentication & Authorization**
- [ ] All API endpoints check session/auth token
- [ ] Role checks applied (user can't access admin endpoints)
- [ ] Session tokens are httpOnly, secure, sameSite
- [ ] Password hashing uses Argon2id (not bcrypt, not SHA)
- [ ] No credentials in logs, error messages, or client responses

**Resource Safety**
- [ ] All loops have a maximum iteration count
- [ ] All recursion has a depth limit
- [ ] File uploads validate size, type, and count
- [ ] Database queries have LIMIT clauses
- [ ] WebSocket connections have per-user limits

**Data Exposure**
- [ ] No internal paths leaked in error responses
- [ ] No stack traces sent to clients in production
- [ ] Sensitive fields (password, token, key) excluded from API responses
- [ ] No console.log of credentials or tokens

### Test Scenario Generation

For each feature/endpoint, generate:

**Happy Path**
- Standard use case with valid input
- Expected response body and status code

**Edge Cases**
- Empty strings, null, undefined, missing fields
- Maximum length strings (boundary testing)
- Unicode, emoji, RTL text
- Zero, negative numbers, Number.MAX_SAFE_INTEGER

**Error Cases**
- Invalid types (string where number expected)
- Unauthorized access (no token, expired token, wrong role)
- Not found (valid format ID that doesn't exist)
- Conflict (duplicate creation)

**Adversarial Cases**
- SQL injection attempts: \`'; DROP TABLE users;--\`
- Path traversal: \`../../etc/passwd\`
- XSS payloads: \`<script>alert(1)</script>\`
- Oversized payloads (1MB+ body)
- Rapid requests (rate limit testing)

### Spec Compliance Validation
When reviewing against a spec:
1. List each acceptance criterion from the spec
2. For each criterion: PASS (verified), FAIL (violated), UNTESTABLE (needs runtime)
3. Any FAIL = BLOCK — nothing ships with spec violations

### Quality Gate
Code passes QA when:
- All BLOCK issues from code review are resolved
- Security checklist has no unchecked items
- At least happy path + 2 edge cases documented
- \`node -c\` passes on all modified files
- No TODO/FIXME/HACK comments without tracking issue`,
};
