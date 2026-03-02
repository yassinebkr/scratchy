<p align="center">
  <img src="docs/logo.svg" width="80" alt="Scratchy">
  <br>
  <strong>Scratchy</strong>
  <br>
  <em>The programmable AI workbench</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#genui-protocol">GenUI Protocol</a> •
  <a href="#self-hosting">Self-Hosting</a> •
  <a href="#scratchy-pro">Scratchy Pro</a> •
  <a href="#contributing">Contributing</a>
</p>

---

Scratchy is a multi-agent AI workbench where **agents program the UI in real-time**. Instead of plain chat, agents render rich interactive components — charts, forms, dashboards, code editors, terminals — directly in the browser through the **GenUI protocol**.

> **Open-core**: This repo is the free, self-hostable version. [Scratchy Pro](#scratchy-pro) adds teams, advanced agents, and managed hosting.

---

## Features

- **Multi-Agent Chat** — Create custom agents with system prompts, model selection, and conversation history
- **GenUI Canvas** — 34 declarative component types (gauges, charts, tables, forms, timelines, etc.) rendered in a reactive spatial grid
- **TOON Encoding** — Token-efficient notation that cuts structured data tokens by ~30%
- **Contextual Surfaces** — Terminal, code editor, file explorer, and search panels auto-activate based on agent tool usage
- **Semantic Memory** — Embedding-based context search with indexing and retrieval
- **MCP Integration** — Connect agents to external tools via Model Context Protocol
- **NullClaw Backend** — Lightweight per-user agent runtime (2.8 MB binary, ~1 MB RAM per instance)
- **Self-Hostable** — One command `docker compose up`, runs on any machine with 2 GB RAM

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/yassinebkr/scratchy.git
cd scratchy
cp .env.example .env
# Edit .env — add your Anthropic or OpenAI API key
docker compose up -d
```

Open `http://localhost:3002`. First user to sign up becomes admin.

### Manual (Node.js ≥ 22)

```bash
npm ci --legacy-peer-deps
cp .env.example .env
# Edit .env
npm start
```

---

## GenUI Protocol

Agents control the UI by emitting **canvas operations** in fenced code blocks:

````markdown
```scratchy-canvas
{"op":"upsert","id":"cpu","type":"gauge","data":{"label":"CPU","value":73,"max":100,"color":"orange"}}
{"op":"upsert","id":"status","type":"stats","data":{"title":"Server","items":[{"label":"Uptime","value":"14d"},{"label":"Requests","value":"1.2M"}]}}
```
````

34 component types: `gauge`, `chart-bar`, `chart-line`, `chart-pie`, `stats`, `table`, `checklist`, `timeline`, `form`, `card`, `hero`, `alert`, `progress`, `sparkline`, `code`, `image`, `video`, and more.

**TOON format** — same ops, ~30% fewer tokens:

````markdown
```scratchy-toon
op: upsert
id: srv-stats
type: stats
data:
  title: Server Status
  items[3]{label,value}:
    Uptime,14d 3h
    Requests,1.2M
    Errors,0.03%
```
````

See [COMPONENTS.md](./COMPONENTS.md) for the full component reference and [PROTOCOL.md](./PROTOCOL.md) for the wire format.

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: `3002`) |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (for embeddings) |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

*At least one model provider API key required.

---

## Architecture

```
Browser ──WebSocket──▶ Server (Node.js)
                          │
                    ┌─────┴─────┐
                    │  Protocol  │  GenUI • TOON • Surfaces • A2UI
                    ├───────────┤
                    │   State    │  SQLite WAL (agents, canvas, memory)
                    ├───────────┤
                    │  Backend   │  NullClaw per-user agent instances
                    └───────────┘
```

- **GenUI protocol**: Agents emit JSON/TOON canvas ops → server parses → client renders
- **Surfaces**: Tool usage detected in SSE stream → auto-activates Terminal/Editor/Files
- **NullClaw**: Zig-based agent runtime, one instance per user, ~1 MB RAM each

---

## Self-Hosting

Scratchy runs on anything: laptop, Raspberry Pi, VPS, or bare metal.

**Minimum requirements:**
- 2 GB RAM, 1 CPU core
- Node.js 22+ or Docker
- An API key (Anthropic, OpenAI, or bring your own)

**Recommended for production:**
- 4+ GB RAM (supports 10+ concurrent users)
- Reverse proxy (Caddy, nginx, Cloudflare Tunnel)
- Persistent volume for SQLite database

---

## Scratchy Pro

The hosted version with additional features:

| | Self-Hosted (Free) | Pro (€14.99/mo) | Max (€39.99/mo) |
|--|---|---|---|
| Agents | 2 | 10 | Unlimited |
| Messages/day | Unlimited* | 500 | 2,000 |
| GenUI Canvas | ✅ 34 components | ✅ | ✅ |
| Teams | — | — | ✅ Multi-agent teams |
| BYOK | — | ✅ | ✅ |
| Widgets | — | Notes, Calendar | All + marketplace |
| Workspaces | 1 | 5 | Unlimited |
| Support | Community | Email | Priority |

*Self-hosted uses your own API keys — no message limits from us.

→ [scratchy.clawos.fr](https://scratchy.clawos.fr)

---

## Contributing

1. Fork and create a feature branch
2. Write tests for new functionality (`npm test`)
3. Validate JS syntax: `node -c <file>`
4. Follow ESM imports — no CommonJS
5. Submit a pull request

---

## License

MIT — see [LICENSE](./LICENSE)
