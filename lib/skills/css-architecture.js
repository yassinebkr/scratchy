/**
 * @skill css-architecture
 * Responsive layout, CSS Grid/Flexbox, animations, design token system.
 * Agents: Layout
 */
export default {
  id: 'css-architecture',
  name: 'CSS Architecture',
  description: 'Responsive design, CSS Grid/Flexbox, animations, design token compliance',
  category: 'frontend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: CSS Architecture

### Design Token System (tokens.css)
All values MUST use CSS custom properties — never hardcode colors, spacing, or z-index.

**Colors**
- \`--sc-bg\`: #0a0a0a (page background)
- \`--sc-surface\`: #141414 (card/panel background)
- \`--sc-surface-hover\`: #1e1e1e (hover state)
- \`--sc-border\`: #2a2a2a (borders)
- \`--sc-text\`: #e8e8e8 (primary text)
- \`--sc-text-muted\`: #888 (secondary text)
- \`--sc-accent\`: #F9A602 (brand gold)
- \`--sc-accent-hover\`: #d48f02 (accent hover)
- \`--sc-danger\`: #ef4444 (errors)
- \`--sc-success\`: #22c55e (success)

**Spacing** (use multiples of 4px)
- 4px, 8px, 12px, 16px, 24px, 32px, 48px

**Typography**
- \`--sc-font\`: 'Geist', system-ui, sans-serif
- Sizes: 11px (caption), 13px (body small), 14px (body), 16px (subhead), 20px (heading), 28px (title)

**Z-Index Scale** (never use raw numbers)
- \`--sc-z-base\`: 1
- \`--sc-z-bar\`: 40
- \`--sc-z-overlay\`: 100
- \`--sc-z-modal\`: 200
- \`--sc-z-popover\`: 300
- \`--sc-z-toast\`: 1100

### Grid Patterns
\`\`\`css
/* Auto-fill responsive grid */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

/* Dashboard layout — fixed sidebar + flexible main */
.dashboard { display: grid; grid-template-columns: 52px 1fr; grid-template-rows: auto 1fr; height: 100vh; }

/* Two-column with sidebar */
.with-sidebar { display: grid; grid-template-columns: 300px 1fr; gap: 0; }
@media (max-width: 768px) { .with-sidebar { grid-template-columns: 1fr; } }
\`\`\`

### Flexbox Patterns
\`\`\`css
/* Center content */
.center { display: flex; align-items: center; justify-content: center; }

/* Space between with wrap */
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }

/* Flex child that shouldn't collapse */
.fixed-child { flex-shrink: 0; }

/* GOTCHA: overflow:hidden in flex context = implicit min-height:0 */
.scroll-child { flex: 1; overflow-y: auto; min-height: 0; }
\`\`\`

### Mobile-First Pattern
\`\`\`css
/* Base: mobile styles */
:host {
  display: block;
  padding: 12px;
}

.grid { grid-template-columns: 1fr; }

/* Desktop override */
@media (min-width: 768px) {
  :host { padding: 24px; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
}
\`\`\`

### Animation Patterns
\`\`\`css
/* Fade in */
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.animated { animation: fadeIn 0.2s ease-out; }

/* Reduced motion respect */
@media (prefers-reduced-motion: reduce) {
  .animated { animation: none; }
  * { transition-duration: 0.01ms !important; }
}

/* GPU-accelerated transitions */
.smooth { transition: transform 0.15s ease, opacity 0.15s ease; will-change: transform; }
\`\`\`

### Glassmorphism (Scratchy theme)
\`\`\`css
.glass {
  background: rgba(20, 20, 20, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--sc-border);
  border-radius: var(--sc-radius);
}
\`\`\`

### Rules
- Mobile-first: base = mobile, @media for desktop
- Never hardcode colors — use --sc-* tokens
- Never hardcode z-index — use --sc-z-* tokens
- overflow:hidden + flex = needs min-height:0 or flex-shrink:0
- Prefer Grid for 2D, Flexbox for 1D
- 44px minimum touch target on mobile
- Test with 320px viewport width (iPhone SE)`,
};
