# Visual Canvas Editor & Live Data Widgets — Design Spec

> Status: Draft — v2.2+ target
> Author: Yassine + Gilberte
> Date: 2026-03-10

## Problem

Users can't create custom dashboards or connect existing UI components to real-time data without asking an agent every time. The 33 tile types are powerful but static — they render what the agent pushes, then stop.

Users want to:
1. Pick a gauge, chart, or table from existing components
2. Point it at a data source (API endpoint, JS script, Python script, WebSocket)
3. Have it update automatically on an interval
4. Save that layout as a persistent dashboard

## Vision

A visual canvas editor where users drag existing components onto a grid, bind them to live data sources, and get real-time dashboards — no agent needed after setup.

---

## Architecture

### Data Source Types

| Source Type | How It Works | Example |
|------------|-------------|---------|
| **REST API** | HTTP GET on interval, JSONPath to extract value | `GET https://api.example.com/status` → `$.cpu_percent` |
| **JS Script** | Server-side `vm.runInContext()` sandboxed, returns data | `fetch('...').then(r => r.json())` |
| **Python Script** | `child_process.execFile('python3', [script])`, parse stdout JSON | `import psutil; print(json.dumps({"cpu": psutil.cpu_percent()}))` |
| **WebSocket** | Persistent connection, map incoming messages to component data | `ws://localhost:8080/metrics` |
| **Shell Command** | Execute command, parse stdout | `df -h / --output=pcent | tail -1` |
| **Static Value** | Hardcoded value (for labels, titles, thresholds) | `"Production Server"` |

### Data Binding Model

Each live widget has a **binding** that connects a data source to component properties:

```json
{
  "widget_id": "cpu-gauge-1",
  "component_type": "gauge",
  "source": {
    "type": "rest_api",
    "url": "https://myserver.com/api/metrics",
    "method": "GET",
    "headers": { "Authorization": "Bearer ${secrets.MY_API_KEY}" },
    "interval_ms": 5000,
    "timeout_ms": 3000
  },
  "bindings": {
    "value": "$.cpu_percent",
    "max": 100,
    "label": "CPU",
    "unit": "%",
    "color": "#{$.cpu_percent > 80 ? 'ef4444' : $.cpu_percent > 60 ? 'F9A602' : '22c55e'}"
  }
}
```

**Binding expressions:**
- `$.path.to.value` — JSONPath extraction from source response
- `${secrets.KEY}` — reference to user's stored secrets (never exposed in UI)
- `#{expression}` — simple JS expression for computed values (color thresholds, formatting)
- Static strings/numbers — passed through as-is

### Data Pipeline

```
┌──────────────────┐
│   Data Source     │  (REST, WS, script, shell)
│   Poller/Listener │
└────────┬─────────┘
         │ raw JSON response
         ▼
┌──────────────────┐
│  Binding Engine   │  JSONPath extraction + expression eval
│  (server-side)    │
└────────┬─────────┘
         │ { value: 73, label: "CPU", color: "#22c55e" }
         ▼
┌──────────────────┐
│  Canvas Patch     │  op: "patch", id: "cpu-gauge-1", data: {...}
│  via WebSocket    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  sc-tile render   │  Existing tile component re-renders
│  (client-side)    │
└──────────────────┘
```

### Data Model (SQLite)

```sql
CREATE TABLE user_dashboard (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  layout      TEXT DEFAULT '{}',   -- JSON: grid positions, sizes
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE dashboard_widget (
  id              TEXT PRIMARY KEY,
  dashboard_id    TEXT NOT NULL,
  component_type  TEXT NOT NULL,      -- gauge|chart-bar|stats|table|etc
  source_config   TEXT NOT NULL,      -- JSON: DataSource definition
  bindings        TEXT NOT NULL,      -- JSON: property→path mappings
  position        TEXT DEFAULT '{}',  -- JSON: {x, y, w, h} grid coords
  static_data     TEXT DEFAULT '{}',  -- JSON: non-bound static properties
  interval_ms     INTEGER DEFAULT 10000,
  enabled         BOOLEAN DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE user_secret (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  key         TEXT NOT NULL,        -- e.g., "MY_API_KEY"
  value_enc   TEXT NOT NULL,        -- AES-256-GCM encrypted
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, key)
);
```

---

## Editor UI

### Canvas Editor View

