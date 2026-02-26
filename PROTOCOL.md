# GenUI Protocol Specification

**Version:** 1.0  
**Transport:** JSON over WebSocket  
**Module:** `protocol/genui.js`

GenUI is Scratchy's declarative protocol for managing a canvas of UI components. Agents emit operations inside fenced code blocks, and the client applies them to a reactive state map.

---

## Table of Contents

1. [Connection & Authentication](#connection--authentication)
2. [Message Format](#message-format)
3. [Canvas Operations](#canvas-operations)
4. [Component Types](#component-types)
5. [TOON Encoding](#toon-encoding)
6. [Widget Actions](#widget-actions)
7. [Surfaces](#surfaces)

---

## Connection & Authentication

### WebSocket Upgrade

Connect to `ws://HOST:3002/ws` with an auth token:

```
GET /ws?token=<session-token> HTTP/1.1
Upgrade: websocket
Connection: Upgrade
```

The server validates the token during the upgrade handshake. Invalid or missing tokens result in connection close with code `4001`.

### Session Token

Obtain a token via the REST API:

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "alice", "password": "..." }
```

Response:
```json
{ "token": "eyJ...", "user": { "id": "u_abc", "username": "alice" } }
```

### Authenticated Message Flow

```
Client                          Server
  │                               │
  ├── WS connect ?token=xxx ────► │  validate token
  │                               │
  ◄── { type: "welcome" } ────── │
  │                               │
  ├── { type: "chat", text } ──► │  route to agent
  │                               │
  ◄── { type: "chunk", ... } ─── │  streaming response
  ◄── { type: "chunk", ... } ─── │
  ◄── { type: "done" } ───────── │
  │                               │
  ├── { type: "ping" } ────────► │
  ◄── { type: "pong" } ────────  │
```

---

## Message Format

All WebSocket messages are JSON objects with a `type` field.

### Client → Server

| Type | Fields | Description |
|------|--------|-------------|
| `chat` | `text`, `agentId?`, `conversationId?` | Send a chat message |
| `ping` | — | Keepalive ping |
| `subscribe` | `surfaces: string[]` | Subscribe to surface types |
| `widget_action` | `action`, `context?`, `data?` | Trigger a widget action |
| `canvas_op` | `ops: Op[]` | Client-initiated canvas ops |

### Server → Client

| Type | Fields | Description |
|------|--------|-------------|
| `welcome` | `userId`, `version` | Connection established |
| `chunk` | `text?`, `ops?`, `done?` | Streaming agent response |
| `done` | `messageId` | Agent response complete |
| `canvas` | `ops: Op[]` | Canvas operations from server |
| `error` | `message`, `code?` | Error message |
| `pong` | — | Keepalive response |
| `surface` | `active: string[]`, `layout` | Active surface update |

---

## Canvas Operations

Operations are emitted in fenced code blocks within agent responses:

- `` ```scratchy-canvas `` — JSON format (one op per line)
- `` ```scratchy-toon `` — TOON format (compact, ~30% fewer tokens)

### Operation Types

| Op | Required Fields | Description |
|----|----------------|-------------|
| `upsert` | `id`, `type`, `data` | Create or fully replace a component |
| `patch` | `id`, `data` | Shallow-merge update to existing component |
| `remove` | `id` | Remove a component |
| `clear` | — | Remove all components |
| `move` | `id`, `layout` | Reposition a component |
| `layout` | `mode` | Change global canvas layout mode |
| `toast` | `data` (message, severity) | Show a temporary notification |
| `overlay` | `data` | Show/hide a modal overlay |
| `trigger` | `action`, `context?` | Trigger a named widget action |
| `dismiss` | `id` | Dismiss a toast or overlay |

### Layout Modes

| Mode | Description |
|------|-------------|
| `auto` | Responsive grid (default) |
| `dashboard` | Dashboard-style layout with sidebars |
| `focus` | Single prominent component |
| `columns` | Equal-width columns |
| `rows` | Stacked rows |

### Layout Object

```json
{
  "zone": "auto" | "main" | "sidebar" | "footer",
  "order": 0
}
```

### Example: JSON Format

```scratchy-canvas
{"op":"upsert","id":"cpu-gauge","type":"gauge","data":{"label":"CPU","value":73,"max":100,"unit":"%"}}
{"op":"upsert","id":"status","type":"alert","data":{"title":"All Systems","message":"Operational","severity":"success"}}
{"op":"patch","id":"cpu-gauge","data":{"value":81}}
{"op":"remove","id":"status"}
```

---

## Component Types

Scratchy supports 39 component types. Each has a `type` string and a `data` object.

### Display Components

| Type | Key Data Fields |
|------|----------------|
| `hero` | `title`, `subtitle`, `icon`, `badge`, `gradient`, `style` |
| `card` | `title`, `text`, `icon` |
| `alert` | `title`, `message`, `severity` (info/warning/error/success) |
| `stats` | `title`, `items: [{ label, value }]` |
| `gauge` | `label`, `value`, `max`, `unit`, `color` |
| `progress` | `label`, `value`, `max`, `icon`, `color` |
| `kv` | `title`, `items: [{ key, value }]` |
| `tags` | `label`, `items: [{ text, color }]` |
| `status` | `title`, `text`, `color` |
| `weather` | `icon`, `city`, `temp`, `condition` |
| `code` | `title`, `language`, `code` |
| `image` | `title`, `src/url`, `caption`, `alt` |
| `video` | `title`, `src/url`, `caption` |
| `link-card` | `title`, `desc`, `url`, `icon`, `color` |
| `rating` | `title`, `value`, `max` |
| `streak` | `title`, `days: []`, `active: []` |

### Chart Components

| Type | Key Data Fields |
|------|----------------|
| `sparkline` | `label`, `values: []`, `color`, `endColor`, `trend` |
| `chart-bar` | `title`, `labels: []`, `datasets: [{ label, data: [], color }]` |
| `chart-line` | `title`, `labels: []`, `datasets: [{ label, data: [], color }]` |
| `chart-pie` | `title`, `slices: [{ label, value, color }]` |
| `stacked-bar` | `title`, `items: [{ label, value, color }]` |

### Data Components

| Type | Key Data Fields |
|------|----------------|
| `table` | `title`, `headers: []`, `rows: [[]]` |
| `checklist` | `title`, `items: [{ text, checked }]` |
| `timeline` | `title`, `items: [{ title, text, date/time, icon, status }]` |
| `accordion` | `title`, `sections: [{ title, content }]` |
| `tabs` | `title`, `tabs: [{ label, content }]`, `active` |

### Interactive Components

| Type | Key Data Fields |
|------|----------------|
| `buttons` | `title`, `buttons: [{ label, action, style }]` |
| `chips` | `title/label`, `chips: [{ text, value, checked }]` |
| `toggle` | `label/title`, `checked/value` |
| `input` | `label`, `type`, `placeholder`, `value` |
| `slider` | `label/title`, `value`, `min`, `max` |
| `form` | `title`, `id`, `fields: [{ name, type, label, value }]`, `actions: [{ label, action, style }]` |
| `form-strip` | `title`, `desc`, `icon`, `fields: [...]`, `action`, `label` |

### Form Field Types

```json
{
  "name": "email",
  "type": "text | email | number | richtext | textarea | select | toggle | file | date",
  "label": "Email Address",
  "value": "",
  "placeholder": "you@example.com",
  "options": ["opt1", "opt2"]
}
```

---

## TOON Encoding

TOON (Token-Oriented Object Notation) is a compact alternative to JSON that reduces token count by ~30%.

### Syntax Rules

| Syntax | Meaning |
|--------|---------|
| `key: value` | Simple property (auto-typed) |
| 2-space indent | Nested object |
| `key[N]: v1,v2,v3` | Inline array of N items |
| `key[N]{f1,f2}:` + rows | Tabular array (N objects with fields f1, f2) |
| `---` | Separator between top-level objects |
| `"quoted"` | Preserve commas/colons/whitespace in string |
| `true`/`false`/`null` | Boolean/null primitives |
| `123`, `1.5` | Numeric primitives |

### Example

JSON (185 tokens):
```json
{"op":"upsert","id":"srv","type":"stats","data":{"title":"Services","items":[{"label":"Uptime","value":"14d"},{"label":"Requests","value":"1.2M"}]}}
```

TOON (110 tokens):
```
op: upsert
id: srv
type: stats
data:
  title: Services
  items[2]{label,value}:
    Uptime,14d
    Requests,1.2M
```

### Multi-Op Block

```scratchy-toon
op: upsert
id: g-cpu
type: gauge
data:
  label: CPU
  value: 73
  max: 100
  unit: %
---
op: patch
id: g-cpu
data:
  value: 81
```

---

## Widget Actions

Widgets are server-managed components with live data feeds. Trigger them instead of rendering static equivalents.

### Trigger Protocol

```json
{ "op": "trigger", "action": "<action-name>", "context": { ... } }
```

### Built-in Widget Actions

| Action | Description |
|--------|-------------|
| `admin-dashboard` | Admin overview (live stats) |
| `admin-monitor` | System monitor (CPU, RAM, connections) |
| `admin-quotas` | User quota management |
| `admin-providers` | AI provider configuration |
| `sn-list` | Note list with live updates |
| `sn-agent-read` | Read a note (context: `{ index }`) |
| `sn-agent-edit` | Edit a note (context: `{ index, title, content }`) |
| `sn-agent-append` | Append to a note (context: `{ index, text }`) |
| `sn-save-note` | Create new note (context: `{ title, content }`) |
| `cal-month` | Calendar month view |
| `mail-inbox` | Email inbox view |

### Action Response

Widget actions push `canvas` messages (ops) over WebSocket with live-polling updates (typically every 3 seconds).

---

## Surfaces

Surfaces are named UI regions that activate contextually based on agent tool calls.

| Surface | Trigger | Component | Priority |
|---------|---------|-----------|----------|
| `chat` | always | `sc-chat` | 0 |
| `explorer` | `read_dir` | `sc-filetree` | 1 |
| `search` | `web_search` | `sc-search` | 1 |
| `terminal` | `exec` | `sc-terminal` | 2 |
| `editor` | `write_file` | `sc-editor` | 2 |
| `canvas` | `canvas_op` | `sc-canvas` | 3 |

When an agent uses a tool, the corresponding surface becomes active. The client receives a `surface` message with the updated layout.

### Layout Computation

Active surfaces are arranged in a CSS grid. The algorithm sorts by priority (descending) and assigns grid areas proportionally:

- 1 surface: full viewport
- 2 surfaces: 60/40 split
- 3+ surfaces: main panel + sidebar stack
