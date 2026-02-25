# Scratchy

A generative UI client for [OpenClaw](https://github.com/openclaw/openclaw) AI agents.

Real-time streaming. 39 interactive components. Standalone widget apps. Zero frameworks.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-22%2B-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## What is Scratchy?

Scratchy replaces generic messaging apps with an interface designed for AI. Instead of plain text replies, your agent renders **interactive dashboards, charts, forms, timelines, and full widget apps** — all in real-time as it thinks.

Think of it as a frontend that makes your AI agent actually useful beyond chat.

**Built for [OpenClaw](https://github.com/openclaw/openclaw)** — the open-source AI agent gateway.

## Features

### 💬 Chat
- **Real-time streaming** — see the agent type live (two-phase: lightweight during stream, full markdown on finalize)
- **Markdown rendering** — tables, code blocks with syntax highlighting, lists, headers
- **Collapsible thinking blocks** — see agent reasoning
- **Full chat history** across session compactions
- **Offline message queue** — send while disconnected, auto-delivers on reconnect
- **Duplicate detection** — hash-based dedup on render

### 🎨 Generative UI (39 Components)

Agents respond with `scratchy-canvas` or `scratchy-toon` code blocks. Scratchy renders them as interactive components:

| Category | Components |
|----------|-----------|
| **Layout** | card, hero, alert, accordion, kv, tags, link-card |
| **Data** | stats, table, checklist, timeline, status, progress, weather |
| **Charts** | chart-bar, chart-pie, chart-line, sparkline, gauge, stacked-bar, month-calendar |
| **Interactive** | buttons, toggle, rating, chips, input, slider, tabs, form |
| **Sports** | form-strip, streak |
| **Media** | video, image, code, email-view |
| **Music** | player, media-list, carousel |

Components are **LiveComponents** — DOM-based with create/update lifecycle, rAF animations, zero innerHTML.

### 🖼️ Canvas Mode

- Persistent spatial grid — components live across messages
- JSON ops protocol: `upsert`, `patch`, `remove`, `clear`, `move`, `layout`, `toast`, `overlay`, `dismiss`, `trigger`
- Tile entrance choreography — staggered spring animations
- View Transitions API — smooth crossfade on widget navigation
- FLIP animation system — batch read/write, adaptive stagger
- Canvas state persistence — localStorage with 24h expiry
- **Streaming render** — ops fire live as the agent streams (no waiting for block close)

### 🔌 Widget Architecture

Widgets are **standalone apps** that run inside the canvas. They handle their own logic — no forwarding to the agent.

```
User clicks button → widget-action frame → serve.js routes by prefix → Widget processes locally → Canvas updates
```

- **No agent hooks** — widget actions never reach the gateway
- **Secure by default** — credentials in secure context, never logged
- **Optimistic UI** — mutations update instantly, background processing
- **Session persistence** — widget state saved to file, auto-restores on reconnect
- **Inter-widget communication** — EventBus + SharedContextStore

### 🔊 Voice & TTS
- Text-to-speech on any message (ElevenLabs v3)
- **Streaming TTS** — audio starts playing immediately via MediaSource
- Auto-speech mode for short replies
- Voice notes with Whisper transcription
- Language-aware STT — retains original language

### 📱 Multi-Device Sync
- Open Scratchy on phone and desktop simultaneously
- Messages, canvas ops, and activity indicators sync in real-time
- WebSocket session continuity with 30s grace period
- Event buffering with sequence numbers — no missed messages

### ⚡ Connection Reliability
- Auto-reconnect with exponential backoff (1s → 15s cap)
- Zombie socket detection (server-side pong timeout)
- Streaming staleness watchdog (10s gap detection)
- Offline message queue preserved across reconnects

### 🎯 Design System
- **Geist font**, indigo accent (#6366f1)
- Layered surfaces, 8px radius, borders over shadows
- Light/dark mode with CSS overlay variables
- Command palette (⌘K) — fuzzy search across widgets and actions
- ARIA roles, `aria-live` regions, keyboard navigation
- Responsive — 1→2→3→4 columns by viewport width

### 📊 Live Activity Indicator
- Real-time tool event streaming from the gateway
- Dynamic labels: 📄 Reading file, ⚡ Running command, 🔍 Searching the web
- Elapsed timer + expandable tool call log

### 🗜️ TOON Format (Token-Efficient)
- `scratchy-toon` code blocks — alternative to JSON using [TOON](https://github.com/toon-format/toon)
- ~18-40% token savings on structured data
- Streaming parser with hash-based dedup
- Both formats coexist in the same response

### 📎 File Attachments
- Images (paste, drag & drop, compression, lightbox)
- Documents (PDF, text, markdown, CSV)
- Code files (Python, JS, JSON, Rust, YAML)
- Voice notes with transcription
- Strict MIME + extension validation

## Getting Started

### Docker (recommended)

```bash
git clone https://github.com/yassinebkr/scratchy.git
cd scratchy
SCRATCHY_TOKEN=your-gateway-token docker compose up -d
```

### Manual

```bash
git clone https://github.com/yassinebkr/scratchy.git
cd scratchy
npm install
node serve.js
```

Open `http://localhost:3001` and enter your OpenClaw gateway token.

### Remote Access

```bash
# SSH tunnel
ssh -L 3001:localhost:3001 user@your-server

# Or Cloudflare tunnel
cloudflared tunnel --url http://localhost:3001
```

> ⚠️ **Security note:** Scratchy connects to an OpenClaw gateway with access to agent tools (shell, filesystem, messaging). Run it on an **isolated server** (VPS, VM), not your personal machine. Access it remotely via SSH tunnel or Cloudflare tunnel.

## Architecture

```
Browser / PWA
  │
  │  WebSocket + HTTPS
  ▼
serve.js (Node.js)
  ├─ Auth + session management
  ├─ WebSocket proxy → OpenClaw Gateway
  ├─ Widget-action handler (local routing)
  ├─ REST API (sessions, history, search, attachments)
  ├─ TTS (ElevenLabs) + STT (Whisper)
  │
  ▼
Widget Classes (local, never forwarded to agent)
```

## Security Model

The gateway token **never reaches the browser**. Scratchy proxies all communication server-side.

- POST-only login (token never in URL)
- CSRF protection with one-time tokens
- Brute force protection (3 attempts/window, 1h lockout)
- HttpOnly + SameSite cookies (HMAC-derived)
- Timing-safe token comparison
- CSP headers (`script-src 'self'`)
- WebSocket token-bucket rate limiter
- File upload MIME + extension validation

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRATCHY_TOKEN` | OpenClaw gateway auth token | Auto-detected from ~/.openclaw |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for TTS | — |
| `ELEVENLABS_VOICE_ID` | Voice ID | SAz9YHcvj6GT2YYXdXww |
| `OPENAI_API_KEY` | OpenAI key for Whisper STT | — |
| Port (arg) | `node serve.js [port]` | 3001 |

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript — zero frameworks, zero build step
- **Server:** Node.js — static files, WebSocket proxy, REST APIs, widget routing
- **Protocol:** OpenClaw gateway API (WebSocket, JSON frames)
- **TTS:** ElevenLabs v3 with streaming audio
- **STT:** OpenAI Whisper

## GenUI Protocol

Agents control the UI by emitting code blocks in their responses:

````markdown
```scratchy-canvas
{"op":"upsert","id":"cpu-gauge","type":"gauge","data":{"label":"CPU","value":73,"max":100,"unit":"%","color":"orange"}}
{"op":"upsert","id":"server-stats","type":"stats","data":{"title":"Status","items":[{"label":"Uptime","value":"14d"},{"label":"Requests","value":"1.2M"}]}}
```
````

Or using TOON for ~30% token savings:

````markdown
```scratchy-toon
op: upsert
id: cpu-gauge
type: gauge
data:
  label: CPU
  value: 73
  max: 100
  unit: %
  color: orange
```
````

Operations: `upsert`, `patch`, `remove`, `clear`, `move`, `layout`, `toast`, `overlay`, `dismiss`, `trigger`

Components persist until removed. Use `patch` for small updates, `upsert` for new components or full replacement.

## Widgets (⚠️ Experimental)

Scratchy includes several built-in widget apps. These are **not fully tested** and may require additional setup (OAuth credentials, API keys):

- **Standard Notes** — encrypted note-taking via sn-cli
- **Google Calendar** — month grid, events + tasks CRUD
- **Gmail** — email reader with HTML rendering, compose/reply
- **Spotify** — search, playlists, playback controls
- **YouTube** — search, trending, playlists, music

Widgets demonstrate the standalone app architecture. Build your own by implementing a widget class with `handleAction()` and registering it in `serve.js`.

## Docker Security

- Non-root user
- Read-only filesystem
- All capabilities dropped
- no-new-privileges
- 256MB memory limit
- Health checks

## Roadmap

- [x] Drag-and-drop canvas reordering (partial)
- [ ] More widgets (weather, home automation, GitHub, 3D printer)
- [ ] Message virtualization (500+ messages)
- [ ] Push notifications (Service Worker)
- [ ] Plugin system for custom components
- [ ] Tauri desktop app (Rust backend)

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
