# Phase 4: Multi-Agent Teams — Full Specification
> Created: 2026-03-01 03:25 CET
> Author: Gilberte
> Status: Draft — awaiting Yassine review

---

## 1. Executive Summary

Phase 4 transforms Scratchy from a single-agent workspace into a **multi-agent team platform** — the biggest architectural leap since GenUI. Users build teams of specialized agents that collaborate on complex tasks, delegate to each other, and share context. This is Scratchy's primary competitive differentiator: no other product combines spatial GenUI workbench + multi-agent teams + marketplace in one platform.

**Phase 4 deliverables (in priority order):**
1. Team system — shared agent pools with role-based collaboration
2. Inter-agent routing — agents delegate tasks to each other
3. Agent marketplace — community templates, browse & install
4. Workspace persistence — save/load named canvas layouts
5. Collaboration — shared workspaces, live cursors (stretch)
6. Custom domains for self-hosted (stretch)

---

## 2. Competitive Landscape

### 2.1 Frameworks (what exists today)

| Framework | Pattern | Strengths | Weaknesses |
|-----------|---------|-----------|------------|
| **LangGraph** | Graph-based state machines | Complex stateful workflows, conditional branching, human-in-the-loop | Steep learning curve, Python-only, no UI |
| **CrewAI** | Role-based teams | Intuitive role/goal/backstory model, delegation built-in, hierarchical crews | Limited routing flexibility, sequential bias |
| **AutoGen** | Conversational agents | Natural multi-turn collaboration, group chat patterns | Hard to control, unpredictable token burn |
| **OpenAI Agents SDK** | Handoff functions | Clean transfer_to_X pattern, lightweight, stateless agents | No shared memory, no persistent state |
| **Google ADK** | A2A-native | Standards-based, interoperable, agent cards for discovery | Early stage, Google-centric |

### 2.2 Protocols (interoperability layer)

| Protocol | Owner | Purpose | Status |
|----------|-------|---------|--------|
| **MCP** (Model Context Protocol) | Anthropic | Agent-to-tools/data | Widely adopted, we already implement it |
| **A2A** (Agent2Agent) | Google then Linux Foundation | Agent-to-agent communication | Open standard since April 2025, growing adoption |
| **ACP** (Agent Communication Protocol) | IBM/BeeAI | Agent-to-agent (alternative to A2A) | Smaller ecosystem |
| **ANP** (Agent Network Protocol) | Community | Internet-scale agent networking | Early research phase |

### 2.3 Key Academic Insights

**O'Reilly "Designing Effective Multi-Agent Architectures" (Feb 2026):**
- "You can't prompt your way out of a system-level failure" — the *prompting fallacy*
- 4 patterns: Supervisor (control), Blackboard (shared memory), Peer-to-peer (coverage), Swarms (parallel exploration)
- Hybrid is best: fast specialists in parallel + slow aggregator for convergence
- Collaborative scaling is *conditional* — more agents != better results; topology matters

**Microsoft Multi-Agent Reference Architecture:**
- Central orchestrator + classifier + agent registry + knowledge layer + conversation history
- Supervisor agent decomposes tasks then specialist agents execute then results aggregated
- MCP for tool access, agent state persistence, hierarchical organization at scale

**Google Research on Collaborative Scaling:**
- Performance doesn't increase monotonically with agent count
- Coordination tax: communication overhead, latency, context window bloat
- Structure > quantity

### 2.4 Scratchy's Unique Position

Nobody else has:
- **Spatial GenUI workbench** — agents render rich UI components, not just text
- **Widget bridge protocol** — agents interact with smart widgets (notes, calendar, email)
- **NullClaw per-user isolation** — lightweight agent instances with 3.7MB RSS each
- **Canvas as collaboration surface** — agents can produce visual artifacts that persist in workspace

Our moat is the **combination** of teams + spatial UI + widgets + per-user backends.

---

## 3. Architecture

### 3.1 Team Model

