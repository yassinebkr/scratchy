# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

# Copy package manifests first (layer caching for npm ci)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --legacy-peer-deps --omit=dev && \
    npm cache clean --force

# ─── Stage 2: Production image ──────────────────────────────────────────────
FROM node:22-slim

# Install curl for health checks
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r scratchy && useradd -r -g scratchy -m scratchy

WORKDIR /app

# Copy installed dependencies from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY package.json ./
COPY server/ ./server/
COPY lib/ ./lib/
COPY protocol/ ./protocol/
COPY state/ ./state/
COPY public/ ./public/

# Create data directory (owned by non-root user)
RUN mkdir -p /app/data && chown -R scratchy:scratchy /app

# Environment variables
ENV PORT=3002 \
    DATABASE_PATH=/app/data/scratchy.db \
    NODE_ENV=production

# Switch to non-root user
USER scratchy

EXPOSE 3002

# Health check — hit the health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3002/api/health || exit 1

CMD ["node", "server/index.js"]