```
┌────────────────────────────────────────────────────────┐
│ 📊 My Server Dashboard                    [Save] [Run] │
│────────────────────────────────────────────────────────│
│                                                        │
│  ┌─ Component Palette ──┐  ┌─ Canvas Grid ───────────┐│
│  │                      │  │                          ││
│  │  📏 Gauge            │  │  ┌────────┐ ┌────────┐  ││
│  │  📊 Bar Chart        │  │  │ CPU 73%│ │RAM 4.2G│  ││
│  │  📈 Line Chart       │  │  │ gauge  │ │ gauge  │  ││
│  │  🔢 Stats            │  │  └────────┘ └────────┘  ││
│  │  🗂️ Table            │  │                          ││
│  │  ✅ Checklist        │  │  ┌─────────────────────┐ ││
│  │  ⏱️ Timeline         │  │  │  Weekly Requests    │ ││
│  │  📇 Card             │  │  │  ████ ██ ████ ██   │ ││
│  │  🚦 Status           │  │  │  chart-bar          │ ││
│  │  🔔 Alert            │  │  └─────────────────────┘ ││
│  │  ...                 │  │                          ││
│  └──────────────────────┘  └──────────────────────────┘│
│                                                        │
│  ┌─ Widget Config (selected: cpu-gauge) ──────────────┐│
│  │ Component: Gauge                                    ││
│  │ Data Source: [REST API ▾]                           ││
│  │ URL: https://myserver.com/api/metrics               ││
│  │ Interval: [5s ▾]                                    ││
│  │ Bindings:                                           ││
│  │   value ← $.cpu_percent                             ││
│  │   max   ← 100                                      ││
│  │   label ← "CPU"                                    ││
│  │   color ← #{value > 80 ? 'red' : 'green'}          ││
│  │                                                     ││
│  │ [Test Connection]  [Preview]                        ││
│  └─────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

### Widget Config Panel (per widget)

1. **Component type** — read-only after drag (gauge, chart, table, etc)
2. **Data source** — dropdown: REST API, JS Script, Python Script, WebSocket, Shell, Static
3. **Connection config** — URL/path/command + auth + headers
4. **Bindings** — map component properties to JSONPath expressions
5. **Interval** — polling frequency (1s, 5s, 10s, 30s, 1m, 5m)
6. **Test** — one-shot fetch to verify source + bindings work
7. **Preview** — live preview of the component with real data

---

## Script Sandboxing (Security)

### JS Scripts
- Run in Node.js `vm` module with `runInNewContext()`
- Timeout: 5 seconds max
- No `require()`, no `process`, no `fs` — only `fetch`, `JSON`, `Math`, `Date`
- Memory limit: 64MB per execution
- Cannot access other users' data or server internals

### Python Scripts
- `child_process.execFile('python3', [scriptPath])` 
- Timeout: 10 seconds max
- Script stored in `.scratchy-data/user-scripts/{user_id}/`
- Stdout must be valid JSON
- No network access beyond what the script explicitly does
- Consider: `nsjail` or `bubblewrap` sandbox for production

### Shell Commands
- Allowlist-only: predefined safe commands (`df`, `uptime`, `curl`, `cat`)
- No pipes, no `&&`, no `$(...)` — single command with args
- Timeout: 5 seconds

---

## Token Efficiency

This feature is **zero token cost** after setup:
- Data polling happens server-side (Node.js timers/intervals)
- Canvas patches sent via WebSocket (no agent involved)
- Agent is only needed if user asks to CREATE/MODIFY a dashboard via chat
- The editor UI is pure client-side (no model calls)

**Agent-assisted creation (optional):**
User can say "make me a dashboard for my Kubernetes cluster" → agent uses `render_dashboard` MCP tool to generate initial layout → user fine-tunes in visual editor.

---

## Implementation Phases

### Phase 1: Static Dashboard Builder (v2.2) — 2 weeks
- Drag components from palette onto grid
- Configure static data per widget (no live binding yet)
- Save/load dashboard layouts to SQLite
- Dashboard list in sidebar

### Phase 2: REST API Bindings (v2.3) — 2 weeks
- Data source config: URL, headers, interval
- JSONPath binding engine
- Server-side polling + WS patch delivery
- Test connection + preview
- User secrets store (encrypted)

### Phase 3: Script Bindings (v2.4) — 2 weeks
- JS script sandbox (vm module)
- Python script execution
- Shell command allowlist
- Script editor (Monaco/CodeMirror)
- Error handling + retry logic

### Phase 4: WebSocket + Advanced (v2.5) — 2 weeks
- WebSocket data source (persistent connections)
- Computed binding expressions (color thresholds, formatting)
- Dashboard sharing (read-only links)
- Dashboard templates (pre-built for common use cases)
- Agent-assisted dashboard creation (chat → editor handoff)

---

## Relation to Project Workspaces

Dashboards can be project-scoped:
- Each project can have its own dashboards
- Data sources can reference project-specific APIs/scripts
- Task board widget could BE a dashboard widget bound to PCP data
- Project agents can suggest dashboard widgets based on project type

But dashboards also work standalone (global user dashboards, not project-bound).

---

## Open Questions

1. Grid system: CSS Grid with fixed columns (12-col) or free-form positioning?
2. Mobile dashboard viewing: responsive grid or separate mobile layout?
3. Dashboard versioning: undo/redo? Version history?
4. Sharing: public dashboard URLs? Embed in external sites?
5. Rate limiting: max polling frequency per user? Max concurrent data sources?
6. Should agents be able to create dashboard widgets programmatically via MCP?
