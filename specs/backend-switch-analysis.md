# Backend Switch Analysis: NullClaw vs Alternatives
> Date: 2026-02-28 | Author: Gilberte (for Yassine)

## Executive Summary

**NullClaw's tool calls ARE visible during streaming** — the architecture mismatch is a
**format bug**, not a fundamental limitation. NullClaw streams raw LLM output (including
`<tool_call>` XML) through SSE. Scratchy's detector just looks for the wrong tag format.

Fixing the detector is a ~10-line JS change. Getting tool *results* exposed requires a
small Zig enhancement (~15 lines). No backend switch needed for the core vision to work.

---

## The Actual Problem (Not What We Thought)

### What we assumed
NullClaw handles tools internally as a black box → tool calls never reach Scratchy.

### What actually happens (traced through Zig source)

```
1. Scratchy POST /api/message → NullClaw (Accept: text/event-stream)
2. NullClaw enters tool loop (agent/root.zig:turn(), max 25 iterations)
3. Each iteration:
   a. Calls LLM with streaming enabled
   b. NATIVE TOOLS ARE DISABLED during streaming (!is_streaming)
   c. LLM gets tool instructions in system prompt instead
   d. LLM responds with <tool_call>{"name":"shell","arguments":{...}}</tool_call>
   e. Each chunk → SseStreamContext.streamCallback() → SSE event:
      data: {"delta":"<tool_call>{\"name\":\"shell\",...}"}
   f. Scratchy receives this delta → feeds to toolDetector + streamFilter
   g. NullClaw parses tool calls from accumulated response
   h. NullClaw executes tools internally
   i. NullClaw adds results to history → loops to next LLM call
4. Final iteration (no tool calls) → final response streamed
5. data: [DONE] → Scratchy gets full text
```

### The bug: tag format mismatch

Scratchy's `tool-call-detector.js` looks for:
```xml
<tool_use><name>shell</name><arguments>{"cmd":"ls"}</arguments></tool_use>
```

NullClaw's LLM generates (from dispatcher.zig):
```xml
<tool_call>
{"name": "shell", "arguments": {"command": "ls"}}
</tool_call>
```

**Different tag name, different inner format.** The detector regex never matches.

### Fix: 10 lines in tool-call-detector.js
Add NullClaw format detection alongside the existing patterns:
```js
// NullClaw format: <tool_call>{"name":"shell","arguments":{...}}</tool_call>
const ncToolCallRe = /<tool_call[^>]*>([\s\S]*?)<\/tool_call>/g;
// Parse the JSON inside the tags to extract name + arguments
```

This would immediately enable:
- ✅ Terminal auto-activates when agent runs shell commands
- ✅ File explorer activates on file_read
- ✅ Editor activates on file_write/file_edit
- ✅ Search activates on web_search/web_fetch
- ⚠️ BUT: surfaces show "command started" — not the actual output (yet)

---

## What's Missing: Tool Results

After detecting `<tool_call>`, NullClaw executes the tool and adds results to history.
These results are NOT exposed via SSE — they stay internal. The next LLM iteration's
response MAY reference the results, but they're not structured.

### Enhancement: ~15 lines of Zig in agent/root.zig

In the tool execution loop (root.zig line ~1160), after `executeTool()` returns:

```zig
// Current code:
const result = self.executeTool(arena, call);

// Add SSE event emission:
if (self.stream_ctx) |ctx_ptr| {
    const sse: *SseStreamContext = @ptrCast(@alignCast(ctx_ptr));
    // Write: event: tool_result\ndata: {"name":"shell","result":"...","success":true}\n\n
    writeSseToolEvent(sse.stream, arena, call.name, result.output, result.success) catch {};
}
```

Plus a helper function `writeSseToolEvent()` (~10 lines) to format the SSE event.

This would give Scratchy:
- ✅ Real-time tool call detection (already streamed)
- ✅ Tool execution results as they happen
- ✅ Terminal shows actual command output
- ✅ File explorer shows actual file contents
- ✅ Full surface system comes alive

