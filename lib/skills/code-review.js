/**
 * @skill code-review
 * Systematic code review with security and quality focus.
 * Agents: Architect (architectural review), QA (detailed review)
 */
export default {
  id: 'code-review',
  name: 'Code Review',
  description: 'Structured code review covering correctness, security, performance, and style',
  category: 'quality',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Code Review

### Review Protocol (apply to ALL code changes)

**Pass 1 — Correctness**
- Does the code do what the spec says?
- Are all edge cases handled?
- Are error paths covered (try/catch on every async boundary)?
- Are resources cleaned up (connections, processes, file handles, timers)?
- Are all inputs validated before use?

**Pass 2 — Security**
- No SQL injection (all queries use prepared statements)
- No path traversal (validate file paths against allowed directories)
- No credential exposure (no secrets in code, logs, or error messages)
- No unbounded operations (all loops/recursion have limits)
- No eval() or Function() with user input
- Check for prototype pollution in object merges

**Pass 3 — Performance**
- No N+1 query patterns (batch database calls)
- No synchronous I/O in request handlers
- No unbounded memory growth (arrays/maps without size limits)
- Are there unnecessary allocations in hot paths?

**Pass 4 — Style & Consistency**
- ESM imports (no require())
- Consistent naming (camelCase for JS, snake_case for SQL)
- JSDoc on exported functions
- Meaningful variable names (no single letters except loop counters)
- No dead code or commented-out blocks

### Severity Classification
- **BLOCK**: Must fix before merge — bugs, security issues, spec violations, syntax errors
- **WARN**: Should fix — naming issues, missing error handling, minor inconsistencies
- **NOTE**: Optional — style preferences, optimization opportunities

### Output Format
For each file reviewed:
1. File path
2. Overall verdict: PASS / PASS WITH WARNINGS / BLOCK
3. List of findings with severity + line reference + explanation + suggested fix`,
};
