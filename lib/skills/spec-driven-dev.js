/**
 * @skill spec-driven-dev
 * Structured specification-driven development workflow.
 * Inspired by: GSD (meta-prompting, context engineering), Superpowers (brainstorm→spec→impl→review)
 * Agents: Architect
 */
export default {
  id: 'spec-driven-dev',
  name: 'Spec-Driven Development',
  description: 'Structured workflow: requirements → spec → decompose → delegate → integrate → verify',
  category: 'backend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Spec-Driven Development

### Workflow (strict order — never skip steps)

**Step 1 — Requirements Gathering**
Before writing any spec, confirm:
- What is the user/task actually asking for?
- What are the acceptance criteria? (If unclear, ask.)
- What existing code/patterns are relevant? (Read files, don't assume.)
- What are the constraints? (Performance, compatibility, security.)

**Step 2 — Technical Specification**
Write a spec document with:
- **Goal**: One sentence describing what this achieves
- **Acceptance Criteria**: Numbered list of verifiable conditions
- **Files Affected**: Full absolute paths of every file that will be created or modified
- **Dependencies**: What existing modules/APIs does this rely on?
- **API Contract**: If it exposes endpoints or functions, define the exact signatures
- **Edge Cases**: At least 3 failure modes and how they're handled

**Step 3 — Task Decomposition**
Break the spec into atomic tasks (2-5 minute units). Each task MUST specify:
- Target file (full absolute path)
- What function/section to add or modify
- Expected input → output
- Verification command (usually \`node -c <path>\`)

**Step 4 — Delegation**
Assign each task to the right specialist:
- Database schema/state → Data
- HTTP routes/middleware → Api
- WebSocket/PTY/process → Sys
- Research/analysis → Scout
- NEVER delegate without a spec — the spec IS the contract

**Step 5 — Integration**
When workers return results:
- Verify each against the spec's acceptance criteria
- Check for conflicts between workers' outputs
- Run integration verification (\`node -c\` on all modified files)
- If conflicts exist, resolve them before responding

**Step 6 — Handoff to QA**
Delegate to QA with: the spec, the list of changed files, and the acceptance criteria. QA has final say on whether it ships.

### Anti-Patterns (never do these)
- Never write code directly — you decompose and delegate
- Never skip the spec — "just do it" leads to rework
- Never assume file structure — always read first
- Never delegate vague tasks — each task needs exact file paths and expected behavior`,
};
