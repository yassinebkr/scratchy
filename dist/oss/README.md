# Scratchy v2

A multi-agent AI chat workbench with a declarative canvas UI, contextual surfaces, and per-user isolation. Scratchy lets you build, deploy, and interact with AI agents through a rich browser interface that adapts its layout based on what the agent is doing — showing terminals, editors, charts, and forms exactly when they're needed.

---

## Features

| Pillar | What It Does |
|--------|-------------|
| **Multi-Agent Chat** | Create custom agents with system prompts, model selection, temperature tuning, and conversation history |
| **GenUI Canvas** | 39 declarative component types rendered in a reactive spatial grid — agents describe UI, clients render it |
| **Contextual Surfaces** | Terminal, editor, file explorer, and search panels that appear automatically based on agent tool usage |
| **Auth & Multi-User** | AES-256-GCM encrypted user store, Argon2id password hashing, WebAuthn passkey support, session tokens |
| **Smart Crawler** | 9-module web scraping engine with stealth, captcha detection, browser pooling, and politeness controls |
| **Memory System** | Embedding-based semantic memory with indexing, consolidation, extraction, and context search |
| **MCP Integration** | Client for Model Context Protocol servers — extend agents with external tools |
| **Billing** | Stripe integration with checkout, subscription management, webhooks, and usage tracking |
| **TOON Encoding** | Token-efficient notation that cuts structured data tokens by ~30% |
| **i18n** | Localization support (English, French out of the box) |

---

## Quick Start (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/scratchy.git
cd scratchy

# 2. Create your environment file
cp .env.example .env
# Edit .env with your API keys (see Configuration below)

# 3. Generate an encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output into ENCRYPTION_KEY in .env

# 4. Start everything
docker compose up -d

# 5. Open the app
open http://localhost:3002
```

Scratchy will be available at `http://localhost:3002`. The first user to sign up becomes the admin.

---

## Manual Setup (Node.js)

**Requirements:** Node.js ≥ 22

```bash
# 1. Install dependencies
npm ci --legacy-peer-deps

# 2. Set environment variables (or use a .env file)
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export OPENAI_API_KEY=sk-...

# 3. Start the server
npm start

# 4. Development mode (auto-restart on file changes)
npm run dev
```

The server starts on port 3002 by default. Override with `PORT=8080 npm start`.

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP server port (default: `3002`) |
| `DATABASE_PATH` | No | SQLite database path (default: `./data/scratchy.db`) |
| `ENCRYPTION_KEY` | **Yes** | 32-byte hex key for AES-256-GCM encryption |
| `OPENAI_API_KEY` | **Yes** | OpenAI API key for embeddings and chat |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (if using Claude models) |
| `RESEND_API_KEY` | No | Resend API key for transactional email |
| `STRIPE_SECRET_KEY` | No | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser Client                      │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌───────────────┐ │
│  │ sc-chat │ │ sc-canvas│ │sc-term │ │ sc-editor     │ │
│  └────┬────┘ └────┬─────┘ └───┬────┘ └──────┬────────┘ │
│       └───────────┴────────────┴─────────────┘           │
│                        WebSocket                         │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│                   Server (Node.js)                       │
│                        │                                 │
│  ┌─────────┐   ┌──────┴──────┐   ┌──────────────────┐  │
│  │ Router  │   │  WS Handler │   │  Auth (Argon2id)  │  │
│  │ (HTTP)  │   │  (ws pkg)   │   │  + Sessions       │  │
│  └────┬────┘   └──────┬──────┘   └──────────────────┘  │
│       │               │                                  │
│  ┌────┴───────────────┴──────────────────────────────┐  │
│  │                  Protocol Layer                     │  │
│  │  ┌────────┐  ┌──────┐  ┌──────────┐  ┌────────┐  │  │
│  │  │ GenUI  │  │ TOON │  │ Surfaces │  │  A2UI  │  │  │
│  │  └────────┘  └──────┘  └──────────┘  └────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                        │                                  │
│  ┌─────────────────────┴─────────────────────────────┐  │
│  │                   State (SQLite WAL)               │  │
│  │  users │ sessions │ agents │ canvas │ memory │ prefs │
│  └────────────────────────────────────────────────────┘  │
│                        │                                  │
│  ┌─────────────────────┴─────────────────────────────┐  │
│  │                  Libraries                         │  │
│  │  Embeddings │ Crawler │ MCP │ Billing │ Indexer   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## API Reference

### Health & Info

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check — returns `{ status, version, uptime }` |

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | No | Create account — `{ username, password, displayName? }` |
| POST | `/api/auth/login` | No | Login — `{ username, password }` → `{ token, user }` |
| GET | `/api/auth/me` | Yes | Current user info |
| POST | `/api/auth/logout` | Yes | End session |

