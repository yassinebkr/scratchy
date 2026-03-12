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

### Phase 3: Smart Memory (2-3 days)
- [ ] Improve RAG retrieval for per-agent context
- [ ] Turn summarization after 12 turns
- [ ] Automated fact extraction from conversation
- [ ] Token budget system

### Phase 4: NullClaw PRs (ongoing)
- [ ] `workspace.max_context_bytes` config
- [ ] `conversation.max_turns` + `conversation.mask_tool_results_after` session config
- [ ] `/api/message` `system_prompt` override field
- [ ] Session history export/import for migration

## Design Principles
1. **Orchestrator owns context** — NullClaw is the API proxy, not the context manager
2. **Smart retrieval > full dump** — RAG-retrieve 5KB of relevant context, not 4.5MB of everything
3. **Observation masking > summarization** — cheaper, more predictable, proven (JetBrains NeurIPS 2025)
4. **Token budget is a hard limit** — never send more than 80% of context window
5. **Memory formation ≠ conversation history** — extract facts, don't replay transcripts (Mem0 approach)
6. **Every PR should be upstream-mergeable** — follow NullClaw's Zig style, minimal changes, well-tested