```
Team
  id: uuid
  name: string ("DevOps Squad", "Content Factory")
  description: string
  owner_id: uuid (user who created it)
  visibility: "private" | "shared" | "marketplace"
  agents: Agent[]
    role: string ("Lead", "Specialist", "Reviewer")
    agent_id: uuid
    permissions: string[] ("delegate", "read_context", "write_canvas")
  routing_strategy: "supervisor" | "round_robin" | "skill_match" | "manual"
  shared_context: SharedContext
    memory_namespace: string
    canvas_state_id: uuid (shared workspace)
    conversation_id: uuid (team chat thread)
  created_at / updated_at
```

**Key decisions:**
- A team is a **named collection of agents with a routing strategy**
- Each agent has a **role** within the team (not just globally)
- Teams can be private (one user), shared (workspace members), or published to marketplace
- Every team has a **shared context namespace** — agents in a team can see each other's work

### 3.2 Inter-Agent Routing

Four routing strategies, selectable per team:

#### 3.2.1 Supervisor (default)
One agent acts as team lead. User messages go to the supervisor, who delegates subtasks.

```
User -> Supervisor Agent -> decides routing
                         -> delegates to Specialist A
                         -> delegates to Specialist B
                         -> aggregates results
                         -> responds to User
```

Implementation: The supervisor gets a delegate_to(agent_name, task, context) tool. When called, the orchestrator:
1. Spawns a sub-conversation with the target agent
2. Passes the task + relevant shared context
3. Returns the result to the supervisor's context
4. Supervisor synthesizes and responds to user

**Why supervisor as default:** Most intuitive for users. Clear hierarchy. Predictable behavior. O'Reilly confirms it's the best pattern for "tightly scoped, sequential reasoning problems."

#### 3.2.2 Round Robin
Messages rotate through agents in order. Each agent adds their perspective. Good for brainstorming / review workflows.

```
User -> Agent A -> Agent B -> Agent C -> synthesized response
```

Implementation: Orchestrator maintains a turn counter. Each agent sees the conversation so far + their role prompt. After all agents contribute, the last agent (or a designated synthesizer) produces the final response.

#### 3.2.3 Skill Match (intent-based routing)
Messages are classified by intent, then routed to the most appropriate agent.

```
User -> Intent Classifier -> route to best-fit agent
```

Implementation: Lightweight classifier (can be a small model or keyword/embedding match against agent descriptions) scores each agent's relevance. Top scorer handles the message. If confidence is low, falls back to supervisor or asks user.

This is similar to Microsoft's reference architecture: orchestrator + classifier + agent registry.

#### 3.2.4 Manual
User explicitly @mentions which agent should handle each message.

```
User: "@Atlas fix the login bug" -> routes to Atlas
User: "@Nova research competitors" -> routes to Nova
```

Implementation: Parse @mentions from user message. If no mention, route to default agent or show picker.

### 3.3 Shared Context

Agents in a team need to share information without leaking everything:

```
SharedContext
  team_memory: SQLite namespace
    key-value facts ("project deadline is March 15")
    conversation summaries
    decision log
  shared_canvas: canvas state that all team agents can read/write
  team_conversation: full conversation history visible to all team members
  agent_private: per-agent scratchpad (not shared)
```

