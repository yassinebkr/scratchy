# Component Reference

All 39 GenUI component types supported by Scratchy v2.

---

## Quick Reference

| # | Type | Category | Description |
|---|------|----------|-------------|
| 1 | `hero` | Display | Page hero with title, subtitle, badge |
| 2 | `card` | Display | Simple text card with title and icon |
| 3 | `alert` | Display | Severity-colored notification banner |
| 4 | `stats` | Display | Grid of label/value stat pairs |
| 5 | `gauge` | Display | Circular or arc gauge with value |
| 6 | `progress` | Display | Linear progress bar |
| 7 | `kv` | Display | Key-value pair list |
| 8 | `tags` | Display | Colored tag/badge collection |
| 9 | `status` | Display | Simple status indicator with color |
| 10 | `weather` | Display | Weather card with icon and temp |
| 11 | `code` | Display | Syntax-highlighted code block |
| 12 | `image` | Display | Image with caption |
| 13 | `video` | Display | Video player with caption |
| 14 | `link-card` | Display | Clickable link preview card |
| 15 | `rating` | Display | Star/dot rating display |
| 16 | `streak` | Display | Activity streak calendar |
| 17 | `sparkline` | Chart | Inline trend line |
| 18 | `chart-bar` | Chart | Bar chart with datasets |
| 19 | `chart-line` | Chart | Line chart with datasets |
| 20 | `chart-pie` | Chart | Pie/donut chart |
| 21 | `stacked-bar` | Chart | Horizontal stacked bar |
| 22 | `table` | Data | Tabular data with headers and rows |
| 23 | `checklist` | Data | Checkable item list |
| 24 | `timeline` | Data | Vertical timeline with events |
| 25 | `accordion` | Data | Collapsible sections |
| 26 | `tabs` | Data | Tabbed content panels |
| 27 | `buttons` | Interactive | Action button group |
| 28 | `chips` | Interactive | Selectable chip/tag group |
| 29 | `toggle` | Interactive | On/off toggle switch |
| 30 | `input` | Interactive | Text input field |
| 31 | `slider` | Interactive | Range slider |
| 32 | `form` | Interactive | Full form with fields and actions |
| 33 | `form-strip` | Interactive | Compact inline form strip |

### Template-Only Types

These are used via `scratchy-tpl` template blocks:

| # | Type | Description |
|---|------|-------------|
| 34 | `dashboard` | Combined gauges, stats, charts, cards |
| 35 | `email` | Email compose template |
| 36 | `status` (tpl) | Status page with checklist and timeline |
| 37 | `form` (tpl) | Form template with alerts |
| 38 | `detail` | Detail view with KV, tags, actions |
| 39 | `checklist` (tpl) | Checklist template with stats |

---

## Display Components

### hero

Page-level header with gradient styling.

```json
{
  "op": "upsert", "id": "page-hero", "type": "hero",
  "data": {
    "title": "Dashboard",
    "subtitle": "Real-time system overview",
    "icon": "📊",
    "badge": "Live",
    "gradient": "blue-purple",
    "style": "accent"
  }
}
```

### card

Simple text content card. Use for short prose (1–3 sentences). For structured data, use `stats`, `kv`, or `table` instead.

```json
{
  "op": "upsert", "id": "intro", "type": "card",
  "data": { "title": "Welcome", "text": "Your workspace is ready.", "icon": "👋" }
}
```

⚠️ Field is `text`, not `body`.

### alert

Notification banner with severity levels.

```json
{
  "op": "upsert", "id": "warn-1", "type": "alert",
  "data": { "title": "High CPU", "message": "CPU at 95% for 5 minutes", "severity": "warning" }
}
```

Severity: `info` | `warning` | `error` | `success`

### stats

Grid of label/value pairs — ideal for dashboards.

```json
{
  "op": "upsert", "id": "server-stats", "type": "stats",
  "data": {
    "title": "Server Metrics",
    "items": [
      { "label": "Uptime", "value": "14d 3h" },
      { "label": "Requests", "value": "1.2M" },
      { "label": "Errors", "value": "0.03%" }
    ]
  }
}
```

