# Project Workspaces — Design Spec

> Status: Draft — v2.1 target
> Author: Yassine + Gilberte
> Date: 2026-03-10

## Vision

Every project gets its own isolated workspace: separate chat threads per agent, shared task board, auto-loaded tools/skills, and a clean abstraction layer for inter-agent communication. No more flooding one chat with unrelated work.

## Core Concepts

### Project

A logical container that groups:
- **Agents** — user selects which agents join this project (with suggestions)
- **Conversations** — one independent chat thread per agent, persistent
- **Shared State** — task board, file manifest, project metadata
- **Tools** — auto-loaded MCP servers, linters, test suites based on project type
- **Memory** — project-scoped memory (separate from agent global memory)

### Project Lifecycle

```
Create → Configure Agents → Work → Archive/Delete
```

1. **Create** — user names project, picks type (or describes it), selects agents
2. **Configure** — system suggests agents + tools based on project description
3. **Work** — user chats with individual agents, agents read shared state
4. **Archive** — project goes read-only, conversations preserved

---

## Architecture

### Data Model (SQLite)

```sql
-- Core project record
CREATE TABLE project (
  id          TEXT PRIMARY KEY,   -- uuid
  name        TEXT NOT NULL,
  description TEXT,
  type        TEXT DEFAULT 'custom',  -- web-app|api|docs|design|data|custom
  owner_id    TEXT NOT NULL,      -- FK users
  status      TEXT DEFAULT 'active',  -- active|archived
  config      TEXT DEFAULT '{}',  -- JSON: tools[], linters[], test_command, workspace_path
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Which agents are in this project
CREATE TABLE project_agent (
  project_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL,      -- atlas|iris|nova|echo|custom
  role        TEXT,               -- lead|reviewer|etc (optional)
  added_at    INTEGER NOT NULL,
  PRIMARY KEY (project_id, agent_id)
);

-- One conversation per agent per project
CREATE TABLE project_conversation (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(project_id, agent_id)
);

-- Shared task board
CREATE TABLE project_task (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'todo',  -- todo|in_progress|done|blocked
  assigned_agent  TEXT,                 -- nullable
  created_by      TEXT NOT NULL,        -- user_id or agent_id
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  sort_order      INTEGER DEFAULT 0,
  metadata        TEXT DEFAULT '{}'     -- JSON: files, links, notes
);

-- Decision log (append-only, pruned to last 20)
CREATE TABLE project_decision (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL,        -- who made the decision
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
```

### Shared State Abstraction — Project Context Protocol (PCP)

Agents don't talk to each other directly. They read/write shared project state through a clean tool API.

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Atlas   │     │   Iris   │     │   Nova   │
│  (Code)  │     │ (Design) │     │(Research)│
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     ▼                ▼                ▼
┌─────────────────────────────────────────────────┐
│           Project Context Protocol (PCP)         │
│                                                  │
│  pcp_read_tasks()      → task[]                  │
│  pcp_create_task(title, desc, assignee)          │
│  pcp_update_task(id, status, notes)              │
│  pcp_read_files()      → file_manifest[]         │
│  pcp_read_summary(agent_id) → string             │
│  pcp_write_summary(text) → void                  │
│  pcp_read_decisions()  → decision_log[]          │
│  pcp_log_decision(text) → void                   │
│  pcp_read_config()     → project config          │
└──────────────────┬──────────────────────────────┘
                   ▼
             SQLite + FS sandbox
```

**Why this over direct agent-to-agent chat:**
- Predictable token cost (read what you need, not full conversation history)
- No infinite loops (agents can't trigger each other)
- Auditable (all reads/writes logged with agent_id + timestamp)
- Async-friendly (agents don't need to be "online" simultaneously)
- Simple to implement (just NullClaw tool definitions + SQLite queries)

### Token Efficiency Strategy

**Problem:** Each agent needs project context per turn. 4 agents × 10 turns × full context = massive token waste.

**Solution — Lazy context loading:**

1. **System prompt** gets only: project name, type, agent's role, PCP tool list (~200 tokens)
2. **Task list** is NOT pre-loaded — agent calls `pcp_read_tasks` on demand (~200-500 tokens)
3. **Other agents' work** loaded via `pcp_read_summary` only when relevant
4. **Decision log** append-only, pruned to last 20 entries
5. **File manifest** = names + sizes only, not file contents

**Token budget per agent turn:**
- System prompt (project context): ~200 tokens
- User message: ~100-500 tokens
- PCP tool calls (0-2 avg): ~200-600 tokens
- Agent response: ~200-1000 tokens
- **Total: ~700-2300 tokens/turn** (vs ~10-20k with naive full-context injection)

---

## Project Creation Flow

### UI Flow

```
User clicks "Create Project" (button in sidebar or landing form)
  → Modal appears:
    1. Project Name (text input)
    2. Description (textarea — used for agent/tool suggestions)
    3. Project Type (dropdown: Web App, API, Docs, Design, Data, Custom)
    4. Agent Selection:
       - Suggested agents pre-checked (based on type)
       - All agents shown with checkboxes
       - Optional role label per agent
    5. [Create Project] button
  → On submit:
    a. Insert project + project_agents in SQLite
    b. Create sandbox: .scratchy-data/projects/{project_id}/
    c. Create per-agent conversations
    d. Load MCP tools for project type
    e. Navigate to project view
