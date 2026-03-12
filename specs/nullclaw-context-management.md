# NullClaw Context Management — Architecture Spec
> Author: Gilberte + Yassine | Created: 2026-03-12
> Status: DRAFT — ready for implementation
> Priority: P0 (blocks reliable agent responses)

## Problem Statement

NullClaw currently has **zero context management**. It loads everything it can find into every API request:
- Full workspace directory (was 4.5MB before manual cleanup)
- All memory files (daily logs accumulate indefinitely)
- Full conversation history (including large tool results)
- 13 MCP tool schemas (~10KB)
- Its own system prompt + the orchestrator's augmented prompt (double wrapping)

This causes:
- **Hung requests** — Zig thread stuck serializing megabytes into JSON
- **API timeouts** — prompts exceeding model context limits
- **Wasted tokens** — irrelevant context from days-old memory files
- **Double wrapping** — orchestrator builds soul+canvas+history prompt, NullClaw wraps it again

## Current Architecture (Broken)

```
User message
  → Orchestrator builds augmented prompt:
      [Soul] + [System] + [Canvas instructions] + [MCP tools] + [History] + message
  → NullClaw receives augmented prompt as "message" field
  → NullClaw ALSO loads:
      - ~/.nullclaw/workspace/* (ALL files, recursively)
      - Session conversation history (all previous turns)
      - 13 MCP tool schemas (native tools)
      - Built-in tool schemas (shell, file_read, file_write, etc.)
  → NullClaw builds API payload combining ALL of the above
  → Sends to Anthropic
```

Total context: orchestrator prompt (~8KB) + NullClaw workspace (~4.5MB) + tools (~15KB) + history (unbounded) = **disaster**

## Target Architecture

### Principle: Orchestrator Owns Context, NullClaw is the API Proxy

NullClaw should NOT independently load workspace/memory. The orchestrator has full knowledge of what context is needed. NullClaw's job: manage the API connection, tool execution, and streaming.

```
User message
  → Orchestrator builds context-managed prompt:
      [Soul] (1-2KB)
      [System + Canvas instructions] (2KB)
      [Relevant memory] (RAG-retrieved, <5KB)
      [Conversation window] (last 6 turns full, older summarized)
      [User message]
  → NullClaw receives as "message" + system_prompt override
  → NullClaw adds ONLY:
      - MCP tool schemas (native, ~10KB)
      - Built-in tools (shell, file_*, etc.)
  → NullClaw sends to Anthropic
  → Streams response back
```

### 1. NullClaw Workspace Lockdown

**Goal:** NullClaw workspace contains ONLY operational files, not conversation memory.

**Changes:**
- `~/.nullclaw/workspace/` → limited to: `AGENTS.md` (<1KB), `TOOLS.md` (<1KB), `IDENTITY.md`
- `~/.nullclaw/workspace/memory/` → **REMOVED** entirely. Memory is managed by the orchestrator.
- Stale worker outputs (HTML files, components/) → auto-cleaned on startup
- Config option: `workspace.max_context_bytes: 10000` (hard cap, skip files beyond limit)

**NullClaw PR needed:** Add `workspace.max_context_bytes` config option. When loading workspace files for context, stop after reaching the byte limit. Skip binary files. Log a warning when limit is hit.

### 2. System Prompt Deduplication

**Goal:** One source of truth for the system prompt. No double wrapping.

**Current:**
- Orchestrator: `buildAugmentedPrompt()` → soul + canvas instructions + history + tools as TEXT
- NullClaw: adds its own system prompt from `config.json` (currently empty, but it also auto-generates one)

**Fix:**
- Orchestrator sends TWO fields to NullClaw:
  - `system_prompt`: soul + canvas instructions (static per agent, cacheable)
  - `message`: user message only (no history, no tools embedded as text)