**Context flow rules:**
1. When Agent A delegates to Agent B, it passes a **context summary** (not the full history)
2. Shared memory is append-only during a team session (no agent can delete another's entries)
3. Canvas ops from any team agent go to the same canvas state
4. Private agent scratchpad is never shared — for chain-of-thought, drafts, etc.

**Token budget management:**
- Each delegation includes a compressed context (summary of relevant shared memory + task description)
- Max context per delegation: 4K tokens (configurable per team)
- Stale context is automatically summarized by the orchestrator before passing

### 3.4 Database Schema

```sql
-- Teams
CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id),
    visibility TEXT DEFAULT 'private',
    routing_strategy TEXT DEFAULT 'supervisor',
    config TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

-- Team membership (which agents are in which team)
CREATE TABLE team_agents (
    team_id TEXT REFERENCES teams(id),
    agent_id TEXT REFERENCES agents(id),
    role TEXT DEFAULT 'specialist',
    permissions TEXT,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (team_id, agent_id)
);

-- Shared team memory
CREATE TABLE team_memory (
    id TEXT PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    agent_id TEXT,
    key TEXT,
    value TEXT,
    type TEXT DEFAULT 'fact',
    created_at INTEGER
);

-- Team conversations (separate from per-agent conversations)
CREATE TABLE team_conversations (
    id TEXT PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    user_id TEXT REFERENCES users(id),
    created_at INTEGER,
    updated_at INTEGER
);

-- Messages within team conversations
CREATE TABLE team_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES team_conversations(id),
    agent_id TEXT,
    role TEXT,
    content TEXT,
    routing_info TEXT,
    created_at INTEGER
);

-- Delegation log
CREATE TABLE delegations (
    id TEXT PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    conversation_id TEXT REFERENCES team_conversations(id),
    from_agent_id TEXT,
    to_agent_id TEXT,
    task TEXT,
    context_summary TEXT,
    result TEXT,
    status TEXT DEFAULT 'pending',
    started_at INTEGER,
    completed_at INTEGER
);
```

### 3.5 Orchestrator Changes

The existing agent-orchestrator.js needs these additions:

1. **Team router** — new module lib/team-router.js
   - Receives user message + team config
   - Applies routing strategy (supervisor/round-robin/skill-match/manual)
   - Manages delegation lifecycle
   - Aggregates multi-agent responses

2. **Delegation tool** — injected into supervisor agents
   - name: delegate_to
   - params: agent_name, task, context
   - Orchestrator intercepts this tool call and handles cross-agent routing

3. **Context manager** — lib/team-context.js
   - Reads/writes shared team memory
   - Compresses context for delegation
   - Manages token budgets per delegation

4. **Intent classifier** — lib/intent-classifier.js
   - For skill-match routing
   - Embedding-based similarity: user message embedding vs agent description embeddings
   - Falls back to keyword matching if embeddings unavailable

### 3.6 NullClaw Integration

Each agent in a team still runs as a separate NullClaw instance (port 29000-29999). The orchestrator manages team-level coordination:

```
User message
    -> Orchestrator (team-router.js)
        -> Route to Agent A (NullClaw port 29001)
        -> Agent A calls delegate_to("Agent B", task, ctx)
        -> Orchestrator intercepts delegate_to tool call
        -> Spawns sub-request to Agent B (NullClaw port 29002)
        -> Returns B's result to A's context
        -> A produces final response
    -> Response to user (with delegation trace in metadata)
```

**Critical:** Delegation is handled by the orchestrator, NOT by NullClaw. NullClaw sees delegate_to as a regular tool call. The orchestrator intercepts it via the tool event callback and handles cross-agent routing.

---

## 4. Agent Marketplace

### 4.1 Entity Model

```
MarketplaceItem
  id: uuid
  type: "agent" | "team" | "widget"
  name: string
  description: string
  author: { name, url, avatar }
  version: semver
  category: string
  tags: string[]
  icon: string (emoji or URL)
  config: AgentConfig | TeamConfig | WidgetConfig
  stats: { installs, rating, reviews }
  pricing: "free" | "pro" | "premium"
  screenshots: string[] (URLs)
  readme: string (markdown)
  published_at: timestamp
  verified: boolean
```

### 4.2 Pre-Built Team Templates

These are the "killer app" — ready-made teams that work out of the box:

#### DevOps Squad (Pro tier)
- **Commander** (supervisor): Coordinates deployments, incident response
- **Builder** (specialist): Writes code, fixes bugs, runs tests
- **Monitor** (specialist): Checks logs, metrics, alerts
- **Reviewer** (reviewer): Code review, security audit
- Routing: Supervisor
- Shared context: Git status, deployment history, alert feed

#### Content Factory (Pro tier)
- **Editor** (supervisor): Plans content calendar, assigns topics
- **Writer** (specialist): Drafts articles, social posts
- **Researcher** (specialist): Finds sources, fact-checks
- **Designer** (specialist): Creates visuals, layouts
- Routing: Supervisor
- Shared context: Brand guidelines, content calendar, published pieces

#### Support Desk (Max tier)
- **Triage** (supervisor): Classifies tickets, routes to specialists
- **Tech Support** (specialist): Technical troubleshooting
- **Billing** (specialist): Account and payment issues
- **Escalation** (reviewer): Complex cases, customer retention
- Routing: Skill Match (intent-based)
- Shared context: Knowledge base, ticket history, customer profile

#### Research Lab (Max tier)
- **Director** (supervisor): Defines research questions, synthesizes findings
- **Analyst** (specialist): Data analysis, statistical work
- **Librarian** (specialist): Literature search, source evaluation
- **Writer** (specialist): Report writing, visualization
- Routing: Supervisor
- Shared context: Research corpus, findings database, bibliography

### 4.3 Marketplace Infrastructure

**Storage:** Marketplace catalog is a JSON file (like widget catalog) for v1, migrating to API-backed when volume justifies it.

**Publishing flow:**
1. User creates a team or agent locally
2. Clicks "Publish to Marketplace" in team settings
3. Fills metadata (description, category, screenshots)
4. Submitted for review (manual initially, automated later)
5. Appears in marketplace with "Community" badge
6. Scratchy-verified items get "Verified" badge

**Installation flow:**
1. User browses marketplace (search, filter by category/rating)
2. Clicks "Install" on a team template
3. Agents are created in user's workspace with pre-configured prompts
4. Team is created with specified routing strategy
5. User can customize any agent after installation

**Revenue model:**
- Free templates: community contributions, Scratchy official
- Pro templates: available only to Pro/Max subscribers
- Premium templates: one-time purchase (future — Stripe Connect)
- Revenue share with creators (future — 70/30 split)

---

## 5. Workspace Persistence

### 5.1 Named Workspaces

Users can save and load canvas layouts:

```
Workspace
  id: uuid
  name: string ("My Dev Setup", "Research Dashboard")
  user_id: uuid
  canvas_ops: JSON (the saved canvas state)
  active_surfaces: string[] (which surfaces were open)
  agent_id: uuid | null
  team_id: uuid | null
  created_at / updated_at
```

**Save:** Serialize current canvas ops + open surfaces -> store in SQLite
**Load:** Clear canvas -> apply saved ops -> restore surfaces
**Auto-save:** Every 30s if canvas has changed (debounced)

### 5.2 Workspace Templates

Pre-configured layouts shipped with team templates:
- "DevOps Command Center": terminal + file explorer + monitoring gauges
- "Content Studio": editor + research panel + preview
- "Support Dashboard": ticket list + customer profile + knowledge base

---

## 6. Collaboration (Stretch Goal)

### 6.1 Shared Workspaces

Multiple users see the same canvas in real-time:

- **WebSocket rooms**: Each shared workspace is a WS room
- **CRDT for canvas ops**: Conflict-free replicated data types for concurrent edits
- **Cursor presence**: Other users' cursors visible on canvas (like Figma)
- **Permission model**: Owner, Editor, Viewer roles

### 6.2 Implementation Notes

This is the most complex feature and should be Phase 4.5 or Phase 5. Core tech:
- WS room management (extend existing WS server)
- CRDT library (Yjs or Automerge) for canvas state
- Presence protocol (cursor position + agent activity indicators)
- Conflict resolution for simultaneous agent + human edits

---

## 7. Implementation Plan

### Sprint 1 (Week 1-2): Team Foundation
- [ ] Database schema (teams, team_agents, team_memory, team_conversations)
- [ ] Team CRUD API routes (/api/teams)
- [ ] Team creation UI (extension of agent wizard — "Create Team" tab)
- [ ] Basic supervisor routing (single delegation depth)
- [ ] delegate_to tool injection for supervisor agents
- [ ] Delegation interceptor in orchestrator

### Sprint 2 (Week 3-4): Routing and Context
- [ ] All 4 routing strategies implemented
- [ ] Intent classifier (embedding-based + keyword fallback)
- [ ] Shared context manager (team memory CRUD)
- [ ] Context compression for delegation (summarization)
- [ ] Token budget enforcement
- [ ] Delegation trace UI (show user which agent handled what)

### Sprint 3 (Week 5-6): Marketplace
- [ ] Marketplace data model + catalog format
- [ ] 4 pre-built team templates (DevOps, Content, Support, Research)
- [ ] Marketplace browsing UI (extend existing widget store)
- [ ] Install/uninstall flow for teams
- [ ] Publish flow (metadata form + review queue)

### Sprint 4 (Week 7-8): Workspace and Polish
- [ ] Named workspace save/load
- [ ] Workspace templates per team
- [ ] Auto-save with debounce
- [ ] Team settings panel (routing strategy, shared context config)
- [ ] Delegation visualization (timeline of who did what)
- [ ] Performance optimization (parallel delegations, caching)

### Sprint 5 (Week 9-10): Collaboration (stretch)
- [ ] WS room management
- [ ] CRDT integration for canvas
- [ ] Cursor presence
- [ ] Permission model
- [ ] Shared team conversations

---

## 8. Pricing Impact

| Feature | Free (Self-Hosted) | Pro 14.99/mo | Max 39.99/mo | Enterprise |
|---------|-------------------|---------------|---------------|------------|
| Agents | 3 | 10 | Unlimited | Unlimited |
| Teams | 1 (2 agents max) | 3 | Unlimited | Unlimited |
| Routing strategies | Manual only | All 4 | All 4 | All 4 + custom |
| Pre-built templates | Community only | All official | All official | All + custom |
| Marketplace | Browse only | Install + publish | Install + publish | Private catalog |
| Shared workspaces | — | 1 | 5 | Unlimited |
| Collaboration | — | — | Up to 5 users | Unlimited |
| Custom domains | — | — | 1 | Unlimited |

---

## 9. Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token burn from multi-agent delegation | High cost, slow responses | Context compression, token budgets, max delegation depth (3) |
| Supervisor bottleneck | Latency, context overflow | Allow parallel delegation, streaming responses |
| Circular delegation | Infinite loops | Delegation depth limit + visited-agent tracking |
| Agent disagreement | Contradictory outputs | Supervisor has final say; conflict flagged to user |
| Marketplace quality | Bad templates hurt trust | Manual review initially, rating system, report mechanism |
| NullClaw scaling at team level | 5 agents x 200 users = 1000 instances | Lazy spawn (only active agents), aggressive TTL (5min idle then kill) |
| Shared context leakage | Privacy between team members | Context namespacing, permission checks on every read |

---

## 10. Success Metrics

- **Adoption:** 30% of Pro/Max users create at least 1 team within 30 days
- **Engagement:** Team conversations average 2x longer than single-agent
- **Marketplace:** 10+ community templates published within 60 days of launch
- **Delegation quality:** less than 5% of delegations fail or produce irrelevant results
- **Performance:** Delegation round-trip < 10s for simple tasks, < 30s for complex

---

## 11. References

- O'Reilly: "Designing Effective Multi-Agent Architectures" (Feb 2026) — https://www.oreilly.com/radar/designing-effective-multi-agent-architectures/
- Microsoft: Multi-Agent Reference Architecture — https://microsoft.github.io/multi-agent-reference-architecture/
- Google: A2A Protocol — https://github.com/a2aproject/A2A
- IBM: What is A2A — https://www.ibm.com/think/topics/agent2agent-protocol
- CrewAI: Collaboration docs — https://docs.crewai.com/en/concepts/collaboration
- OpenAI: Agents SDK — https://openai.github.io/openai-agents-python/
- LangGraph: Multi-Agent Workflows — https://blog.langchain.com/langgraph-multi-agent-workflows/
- Azure: AI Agent Orchestration Patterns — https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns
- arxiv 2601.13671: "The Orchestration of Multi-Agent Systems"
- arxiv 2501.06322: "Multi-Agent Collaboration Mechanisms: A Survey"
- arxiv 2505.02279: "Agent Communication Protocol Survey"