### Agents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | Yes | List agents (own + enabled builtins) |
| POST | `/api/agents` | Yes | Create agent — `{ name, systemPrompt?, model?, ... }` |
| GET | `/api/agents/:id` | Yes | Get agent details |
| PUT | `/api/agents/:id` | Yes | Update agent |
| DELETE | `/api/agents/:id` | Yes | Delete agent |

### MCP (Admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/agents/:id/mcp/start` | Admin | Start MCP servers for agent |
| POST | `/api/agents/:id/mcp/stop` | Admin | Stop MCP servers |
| GET | `/api/agents/:id/mcp/tools` | Yes | List discovered MCP tools |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/config` | Admin | Get all admin config |
| PUT | `/api/admin/config` | Admin | Update admin config (merge) |
| GET | `/api/admin/users` | Admin | List all users with quotas |
| GET/PUT | `/api/admin/users/:id/quotas` | Admin | User quota management |

### User Preferences

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/me/preferences` | Yes | Get preferences |
| PUT | `/api/users/me/preferences` | Yes | Update preferences |
| POST | `/api/users/me/apikeys` | Yes | Store encrypted API key |
| DELETE | `/api/users/me/apikeys/:provider` | Yes | Remove API key |

### WebSocket

Connect to `ws://HOST:3002/ws?token=<session-token>` for real-time communication. See [PROTOCOL.md](./PROTOCOL.md) for the full message specification.

---

## Project Structure

```
scratchy/
├── server/
│   ├── index.js          # Entry point — HTTP server + WS + bootstrap
│   ├── router.js         # HTTP routes, static serving, API handlers
│   ├── auth.js           # Authentication (Argon2id, sessions, passkeys)
│   ├── ws.js             # WebSocket handler (per-client state, broadcast)
│   └── routes/
│       └── billing.js    # Stripe checkout, portal, webhooks
├── protocol/
│   ├── genui.js          # GenUI canvas protocol (parse, validate, apply)
│   ├── toon.js           # TOON parser and serializer
│   ├── surfaces.js       # Surface detection and layout computation
│   └── a2ui.js           # A2UI ↔ GenUI protocol bridge
├── state/
│   ├── db.js             # SQLite WAL database setup
│   ├── users.js          # User CRUD
│   ├── sessions.js       # Session management
│   ├── agents.js         # Agent configuration store
│   ├── canvas.js         # Canvas state persistence
│   ├── memory.js         # Memory entries
│   ├── preferences.js    # User preferences + encrypted API keys
│   ├── admin-config.js   # Admin configuration key-value store
│   └── context-index.js  # Context search index
├── lib/
│   ├── embeddings.js     # OpenAI embeddings client
│   ├── indexer.js         # Content indexing pipeline
│   ├── compaction.js      # Memory compaction / summarization
│   ├── context-search.js  # Semantic context search
│   ├── memory-*.js        # Memory extraction, consolidation, scheduling
│   ├── mcp-client.js      # MCP client (stdio transport)
│   ├── mcp-registry.js    # MCP server lifecycle management
│   ├── nullclaw-adapter.js # NullClaw per-user instance manager
│   ├── observation-masking.js # PII/observation masking
│   ├── billing/           # Stripe client, plans, usage, webhooks
│   └── crawler/           # 9-module web scraping engine
├── public/                # Browser client (Web Components)
│   ├── index.html
│   ├── components/        # sc-chat, sc-canvas, sc-terminal, etc.
│   ├── lib/               # App bootstrap, WS client, surface manager
│   ├── styles/            # CSS
│   └── i18n/              # Locale files (en.json, fr.json)
├── test/                  # Node.js test runner tests
├── data/                  # SQLite database (gitignored)
├── Dockerfile             # Multi-stage production image
├── docker-compose.yml     # Full stack (Scratchy + OpenClaw)
├── .env.example           # Environment variable template
├── PROTOCOL.md            # GenUI protocol specification
├── COMPONENTS.md          # Component type reference
└── README.md              # This file
```

---

## Testing

```bash
# Run all tests
npm test

# Verbose output
npm run test:verbose
```

Tests use the Node.js built-in test runner (no external test framework needed).

---

## Contributing

1. Fork the repo and create a feature branch
2. Write tests for new functionality
3. Ensure `npm test` passes and `node -c` validates all JS files
4. Follow ESM import style — no CommonJS `require()`
5. Keep components declarative — agents describe UI, clients render it
6. Submit a pull request

---

## License

MIT