- NullClaw sends `system_prompt` as the Anthropic `system` parameter
- Conversation history managed by NullClaw's session (see §3)
- MCP tools sent as native Anthropic `tools` parameter (already works)

**Requires:** NullClaw `/api/message` to accept `system_prompt` override field. PR-able.

### 3. Conversation Window Management

**Goal:** Bounded conversation history with smart pruning.

**Strategy (from token-optimization-research.md):**

```
Turns 1-2:     [FULL] — most recent, keep everything
Turns 3-6:     [MASKED] — observation masking (hide tool results, keep reasoning)
Turns 7-12:    [SUMMARIZED] — LLM-generated 1-2 line summary per turn
Turns 13+:     [DROPPED] — only facts extracted to memory
```

**Implementation:**
- **Observation masking** (P0, low effort): Replace `<tool_result>...</tool_result>` in turns 3+ with `[tool result: {tool_name} — {success/failure}]`. Already partially done in orchestrator's `buildAugmentedPrompt` (KEEP_RECENT=6).
- **Canvas pruning** (P0, low effort): Strip `scratchy-canvas`/`scratchy-toon` blocks from turns 4+. Already partially done (CANVAS_KEEP=3).
- **Tool result truncation** (P1): Cap tool results at 2KB in history. Full results stored in NullClaw's file system if needed.
- **Turn summarization** (P2): After 12 turns, summarize old turns into a `[Conversation summary]` block. Use a cheap model (Gemini Flash) for summarization.
- **Fact extraction** (P3): Extract key facts/decisions into persistent memory. MemGPT-style "memory formation ≠ summarization."

**NullClaw PR needed:** Add session-level config for `conversation.max_turns` and `conversation.mask_tool_results_after`. NullClaw already has session management — this adds pruning rules.

### 4. Memory Integration (Orchestrator-Side)

**Goal:** Smart memory retrieval instead of dumping all files.

**Current:** NullClaw loads ALL workspace/memory files. No selection.
**Target:** Orchestrator uses RAG (embedding search) to retrieve relevant memory snippets.

**Already exists:** Orchestrator has `retrieveContext()` with embedding-based retrieval (Gemini embeddings). But it's limited and the context block is small.

**Enhance:**
- Increase embedding chunk quality (currently basic text splitting)
- Add per-agent memory scoping (Atlas gets code context, Iris gets design context)
- Retrieve top-5 relevant chunks (max 5KB) per request
- Include in augmented prompt as `[Relevant memory]` section

### 5. Token Budget System

**Goal:** Never exceed 80% of model context window.

**Budget allocation for Sonnet (200K context):**
```
System prompt + soul:           5K tokens (~3%)
MCP tool schemas:               3K tokens (~1.5%)
Built-in tool schemas:          2K tokens (~1%)
Retrieved memory:               2K tokens (~1%)
Conversation window:           20K tokens (~10%)
User message:                   2K tokens (~1%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reserved for context:          34K tokens (~17%)
Available for response:       166K tokens (~83%)
```

**Implementation:** Orchestrator counts tokens before sending. If over budget, progressively:
1. Reduce conversation window (fewer turns kept)
2. Reduce memory context
3. Truncate user message (with warning)

## Implementation Phases

### Phase 1: Stop the Bleeding (1-2 hours)
- [x] Trim NullClaw workspace (done — 4.5MB → 280KB)
- [x] Reduce orchestrator timeouts (done — 90s/30s)
- [ ] Disable NullClaw's workspace auto-loading (set `workspace_dir` to empty/minimal)
- [ ] Add `max_context_bytes` guard in orchestrator's `buildAugmentedPrompt`

### Phase 2: Proper Context Pipeline (1 day)
- [ ] Orchestrator sends `system_prompt` + `message` separately to NullClaw
- [ ] NullClaw accepts `system_prompt` override in `/api/message`
- [ ] Observation masking on turns 3+ (strengthen existing code)
- [ ] Tool result truncation at 2KB in history