```

### Agent Suggestions by Project Type

| Type     | Suggested Agents         | Auto-loaded Tools              |
|----------|--------------------------|--------------------------------|
| Web App  | Atlas (lead), Iris, Echo | file_write, shell, web_search  |
| API      | Atlas (lead), Nova       | file_write, shell, http_request|
| Docs     | Echo (lead), Nova        | file_write, web_search         |
| Design   | Iris (lead), Echo        | file_write, web_search         |
| Data     | Atlas, Nova (lead)       | file_write, shell, http_request|
| Custom   | All suggested            | file_write, web_search         |

---

## Project View UI

```
┌─────────────────────────────────────────────────────┐
│ 📁 Landing Page Redesign              [⚙️] [📋] [×] │
│─────────────────────────────────────────────────────│
│                                                      │
│  [👤 Atlas]  [🎨 Iris]  [🔍 Nova]  [✏️ Echo]  [+]   │
│  ─────────                                           │
│                                                      │
│  ┌───────────────────────────────────────────┐       │
│  │ Chat with Atlas                           │       │
│  │                                           │       │
│  │ You: Set up the Express server with auth  │       │
│  │                                           │       │
│  │ Atlas: Let me check what Nova found       │       │
│  │ about the requirements...                 │       │
│  │ [calling pcp_read_summary("nova")]        │       │
│  │                                           │       │
│  │ Got it. I'll structure the project as:    │       │
│  │ ┌────────────────────────────────────┐    │       │
│  │ │ 📊 Tasks              3/7 done     │    │       │
│  │ │ ✅ Set up repo                     │    │       │
│  │ │ ✅ Design schema                   │    │       │
│  │ │ ✅ API routes planned              │    │       │
│  │ │ 🔄 Implement auth (Atlas)          │    │       │
│  │ │ ☐ Style components (Iris)          │    │       │
│  │ │ ☐ Write tests                      │    │       │
│  │ │ ☐ Documentation (Echo)             │    │       │
│  │ └────────────────────────────────────┘    │       │
│  │                                           │       │
│  │ [Type a message...]              [Send]   │       │
│  └───────────────────────────────────────────┘       │
│                                                      │
│  📋 Tasks  │  📁 Files  │  📝 Decisions              │
└─────────────────────────────────────────────────────┘
```

- **Agent tabs** — click to switch conversation (each has independent history)
- **Task board** — shared across all agents, side panel or bottom tab
- **Files panel** — shared file manifest
- **Decision log** — chronological architectural decisions

---

## Implementation Phases

### Phase 1: Named Conversations (v2.1) — 1-2 weeks
- Project = named group of conversations in SQLite
- One conversation per agent, persistent
- Agent tabs in UI to switch between chats
- Project-scoped memory (project_id on memory table)
- No shared state, no PCP yet — just isolation
- **This alone solves "everything floods one chat"**

### Phase 2: Shared Task Board (v2.2) — 1-2 weeks
- `project_task` table in SQLite
- Task board UI component (`sc-project-tasks.js`)
- 3 PCP tools: `pcp_read_tasks`, `pcp_create_task`, `pcp_update_task`
- Agents see PCP tools in their tool list automatically
- Task board widget renders in canvas when agent creates/updates tasks

### Phase 3: Agent Communication Layer (v2.3) — 2-3 weeks
- Full PCP (all 9 methods)
- Agent summaries: each agent writes a summary after significant work
- Decision log for architectural choices
- File manifest tracking (per-agent file creation/modification)
- Project-scoped tool loading via `project.config.tools`

### Phase 4: Smart Suggestions + MCP (v2.4) — 2-3 weeks
- Project type → auto-suggest agents + tools
- Dynamic MCP server loading per project
- Linter/test integration (run from project config)
- Project templates (starter configs per project type)
- Workspace sandbox isolation (each project gets its own fs root)

---

## Security

- Agents can only access PCP tools for their assigned project
- File operations sandboxed to `.scratchy-data/projects/{project_id}/`
- All PCP writes logged with agent_id + timestamp (audit trail)
- Rate limit: max 5 PCP calls per agent per turn (prevent token spirals)
- Project deletion = soft delete (archive), hard delete needs confirmation

## What This Is NOT

- **Not real-time collab** — agents don't work simultaneously
- **Not agent-to-agent chat** — shared state, not messages
- **Not CI/CD** — task board for coordination, not deployment
- **Not multi-user initially** — one user per project (multi-user = later)

## Open Questions

1. Projects in sidebar (Slack-like) vs separate view?
2. Agent memory: cross-project or fully isolated?
3. Task assignment: user assigns or agents self-assign from skills?
4. Canvas state: project-scoped or global?
5. Cost visibility: per-project token breakdown?
