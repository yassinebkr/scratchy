# Phase 5 — UI/UX Polish Before Ship
> Priority: Must-fix before beta testers see the product
> Assigned to: Frontend Design Team (Director → Component, Layout, Interact, Visualizer)
> Constraint: NEVER modify tokens.css or server code. Shadow DOM components only.

## 1. Team Delegation Display (HIGH PRIORITY)

### Problem
When users chat with a team, the orchestrator's raw JSON task plan and worker outputs
are displayed as-is in the chat. It looks like debug output, not a product.

### Requirements
- **Task plan display**: When orchestrator creates a plan, show a clean card/timeline
  with worker names + task summaries (not raw JSON)
- **Worker progress**: Show each worker as a collapsible card with:
  - Worker name + avatar/icon
  - Task description (1-2 lines)
  - Status indicator (working → done / error)
  - Output collapsed by default, expandable on click
- **QA review step**: Show reviewer feedback as a distinct badge/alert
  (PASS = green, ISSUES FOUND = yellow)
- **Synthesis**: Orchestrator's final response rendered normally (not labeled "synthesis")
- **WS events to render**: `team-planning`, `team-delegations-start`, `team-delegation`,
  `team-worker-stream`, `team-delegations-end`, `team-enforcement`

### Current State
- `sc-chat.js` has basic team mode (+231 lines) with agent headers and delegation events
- WS events are fired correctly — the UI just doesn't render them well

## 2. Sidebar Agent List (HIGH PRIORITY)

### Problem
Left sidebar shows ALL 15 agents individually (Atlas, Iris, Nova, Echo, Architect, Sys,
Api, Data, Scout, QA, Director, Component, Layout, Interact, Visualizer). Users don't
need to see worker agents — they should only see:
- **4 main agents** (Atlas, Iris, Nova, Echo) as individual chat targets
- **2 teams** (Backend Dev Team, Frontend Team) as team chat targets
- Workers are internal — hidden from the sidebar

### Requirements
- Sidebar shows: individual agents (role != worker/reviewer) + teams
- Teams displayed as expandable groups (click to see members)
- Team chat starts by clicking the team name, not individual workers
- Workers only visible inside team detail view (if expanded)
- Visual distinction: agents = circle avatar, teams = group icon

## 3. Typing Indicator (MEDIUM)

### Problem
"..." dots displayed twice or not animated on mobile (iPhone 11 + Android).

### Requirements
- Single animated typing indicator (3 dots with CSS pulse/bounce)
- Works on mobile Safari (iOS 15+) and Chrome Android
- Remove duplicate indicator if two `typing: start` events fire
- Debounce: only show after 300ms delay (avoids flash for fast responses)

## 4. Widget Functionality (MEDIUM)

### Problem
Widgets exist in the UI but some don't actually work:
- **Email widget**: "Send email" does nothing (Resend API in test mode,
  can only send to yabbo000666@gmail.com)
- **Calendar widget**: Basic display only, no Google Calendar integration
- **Notes widget**: Working (CRUD via sn-* trigger ops)

### Requirements
- Email: Show clear feedback when send fails ("Test mode — can only send to verified emails")
- Email: If user tries to send to unverified address, show error message (not silent failure)
- Calendar: Show "Coming soon — Google Calendar integration planned" placeholder
- Don't remove widgets — they demonstrate the capability. Just make failures visible.

## 5. Mobile Responsiveness (MEDIUM)

### Files to check
- `styles/main.css` — grid layout
- `public/components/sc-chat.js` — chat panel
- `public/components/sc-sidebar.js` — agent/team sidebar
- All `public/components/sc-*.js` — Shadow DOM styles

### Requirements
- Sidebar collapses to icon rail on mobile (<768px)
- Chat messages don't overflow (max-width: 100%)
- Canvas tiles stack vertically on mobile (no horizontal scroll)
- Touch targets minimum 44px (Apple HIG)
- `touch-action: manipulation` on all interactive elements
- Viewport meta already set: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`

## Design System Reference

### Tokens (DO NOT MODIFY)
```css
--sc-bg: #0d0b07;
--sc-surface: #1a1610;
--sc-surface-hover: #252015;
--sc-text: #f0ead6;
--sc-text-muted: #8a7e6a;
--sc-accent: #F9A602;
--sc-accent-hover: #DAA520;
--sc-border: rgba(249,166,2,0.10);
--sc-glass-bg: rgba(26,22,16,0.85);
--sc-glass-blur: blur(20px);
--sc-font: 'Geist', system-ui, sans-serif;
--sc-mono: 'Geist Mono', monospace;
```

### Component Pattern
All components use Shadow DOM with inline styles:
```js
class ScExample extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>/* styles */</style><div>...</div>`;
  }
}
customElements.define('sc-example', ScExample);
```

## Files Likely Modified
- `public/components/sc-chat.js` — team delegation rendering
- `public/components/sc-sidebar.js` — agent/team grouping
- `public/components/sc-email.js` — error handling
- `public/components/sc-calendar.js` — placeholder
- `styles/main.css` — mobile breakpoints (if needed)