### Phase 3: Index-Based Context (1-2 days)
- [ ] Tool index: tier-1 (full schema for top 4 tools) + tier-2 (1-line index for rest)
- [ ] Memory index: auto-generated `INDEX.md` with 1-line summaries per file
- [ ] Skill index: catalog in system prompt, `get_skill` tool for full instructions
- [ ] MCP server lazy activation: keyword-based selection of relevant tool sets
- [ ] Token budget system with progressive shedding

### Phase 4: Smart Memory (2-3 days)
- [ ] Improve RAG retrieval for per-agent context
- [ ] Turn summarization after 12 turns
- [ ] Automated fact extraction from conversation (Mem0-style)
- [ ] Memory index auto-refresh (regenerate on file change)

### Phase 5: NullClaw PRs (ongoing)
- [ ] `workspace.max_context_bytes` config
- [ ] `conversation.max_turns` + `conversation.mask_tool_results_after` session config
- [ ] `/api/message` `system_prompt` override field
- [ ] `get_tool_schema` meta-tool for on-demand schema loading
- [ ] `get_skill` built-in tool for lazy skill expansion
- [ ] Session history export/import for migration

## 6. Index-Based Context Loading (Lazy Expansion)

### Problem
The system prompt currently front-loads everything: full tool schemas, full skill descriptions, full memory context, full MCP tool definitions. Most of this is irrelevant to the current request. A "create a kanban board" request doesn't need the `render_dashboard` schema, the email skill description, or memory from March 4th.

### Solution: Compact Indexes + On-Demand Expansion

Instead of dumping full definitions into the system prompt, load **lightweight indexes** (name + 1-line summary). The model reads the index, identifies what it needs, and pulls full details via tool calls.

### 6.1 Tool Index

**Current (wasteful):** 13 MCP tool schemas in system prompt (~10KB)
```
tools: [
  { name: "render_dashboard", input_schema: { type: "object", properties: { title: {...}, gauges: {...}, stats: {...}, ... } } },
  { name: "create_from_template", input_schema: { ... } },
  ... 11 more full schemas
]
```

**Target (compact):** Index in system prompt (~500B) + detail tool
```
[Available tools]
- render_dashboard: Render a dashboard with gauges, stats, charts
- render_comparison: Side-by-side comparison cards
- render_code: Code block with syntax highlighting
- render_project: Project overview with timeline, tasks, stats
- create_from_template: Instant widget from template (kanban|timer|expense|poll|quiz|counter|checklist)
- create_live_widget: Custom widget with HTML/CSS/JS
- suggest_team: Suggest team delegation for complex tasks
- update: Patch existing component data
- remove: Remove a component
- clear: Clear all components
```

The model sees the index, picks `create_from_template`, and NullClaw resolves the full schema at call time. The model already knows tool calling conventions — it doesn't need the full JSON schema in every prompt to call correctly.

**Implementation:** Anthropic's API requires full `tools` array with schemas. But we can use a **two-tier approach:**
- **Tier 1 (always loaded):** Most-used tools with full schemas (create_from_template, create_live_widget, update, remove) — ~3KB
- **Tier 2 (on-demand):** Less-used tools listed as index only. A `get_tool_schema` meta-tool returns full schema when needed.
- **Selection heuristic:** Analyze the user message to predict which tools are relevant (keyword matching or embedding similarity against tool descriptions).

### 6.2 Memory Index

**Current (wasteful):** All memory files loaded into workspace context (~hundreds of KB)

**Target:** Compact memory index in system prompt (~200B) + retrieval tool
```
[Memory — use memory_recall to retrieve details]
- 2026-03-12: NullClaw context management, widget templates, SO_RCVTIMEO fix
- 2026-03-11: Live widget system, template compiler, MCP stdout fix
- 2026-03-10: Canvas MCP pipeline v2, team delegation E2E
- Key facts: 4 default agents, NullClaw port 28000, v2.clawos.fr
```