### Implementation effort
- Scratchy-side detector fix: **30 minutes** (JS only)
- NullClaw tool_result SSE events: **2-3 hours** (Zig, rebuild binary)
- Total: **half a day** to make the entire surface system work

---

## Alternative Backends Comparison

### ZeroClaw (Rust)
- **Repo:** github.com/theonlyhennygod/zeroclaw
- **Binary:** ~3.4MB, <5MB RAM, <10ms startup
- **Providers:** 22+ (OpenRouter, Anthropic, OpenAI, Ollama, etc.)
- **Architecture:** Trait-based (Provider, Channel, Tool, Memory, Observer, Tunnel)
- **Memory:** SQLite hybrid search (FTS5 + vector cosine similarity)
- **Tests:** 1,017 passing
- **Tool system:** Trait-based `Tool` interface — could add passthrough mode
- **Channels:** CLI, Telegram, Discord, Slack, iMessage, Matrix, WhatsApp, Webhook
- **Identity:** OpenClaw markdown + AIEOS v1.1 JSON
- **Migration:** Built-in `zeroclaw migrate openclaw` command
- **Language:** Rust (stable, mature ecosystem)

**Pros vs NullClaw:**
- Rust > Zig for ecosystem maturity, tooling, and hiring
- Trait-based plugin system (NullClaw has none)
- Built-in migration from OpenClaw
- 1,017 tests (NullClaw test coverage unknown)
- You're learning Rust — can contribute upstream
- SQLite hybrid memory with embeddings (we need this)

**Cons vs NullClaw:**
- Slightly more RAM (~5MB vs ~3.7MB) — negligible at our scale
- Fewer providers (22 vs 50+) — but covers all we use
- Unknown SSE streaming support — needs investigation
- New codebase to learn
- We already have 3 merged PRs in NullClaw

### PicoClaw (Go)
- Ultra-embedded focused (<10MB RAM, RISC-V boards)
- Too minimal for Scratchy's needs (no rich tool system)
- **Verdict: skip**

### NanoBot (Python)
- Educational/minimal (4,000 lines)
- Python = high RAM per instance
- **Verdict: skip**

### IronClaw (Rust, WASM sandboxing)
- Security-focused (WASM tool sandboxing)
- Good security model but adds overhead
- Less mature than ZeroClaw
- **Verdict: interesting for security, not for multi-user scale**

---

## Recommendation

### Don't switch backends. Fix the detector.

1. **Immediate (today):** Fix `tool-call-detector.js` to parse NullClaw's `<tool_call>` format.
   Surfaces auto-activate during streaming. Terminal shows "running shell: ls".

2. **This week:** Add tool_result SSE events to NullClaw (15 lines of Zig). Rebuild binary.
   Terminal shows actual command output. Full surface vision works.

3. **Future evaluation:** If NullClaw proves too rigid (no plugin system, Zig pre-1.0),
   ZeroClaw is the strongest alternative. But switching mid-sprint is expensive and the
   core problem (tool visibility) exists in ALL backends — it requires modification regardless.

### If we DO switch later
ZeroClaw is the clear choice:
- Rust (you're learning it, stable ecosystem)
- Trait-based architecture (cleaner extensibility)
- Built-in OpenClaw migration
- Same memory footprint class (~5MB vs ~3.7MB)
- Could be a clean migration during a "v2.1" phase after launch

---

## Decision Matrix

| Criteria | NullClaw + fix | ZeroClaw switch | Build custom (Node) |
|---|---|---|---|
| Time to working surfaces | **1 day** | 1-2 weeks | 2-3 weeks |
| RAM per instance | 3.7MB | ~5MB | >50MB |
| Tool visibility | SSE enhancement | Trait override | Native |
| Upstream contribution | 3 PRs merged | 0 | N/A |
| Language familiarity | Low (Zig) | Growing (Rust) | High (Node) |
| Plugin/extensibility | None | Trait system | Full |
| Risk | Low | Medium (new codebase) | High (build from scratch) |

**Winner: NullClaw + fix** (for now). Revisit ZeroClaw for v2.1.