### gauge

Circular gauge for single metrics.

```json
{
  "op": "upsert", "id": "cpu", "type": "gauge",
  "data": { "label": "CPU", "value": 73, "max": 100, "unit": "%", "color": "orange" }
}
```

### progress

Linear progress bar.

```json
{
  "op": "upsert", "id": "upload", "type": "progress",
  "data": { "label": "Upload", "value": 65, "max": 100, "icon": "📤", "color": "blue" }
}
```

### kv

Key-value rows — for specs, config, metadata.

```json
{
  "op": "upsert", "id": "config", "type": "kv",
  "data": {
    "title": "Configuration",
    "items": [
      { "key": "Version", "value": "2.0.0" },
      { "key": "Node", "value": "22.x" }
    ]
  }
}
```

### tags

Collection of colored tags/badges.

```json
{
  "op": "upsert", "id": "labels", "type": "tags",
  "data": { "label": "Topics", "items": [{ "text": "AI", "color": "blue" }, { "text": "Web", "color": "green" }] }
}
```

### status

Simple colored status indicator.

```json
{
  "op": "upsert", "id": "api-status", "type": "status",
  "data": { "title": "API", "text": "Operational", "color": "green" }
}
```

### weather

Weather display card.

```json
{
  "op": "upsert", "id": "weather-berlin", "type": "weather",
  "data": { "icon": "☀️", "city": "Berlin", "temp": "22°C", "condition": "Clear sky" }
}
```

### code

Syntax-highlighted code block.

```json
{
  "op": "upsert", "id": "snippet", "type": "code",
  "data": { "title": "Example", "language": "javascript", "code": "console.log('hello');" }
}
```

### image / video

Media display with caption.

```json
{
  "op": "upsert", "id": "photo", "type": "image",
  "data": { "title": "Screenshot", "src": "/img/demo.png", "caption": "Dashboard preview", "alt": "Screenshot of dashboard" }
}
```

### link-card

Clickable link preview.

```json
{
  "op": "upsert", "id": "docs-link", "type": "link-card",
  "data": { "title": "Documentation", "desc": "Full API reference", "url": "https://docs.example.com", "icon": "📚", "color": "blue" }
}
```

### rating / streak

Rating display and activity streak.

```json
{ "op": "upsert", "id": "review", "type": "rating", "data": { "title": "Rating", "value": 4, "max": 5 } }
```

```json
{ "op": "upsert", "id": "habits", "type": "streak", "data": { "title": "This Week", "days": ["Mon","Tue","Wed","Thu","Fri"], "active": ["Mon","Tue","Thu"] } }
```

⚠️ Streak uses `days` and `active` arrays — not `current`/`best`/`dates`.

---

## Chart Components

### sparkline

Inline trend line for compact metrics.

```json
{
  "op": "upsert", "id": "traffic", "type": "sparkline",
  "data": { "label": "Traffic", "values": [10, 25, 18, 30, 22, 35], "color": "blue", "trend": "up" }
}
```

### chart-bar / chart-line

Bar or line chart with labeled datasets.

```json
{
  "op": "upsert", "id": "revenue", "type": "chart-bar",
  "data": {
    "title": "Revenue",
    "labels": ["Jan", "Feb", "Mar"],
    "datasets": [{ "label": "Sales", "data": [100, 150, 130], "color": "green" }]
  }
}
```

⚠️ Dataset field is `data`, not `values`.

### chart-pie

Pie or donut chart.

```json
{
  "op": "upsert", "id": "budget", "type": "chart-pie",
  "data": {
    "title": "Budget",
    "slices": [
      { "label": "Engineering", "value": 50, "color": "blue" },
      { "label": "Marketing", "value": 30, "color": "green" },
      { "label": "Operations", "value": 20, "color": "orange" }
    ]
  }
}
```

### stacked-bar

Horizontal stacked bar for composition data.

```json
{
  "op": "upsert", "id": "breakdown", "type": "stacked-bar",
  "data": {
    "title": "Time Breakdown",
    "items": [{ "label": "Code", "value": 60, "color": "blue" }, { "label": "Review", "value": 25, "color": "green" }, { "label": "Meetings", "value": 15, "color": "orange" }]
  }
}
```

