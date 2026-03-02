/**
 * @skill visual-docs
 * Architecture diagrams, HTML galleries, slide decks, data visualization.
 * Inspired by: visual-explainer (rich HTML + Mermaid + Chart.js + CSS Grid)
 * Agents: Visualizer
 */
export default {
  id: 'visual-docs',
  name: 'Visual Documentation',
  description: 'Architecture diagrams, component galleries, slide decks, data visualization dashboards',
  category: 'frontend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Visual Documentation

### Mermaid Diagrams
Use for architecture, flows, sequences, and class relationships.

**Flowchart (system architecture)**
\`\`\`mermaid
%%{init: {'theme': 'dark'}}%%
graph TD
  A[Client] -->|WebSocket| B[WS Server]
  B -->|Route| C{Router}
  C -->|Chat| D[NullClaw]
  C -->|Team| E[Team Router]
  E -->|Delegate| F[Worker NullClaw]
\`\`\`

**Sequence (request flow)**
\`\`\`mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
  participant U as User
  participant O as Orchestrator
  participant W as Worker
  U->>O: Send message
  O->>O: Classify intent
  O->>W: Delegate task
  W-->>O: Return result
  O-->>U: Synthesized response
\`\`\`

**Class (data model)**
\`\`\`mermaid
%%{init: {'theme': 'dark'}}%%
classDiagram
  Team "1" --> "*" TeamAgent
  TeamAgent --> Agent
  Team --> SharedContext
\`\`\`

### Self-Contained HTML Pages
For component galleries, design system docs, and slide decks.

Template structure:
\`\`\`html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Gallery</title>
  <style>
    :root { --bg: #0a0a0a; --surface: #141414; --text: #e8e8e8; --accent: #F9A602; --border: #2a2a2a; --radius: 8px; }
    @media (prefers-color-scheme: light) { :root { --bg: #fff; --surface: #f5f5f5; --text: #1a1a1a; --border: #e0e0e0; } }
    * { margin: 0; box-sizing: border-box; }
    body { font-family: 'Geist', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .subtitle { color: #888; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Title</h1>
  <p class="subtitle">Description</p>
  <div class="grid"><!-- cards here --></div>
</body>
</html>
\`\`\`

### Data Visualization with GenUI
Use canvas components for inline dashboards:
- \`chart-bar\`: comparisons between categories
- \`chart-line\`: trends over time
- \`chart-pie\`: distribution/proportions
- \`sparkline\`: compact trend indicator
- \`gauge\`: single metric with max
- \`stacked-bar\`: multi-segment comparisons
- \`stats\`: grid of label/value pairs
- \`table\`: structured data with headers

### Slide Deck Format
For project reviews and presentations:
1. Title slide: \`hero\` component with title, subtitle, badge
2. Context slide: \`kv\` or \`stats\` with key facts
3. Architecture slide: \`code\` component with Mermaid diagram
4. Progress slide: \`checklist\` or \`timeline\`
5. Metrics slide: \`chart-bar\` or \`chart-pie\`
6. Next steps slide: \`checklist\` with upcoming tasks

### Rules
- Always use dark mode default (Scratchy theme)
- Mermaid: always include \`%%{init: {'theme': 'dark'}}%%\`
- HTML pages: self-contained (inline CSS + JS, no external deps except CDN)
- Chart.js: load from CDN \`https://cdn.jsdelivr.net/npm/chart.js\`
- Tables: use \`table\` GenUI component, never markdown tables
- Diagrams: keep them readable — max 15 nodes per flowchart
- Color coding: use semantic colors (green=success, red=error, gold=accent)`,
};
