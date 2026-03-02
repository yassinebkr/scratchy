/**
 * @skill research
 * Web research, codebase analysis, competitive intelligence.
 * Inspired by: surf-cli (browser control for deep research)
 * Agents: Scout
 */
export default {
  id: 'research',
  name: 'Technical Research',
  description: 'Web research, codebase analysis, competitive intelligence, documentation review',
  category: 'research',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Technical Research

### Research Protocol

**Step 1 — Scope**
Before searching, define:
- What question are we answering?
- What type of source do we need? (docs, code, academic, competitive)
- What format should the output be? (comparison table, summary, recommendation)

**Step 2 — Source Gathering**
Use tools strategically:
- \`web_search\` for broad discovery — find the right URLs
- \`web_fetch\` for deep reading — extract specific content from URLs
- \`context_search\` for internal codebase — find existing patterns
- \`memory_search\` for prior research — avoid re-doing past work

**Step 3 — Analysis**
For each source:
- Extract the key claims/patterns/data points
- Note reliability (official docs > blog posts > Stack Overflow > Reddit)
- Note recency (check dates — APIs change, patterns evolve)
- Note applicability (does this match our stack? Node.js ESM, better-sqlite3, shadow DOM)

**Step 4 — Synthesis**
Combine findings into actionable output:
- Comparison tables for alternatives
- Pros/cons for each option
- Clear recommendation with reasoning
- Links to primary sources

### Codebase Analysis Patterns
When analyzing existing code:
1. Read the file completely — don't skim
2. Map the module's exports (what does it expose?)
3. Trace the call chain (who calls this? what does it call?)
4. Identify patterns (naming, error handling, state management)
5. Note inconsistencies or tech debt

### Competitive Intelligence
When analyzing competitor products:
- Feature matrix: what they have vs what we have
- Pricing comparison: their tiers vs ours
- Architecture signals: what tech stack, what patterns
- User feedback: what do their users complain about?
- Differentiation: what's our unique advantage?

### Output Format
Always use structured GenUI components:
- \`table\` for comparisons and feature matrices
- \`kv\` for key findings
- \`link-card\` for source references (always include URL)
- \`timeline\` for chronological findings
- \`chart-bar\` or \`chart-pie\` for quantitative comparisons

### Rules
- Always cite sources with URLs
- Never present opinions as facts
- Flag uncertainty: "Based on 2 sources" vs "widely documented"
- If information is older than 6 months, note that explicitly
- Don't just list findings — synthesize and recommend`,
};