The model sees topic summaries. If it needs details about "widget templates", it calls `memory_recall("widget templates")` which does embedding search and returns the relevant chunk.

**Implementation:**
- On startup / periodic: Generate 1-line summaries per memory file (can use cheap model or extractive summarization — first heading + key terms)
- Store index in `memory/INDEX.md` (auto-generated, <1KB)
- `memory_recall` tool already exists in NullClaw — just make the index the default context instead of the full files

### 6.3 Skill Index

**Current:** Full skill descriptions embedded in agent souls or system prompts

**Target:** Skill catalog index (~300B) + `get_skill` tool
```
[Skills — use get_skill(name) for full instructions]
- canvas: GenUI component rendering (34 types, templates, TOON format)
- code: File operations, git, deployment
- research: Web search, URL fetch, summarization
- email: Compose and send via Resend API
```

When the model needs to render canvas components, it calls `get_skill("canvas")` which returns the relevant subset of instructions. This keeps the system prompt lean while maintaining accuracy — the model gets full instructions exactly when it needs them.

**Implementation:**
- Skills already exist as files (soul files, TOOLS.md sections)
- Add `get_skill` as a built-in NullClaw tool (reads from a skills directory)
- Index auto-generated from skill file frontmatter/headers

### 6.4 MCP Server Index

**Current:** All MCP servers initialized on startup, all tool schemas loaded

**Target:** MCP servers activated on-demand based on request analysis
```
[MCP Servers — activated on demand]
- canvas: UI rendering tools (13 tools) — auto-activated for visual requests
- (future) data: Database query tools
- (future) code: Code analysis tools
```

**Implementation:**
- Orchestrator analyzes user message keywords/intent
- Only activates relevant MCP servers for the request
- Reduces tool schema bloat from 13 tools to 3-5 per request
- Already partially supported: `ensureMcpServers()` activates per-agent

### Token Savings Estimate

| Component | Current | With Indexes | Savings |
|-----------|---------|-------------|---------|
| Tool schemas | ~10KB (3K tokens) | ~1.5KB index + 2KB relevant (1.2K tokens) | ~60% |
| Memory context | ~50KB+ (15K tokens) | ~0.5KB index + 5KB retrieved (1.8K tokens) | ~88% |
| Skill instructions | ~5KB (1.5K tokens) | ~0.3KB index + on-demand (0.1K base) | ~93% |
| System prompt total | ~65KB (19.5K tokens) | ~2.3KB base + ~7KB expanded (3.1K tokens) | **~84%** |

With index-based loading: **~3K tokens base system prompt** instead of ~20K. The model pulls what it needs. Accuracy is maintained because full details are available on-demand — just not front-loaded.

### Key Insight: Indexes ≠ Less Capable

The model doesn't need to memorize every tool parameter to use tools correctly. It needs to:
1. **Know what's available** → index provides this
2. **Know how to call it** → schema provided at call time, or learned from 1-line description
3. **Know when to use it** → index description + user intent matching

This mirrors how humans work: you don't memorize every API doc. You know what tools exist, and look up the details when you need them.

## Design Principles
1. **Orchestrator owns context** — NullClaw is the API proxy, not the context manager
2. **Smart retrieval > full dump** — RAG-retrieve 5KB of relevant context, not 4.5MB of everything
3. **Observation masking > summarization** — cheaper, more predictable, proven (JetBrains NeurIPS 2025)
4. **Token budget is a hard limit** — never send more than 80% of context window
5. **Memory formation ≠ conversation history** — extract facts, don't replay transcripts (Mem0 approach)
6. **Every PR should be upstream-mergeable** — follow NullClaw's Zig style, minimal changes, well-tested
7. **Index everything, load on demand** — compact indexes in system prompt, full details via tool calls
8. **The model is the router** — give it a map (index), let it decide what to load (tool calls)
