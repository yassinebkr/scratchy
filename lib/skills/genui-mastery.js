/**
 * @skill genui-mastery
 * Complete GenUI protocol mastery: 34 component types, TOON format, canvas best practices.
 * Agents: Director
 */
export default {
  id: 'genui-mastery',
  name: 'GenUI Mastery',
  description: 'Complete GenUI protocol: 34 components, TOON format, canvas layout, design system',
  category: 'frontend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: GenUI Mastery

### Component Palette (34 types)

**Content**: hero, card, alert, code, image, video
**Data Display**: stats, gauge, progress, sparkline, kv, table, tags, status
**Charts**: chart-bar, chart-line, chart-pie, stacked-bar
**Navigation**: tabs, accordion, timeline, checklist
**Interaction**: buttons, chips, toggle, input, slider, rating, form, form-strip
**Layout**: link-card, streak, weather

### Component Selection Rules
- Specs/stats → \`stats\` (grid) or \`kv\` (rows). NEVER cram data into \`card.text\`
- Progress/completion → \`gauge\` or \`progress\`
- Phases/milestones → \`timeline\` (icon + title + text per item)
- Task lists → \`checklist\` (text + checked)
- Tabular data → \`table\` (headers + rows)
- Distribution → \`chart-pie\` or \`stacked-bar\`
- Trends → \`chart-line\` or \`sparkline\`
- Project header → \`hero\` (title + subtitle + badge)
- Short prose → \`card\` (1-3 sentences max)

### Canvas Density
- Maximum 6-8 tiles per response
- Group related data into single components (one \`stats\` with 6 items, not 6 \`gauge\` components)
- Progressive disclosure: overview first (3-4 tiles), detail on request
- Pin-worthy content: fewer, richer tiles

### TOON Format (default — saves ~30% tokens)
\`\`\`scratchy-toon
op: upsert
id: meaningful-id
type: stats
data:
  title: Server Metrics
  items[3]{label,value}:
    CPU,73%
    RAM,4.2 GB
    Disk,52%
\`\`\`

### Design System Tokens
- Font: var(--sc-font) — Geist
- Accent: var(--sc-accent) — #F9A602
- Background layers: --sc-bg → --sc-surface → --sc-surface-hover
- Border: var(--sc-border)
- Text: var(--sc-text), var(--sc-text-muted)
- Radius: var(--sc-radius) — 8px
- Z-index scale: --sc-z-base(1) → --sc-z-bar(40) → --sc-z-overlay(100) → --sc-z-modal(200) → --sc-z-popover(300) → --sc-z-toast(1100)
- Glassmorphism: backdrop-filter blur + rgba backgrounds

### Layout Modes
- \`auto\`: Default responsive grid
- \`dashboard\`: Equal-width cards
- \`focus\`: Single component expanded
- \`columns\`: Side-by-side
- \`rows\`: Stacked vertically

### Rules
- Components persist until removed — don't re-upsert everything each turn
- Use \`patch\` for small updates, \`upsert\` for new/full replacement
- IDs should be meaningful: "server-metrics", "deploy-status"
- Never put backticks inside JSON values
- Never render static canvas ops for data that a widget handles dynamically`,
};
