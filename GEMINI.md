# Scratchy v2 — AI Chat Workbench

## Project
Multi-agent AI chat workbench with contextual surfaces, specialist agents, MCP integration, indexed context, and infinite memory.

## Stack
- **Backend:** Node.js 22, ESM, SQLite WAL, better-sqlite3, ws
- **Frontend:** Vanilla JS, Web Components, CSS Grid, no framework
- **Design:** Dark theme, indigo accent (#6366f1), Geist font family
- **Components:** 34 GenUI component types (cards, charts, tables, forms, etc.)

## Design Language
- Dark background: #0a0a1a → #12122a gradient
- Surface layers: surface-1 (#1a1a2e), surface-2 (#16213e)
- Accent: indigo (#6366f1), bright (#818cf8), dim (rgba(99,102,241,0.15))
- Text: primary (#e2e8f0), secondary (#94a3b8), tertiary (#5a5f73)
- Border: rgba(148,163,184,0.08)
- Border radius: sm(6px), md(10px), lg(14px), xl(18px)
- Font: Geist Sans (UI), Geist Mono (code)
- Transitions: fast(150ms), smooth(300ms), ease-smooth(cubic-bezier(0.4,0,0.2,1))

## Key Files
- `public/index.html` — main shell
- `public/css/` — stylesheets
- `public/lib/` — client modules (virtual-scroller, mobile-ux, agent-orchestrator, performance)
- `public/components/` — Web Components (sc-terminal, sc-filetree, sc-editor, sc-search, sc-toolbar, sc-admin)
- `server/` — API routes, WS handler, auth, widgets
- `lib/` — core modules (context engine, memory, billing, crawler, MCP)

## UI/UX Requirements
- Mobile-first responsive (360px minimum)
- PWA-ready (manifest, service worker)
- iOS Safari compatible (no localStorage in private mode)
- Touch-friendly (44px minimum tap targets)
- Smooth animations (60fps, prefer CSS transforms)
- Virtual scrolling for message lists (1000+ messages)
- Dark theme only (no light mode)
- Accessible (WCAG AA contrast ratios)
