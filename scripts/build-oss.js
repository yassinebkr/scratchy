#!/usr/bin/env node
/**
 * @module scripts/build-oss
 * Builds the open-source (OSS) distribution of Scratchy v2.
 *
 * Reads .opencore-manifest.json, copies public files to dist/oss/,
 * writes stubs for private dependencies, strips private-only config,
 * and validates the result.
 *
 * Usage: node scripts/build-oss.js
 */

import {
  readFileSync, writeFileSync, mkdirSync, cpSync,
  existsSync, rmSync, statSync, readdirSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist', 'oss');
const MANIFEST_PATH = join(ROOT, '.opencore-manifest.json');

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let errors = 0;
let warnings = 0;

function log(msg)  { console.log(`  ${msg}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { warnings++; console.warn(`  ⚠️  ${msg}`); }
function fail(msg) { errors++; console.error(`  ❌ ${msg}`); }

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function writeOut(dest, content) {
  ensureDir(dest);
  writeFileSync(dest, content, 'utf-8');
}

function walkDir(dir, results = [], ext = null) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkDir(full, results, ext);
    } else if (!ext || entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function getDirSize(dir) {
  let total = 0;
  for (const f of walkDir(dir)) total += statSync(f).size;
  if (total < 1024) return `${total} B`;
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
  return `${(total / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/*  Main build                                                        */
/* ------------------------------------------------------------------ */

console.log('\n🔨 Building Scratchy OSS distribution...\n');

// 1. Read manifest
if (!existsSync(MANIFEST_PATH)) {
  console.error('❌ .opencore-manifest.json not found');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
log(`Manifest v${manifest.version} loaded — ${manifest.public.length} public, ${manifest.private.length} private`);

// 2. Clean dist/oss/
if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
ok('Cleaned dist/oss/');

// 3. Copy public files
console.log('\n📦 Copying public files...');
let copied = 0;
for (const entry of manifest.public) {
  const src = join(ROOT, entry);
  const dest = join(DIST, entry);

  if (!existsSync(src)) {
    warn(`Public file not found, skipping: ${entry}`);
    continue;
  }

  if (isDir(src)) {
    cpSync(src, dest, { recursive: true });
  } else {
    ensureDir(dest);
    cpSync(src, dest);
  }
  copied++;
}
ok(`Copied ${copied} public entries`);

// 4. Write stub files for private dependencies
console.log('\n🔧 Writing stubs for private dependencies...');
let stubCount = 0;
for (const [filePath, content] of Object.entries(manifest.stub)) {
  writeOut(join(DIST, filePath), content);
  stubCount++;
  log(`Stub: ${filePath}`);
}
ok(`Wrote ${stubCount} stub files`);

// 5. Create simplified docker-compose.yml
console.log('\n🐳 Creating simplified docker-compose.yml...');
{
  const stripped = `version: "3.8"

services:
  # ─── Scratchy v2 OSS — AI Chat Workbench ───────────────────────────────────
  scratchy:
    build: .
    container_name: scratchy
    restart: unless-stopped
    ports:
      - "\${SCRATCHY_PORT:-3002}:3002"
    volumes:
      - scratchy-data:/app/data
    environment:
      - PORT=3002
      - DATABASE_PATH=/app/data/scratchy.db
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/api/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3

volumes:
  scratchy-data:
`;
  writeOut(join(DIST, 'docker-compose.yml'), stripped);
  ok('Simplified docker-compose.yml (removed openclaw/nullclaw, Stripe/Resend env)');
}

// 6. Create stripped package.json
console.log('\n📋 Creating stripped package.json...');
{
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

  const removeDeps = ['@mozilla/readability', 'linkedom', 'robots-parser', 'tough-cookie'];
  for (const dep of removeDeps) {
    if (pkg.dependencies?.[dep]) {
      delete pkg.dependencies[dep];
      log(`Removed dependency: ${dep}`);
    }
  }

  pkg.name = 'scratchy-oss';
  pkg.license = 'MIT';
  pkg.description = 'Scratchy v2 OSS — Contextual AI chat interface with GenUI protocol';
  pkg.scripts = {
    start: 'node server/index.js',
    dev: 'node --watch server/index.js',
    test: 'node --test test/*.test.js',
  };

  writeOut(join(DIST, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  ok(`Stripped package.json (${Object.keys(pkg.dependencies).length} dependencies kept)`);
}

// 7. Create stripped .env.example
console.log('\n🔑 Creating stripped .env.example...');
{
  const envLines = readFileSync(join(ROOT, '.env.example'), 'utf-8').split('\n');
  const removePatterns = ['STRIPE_', 'RESEND_', 'NULLCLAW_', 'OPENCLAW_'];
  const removeSections = ['Email (Resend)', 'Billing (Stripe)', 'NullClaw'];
  const filtered = envLines.filter(line => {
    const trimmed = line.trim();
    // Remove section headers for removed features
    if (removeSections.some(s => trimmed.includes(s))) return false;
    if (trimmed.startsWith('#')) {
      return !removePatterns.some(p => trimmed.includes(p));
    }
    return !removePatterns.some(p => trimmed.startsWith(p));
  });
  writeOut(join(DIST, '.env.example'), filtered.join('\n'));
  ok('Stripped .env.example (removed Stripe, Resend, NullClaw)');
}

// 8. Write MIT LICENSE
console.log('\n📜 Writing LICENSE (MIT)...');
{
  const year = new Date().getFullYear();
  const license = `MIT License

Copyright (c) ${year} Scratchy Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  writeOut(join(DIST, 'LICENSE'), license);
  ok('MIT LICENSE written');
}

// 9. Create data directory placeholder
mkdirSync(join(DIST, 'data'), { recursive: true });
writeOut(join(DIST, 'data', '.gitkeep'), '');

// 10. Validate — syntax check all JS files
console.log('\n🔍 Validating JS syntax...');
{
  const jsFiles = walkDir(DIST, [], '.js');
  let passed = 0;
  for (const f of jsFiles) {
    try {
      execSync(`node -c "${f}"`, { stdio: 'pipe' });
      passed++;
    } catch (err) {
      const relPath = f.replace(DIST + '/', '');
      fail(`Syntax error in ${relPath}: ${err.stderr?.toString().trim() || err.message}`);
    }
  }
  ok(`${passed}/${jsFiles.length} JS files pass syntax check`);
}

// 11. Validate — check no private file paths leak into public files
console.log('\n🔒 Checking for private file leaks...');
{
  const privatePatterns = [
    'lib/billing/', 'lib/crawler/', 'lib/widgets/',
    'server/auth.js', 'server/widgets.js',
    'sc-admin.js', 'sc-auth.js', 'sc-setup-wizard.js',
    'lib/nullclaw-adapter', 'lib/memory-consolidation',
    'lib/memory-scheduler', 'lib/memory-extraction',
    'lib/mcp-client.js',
  ];

  const jsFiles = walkDir(DIST, [], '.js');
  let leaks = 0;
  for (const f of jsFiles) {
    const relPath = f.replace(DIST + '/', '');
    // Skip stub files
    if (Object.keys(manifest.stub).some(s => relPath === s)) continue;

    const content = readFileSync(f, 'utf-8');
    for (const pattern of privatePatterns) {
      const importRegex = new RegExp(
        `(?:import|from|require).*['"].*${escapeRegex(pattern)}`, 'g'
      );
      const matches = content.match(importRegex);
      if (matches) {
        fail(`Private import in ${relPath}: ${matches[0].trim()}`);
        leaks++;
      }
    }
  }
  if (leaks === 0) ok('No private file imports found in public code');
}

/* ------------------------------------------------------------------ */
/*  Summary                                                           */
/* ------------------------------------------------------------------ */

console.log('\n' + '─'.repeat(60));
if (errors > 0) {
  console.log(`\n❌ Build completed with ${errors} error(s), ${warnings} warning(s)`);
  console.log('   Fix errors before publishing the OSS repo.\n');
  process.exit(1);
} else {
  console.log(`\n✅ OSS build complete! (${warnings} warning(s))`);
  console.log(`   Output: dist/oss/`);
  console.log(`   Files:  ${walkDir(DIST).length} total`);
  console.log(`   Size:   ${getDirSize(DIST)}\n`);
  console.log('   Next steps:');
  console.log('   1. cd dist/oss && npm install');
  console.log('   2. node scripts/validate-oss.js');
  console.log('   3. Copy to public repo\n');
}