---

## Data Components

### table

Tabular data with headers and row arrays.

```json
{
  "op": "upsert", "id": "users", "type": "table",
  "data": {
    "title": "Users",
    "headers": ["Name", "Role", "Status"],
    "rows": [["Alice", "Admin", "Active"], ["Bob", "User", "Idle"]]
  }
}
```

### checklist

Checkable task list.

```json
{
  "op": "upsert", "id": "tasks", "type": "checklist",
  "data": {
    "title": "Sprint Tasks",
    "items": [
      { "text": "Write tests", "checked": true },
      { "text": "Deploy staging", "checked": false }
    ]
  }
}
```

⚠️ Fields are `text` and `checked` — not `label`/`done`.

### timeline

Vertical timeline for events or milestones.

```json
{
  "op": "upsert", "id": "milestones", "type": "timeline",
  "data": {
    "title": "Milestones",
    "items": [
      { "title": "Alpha", "text": "Internal release", "date": "2025-01", "icon": "🚀", "status": "done" },
      { "title": "Beta", "text": "Public beta", "date": "2025-03", "icon": "🧪", "status": "current" }
    ]
  }
}
```

⚠️ Item fields are `title` and `text` — not `label`/`desc`.

### accordion / tabs

Collapsible sections and tabbed panels.

```json
{ "op": "upsert", "id": "faq", "type": "accordion", "data": { "title": "FAQ", "sections": [{ "title": "What is Scratchy?", "content": "A multi-agent AI chat workbench." }] } }
```

```json
{ "op": "upsert", "id": "views", "type": "tabs", "data": { "title": "Views", "tabs": [{ "label": "Overview", "content": "..." }, { "label": "Details", "content": "..." }], "active": 0 } }
```

⚠️ Tabs array field is `tabs`, not `items`.

---

## Interactive Components

### buttons

Action button group.

```json
{
  "op": "upsert", "id": "actions", "type": "buttons",
  "data": { "title": "Actions", "buttons": [{ "label": "Save", "action": "save", "style": "primary" }, { "label": "Cancel", "action": "cancel", "style": "ghost" }] }
}
```

### chips

Selectable chip group.

```json
{
  "op": "upsert", "id": "filters", "type": "chips",
  "data": { "label": "Filters", "chips": [{ "text": "Active", "value": "active", "checked": true }, { "text": "Archived", "value": "archived", "checked": false }] }
}
```

⚠️ Array field is `chips`, not `items`.

### toggle / input / slider

```json
{ "op": "upsert", "id": "dark-mode", "type": "toggle", "data": { "label": "Dark Mode", "checked": true } }
```

```json
{ "op": "upsert", "id": "search", "type": "input", "data": { "label": "Search", "type": "text", "placeholder": "Type to search...", "value": "" } }
```

```json
{ "op": "upsert", "id": "volume", "type": "slider", "data": { "label": "Volume", "value": 75, "min": 0, "max": 100 } }
```

### form

Full form with typed fields and action buttons.

```json
{
  "op": "upsert", "id": "contact", "type": "form",
  "data": {
    "title": "Contact",
    "id": "contact-form",
    "fields": [
      { "name": "email", "type": "email", "label": "Email", "placeholder": "you@example.com" },
      { "name": "message", "type": "textarea", "label": "Message" }
    ],
    "actions": [
      { "label": "Send", "action": "send", "style": "primary" }
    ]
  }
}
```

Field types: `text`, `email`, `number`, `richtext`, `textarea`, `select`, `toggle`, `file`, `date`

---

## Layout Zones

Components can be placed in layout zones:

| Zone | Description |
|------|-------------|
| `auto` | Automatic placement (default) |
| `main` | Primary content area |
| `sidebar` | Side panel |
| `footer` | Bottom bar |

```json
{ "op": "upsert", "id": "nav", "type": "buttons", "data": {...}, "layout": { "zone": "sidebar", "order": 0 } }
```
