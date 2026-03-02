#!/bin/bash
# Build the OSS (open-core) distribution from the full Scratchy source.
#
# This script copies the free-tier subset of files from the main project
# into dist/oss/, stripping all Pro/Max features.
#
# Usage: ./scripts/build-oss.sh
#
# What's included (free tier):
#   - GenUI protocol (34 components, TOON encoding)
#   - Basic chat with agent selection
#   - Contextual surfaces (terminal, editor, files, search)
#   - Semantic memory (embeddings + context search)
#   - MCP integration
#   - Auth (signup/login/sessions)
#   - Admin config
#   - NullClaw adapter (single instance per user)
#   - SQLite state (agents, canvas, sessions, preferences)
#
# What's excluded (Pro/Max only):
#   - Teams + team routing + delegation
#   - Widgets (notes, calendar, email, analytics)
#   - Billing (Stripe, plans, usage tracking, BYOK)
#   - Workspaces (templates, persistence)
#   - Admin dashboard (quotas, deploy manager)
#   - Advanced agents (15 specialized workers)
#   - Tool policy + sandboxing
#   - Artifact store
#   - Context manager (observation masking)
#   - Crawler
#   - i18n

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OSS_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$(dirname "$(dirname "$OSS_DIR")")"

echo "Source: $SRC_DIR"
echo "Output: $OSS_DIR"

# ── Protocol layer (full, this is the open standard) ──
mkdir -p "$OSS_DIR/protocol"
cp "$SRC_DIR/protocol/genui.js" "$OSS_DIR/protocol/"
cp "$SRC_DIR/protocol/toon.js" "$OSS_DIR/protocol/"
cp "$SRC_DIR/protocol/surfaces.js" "$OSS_DIR/protocol/"
cp "$SRC_DIR/protocol/a2ui.js" "$OSS_DIR/protocol/"

# ── Libraries (free tier only) ──
mkdir -p "$OSS_DIR/lib"
cp "$SRC_DIR/lib/embeddings.js" "$OSS_DIR/lib/"
cp "$SRC_DIR/lib/indexer.js" "$OSS_DIR/lib/"
cp "$SRC_DIR/lib/compaction.js" "$OSS_DIR/lib/"
cp "$SRC_DIR/lib/context-search.js" "$OSS_DIR/lib/"
cp "$SRC_DIR/lib/mcp-registry.js" "$OSS_DIR/lib/"
cp "$SRC_DIR/lib/genui-response-parser.js" "$OSS_DIR/lib/"
cp "$SRC_DIR/lib/nullclaw-adapter.js" "$OSS_DIR/lib/"
# NOTE: observation-masking.js kept if it exists (basic version)
[ -f "$SRC_DIR/lib/observation-masking.js" ] && cp "$SRC_DIR/lib/observation-masking.js" "$OSS_DIR/lib/"

# ── State (core tables only) ──
mkdir -p "$OSS_DIR/state"
cp "$SRC_DIR/state/db.js" "$OSS_DIR/state/"
cp "$SRC_DIR/state/users.js" "$OSS_DIR/state/"
cp "$SRC_DIR/state/sessions.js" "$OSS_DIR/state/"
cp "$SRC_DIR/state/agents.js" "$OSS_DIR/state/"
cp "$SRC_DIR/state/canvas.js" "$OSS_DIR/state/"
cp "$SRC_DIR/state/preferences.js" "$OSS_DIR/state/"
cp "$SRC_DIR/state/admin-config.js" "$OSS_DIR/state/"

# ── Public (client-side, core components) ──
mkdir -p "$OSS_DIR/public/components" "$OSS_DIR/public/lib" "$OSS_DIR/public/styles"
cp "$SRC_DIR/public/index.html" "$OSS_DIR/public/"
cp "$SRC_DIR/public/components/sc-chat.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-canvas.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-terminal.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-editor.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-filetree.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-search.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-surface-toolbar.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/components/sc-tile.js" "$OSS_DIR/public/components/"
cp "$SRC_DIR/public/lib/app.js" "$OSS_DIR/public/lib/"
cp "$SRC_DIR/public/lib/ws-client.js" "$OSS_DIR/public/lib/"
cp "$SRC_DIR/public/lib/surface-manager.js" "$OSS_DIR/public/lib/"
cp -r "$SRC_DIR/public/styles/" "$OSS_DIR/public/styles/" 2>/dev/null || true

# ── Tests (protocol + core only) ──
mkdir -p "$OSS_DIR/test"
cp "$SRC_DIR/test/genui.test.js" "$OSS_DIR/test/" 2>/dev/null || true
cp "$SRC_DIR/test/toon.test.js" "$OSS_DIR/test/" 2>/dev/null || true
cp "$SRC_DIR/test/surfaces.test.js" "$OSS_DIR/test/" 2>/dev/null || true
cp "$SRC_DIR/test/a2ui.test.js" "$OSS_DIR/test/" 2>/dev/null || true

# ── Docs ──
mkdir -p "$OSS_DIR/docs"
[ -f "$SRC_DIR/dist/oss/PROTOCOL.md" ] && cp "$SRC_DIR/dist/oss/PROTOCOL.md" "$OSS_DIR/"
[ -f "$SRC_DIR/dist/oss/COMPONENTS.md" ] && cp "$SRC_DIR/dist/oss/COMPONENTS.md" "$OSS_DIR/"

# ── Data dir (gitignored, for SQLite) ──
mkdir -p "$OSS_DIR/data"
echo "*.db" > "$OSS_DIR/data/.gitignore"

echo ""
echo "✅ OSS build complete: $(find "$OSS_DIR" -name '*.js' | wc -l) JS files"
echo ""
echo "Files NOT included (Pro/Max):"
echo "  - lib/billing/*, lib/byok.js, lib/tool-policy.js"
echo "  - lib/team-router.js, lib/artifact-store.js, lib/context-manager.js"
echo "  - lib/crawler/*"
echo "  - state/teams.js, state/workspaces.js"
echo "  - public/components/sc-teams.js, sc-billing.js, sc-widget-store.js"
echo "  - public/components/sc-notes.js, sc-calendar.js, sc-email.js"
echo "  - server/agent-orchestrator.js (Pro version with teams+sandboxing)"
