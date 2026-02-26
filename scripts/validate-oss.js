#!/usr/bin/env node
/**
 * @module scripts/validate-oss
 * Validates the OSS distribution of Scratchy v2.
 *
 * Checks:
 * 1. No private file paths appear in public files (import grep)
 * 2. All stub exports match what public code actually imports
 * 3. Basic smoke test — dist/oss/ modules can be loaded without crashes
 *
 * Usage: node scripts/validate-oss.js
 */

import {
  readFileSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist', 'oss');
const MANIFEST_PATH = join(ROOT, '.opencore-manifest.json');

let errors = 0;
let passed = 0;

function ok(msg)   { passed++; console.log(`  ✅ ${msg}`); }
function fail(msg) { errors++; console.error(`  ❌ ${msg}`); }

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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/*  Checks                                                            */
/* ------------------------------------------------------------------ */

console.log('\n🔍 Validating Scratchy OSS distribution...\n');

if (!existsSync(DIST)) {
  console.error('❌ dist/oss/ not found — run `node scripts/build-oss.js` first');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

// ── Check 1: No private imports leak into public code ────────────────────

console.log('1️⃣  Checking for private import leaks...');
{
  const privatePatterns = [
    'lib/billing/', 'lib/crawler/', 'lib/widgets/',
    'server/auth.js', 'server/widgets.js', 'server/routes/billing.js',
    'sc-admin.js', 'sc-auth.js', 'sc-setup-wizard.js', 'sc-agent-switcher.js',
    'lib/nullclaw-adapter', 'lib/memory-consolidation',
    'lib/memory-scheduler', 'lib/memory-extraction',
    'lib/mcp-client.js',
    'state/context-index.js', 'state/memory.js',
    'public/i18n/',
  ];

  const jsFiles = walkDir(DIST, [], '.js');
  let leaks = 0;

  for (const f of jsFiles) {
    const relPath = f.replace(DIST + '/', '');
    // Skip stub files
    if (Object.keys(manifest.stub).some(s => relPath === s)) continue;

    const content = readFileSync(f, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      for (const pattern of privatePatterns) {
        if (line.match(/(?:import|from|require)\s/) &&
            line.includes(pattern.replace(/\/$/, ''))) {
          fail(`Private import in ${relPath}:${i + 1} → ${line.trim()}`);
          leaks++;
        }
      }
    }
  }

  if (leaks === 0) ok('No private imports found in public code');
}

// ── Check 2: Stub exports cover what public code imports ─────────────────

console.log('\n2️⃣  Checking stub export coverage...');
{
  const jsFiles = walkDir(DIST, [], '.js');
  const stubPaths = Object.keys(manifest.stub);

  for (const stubRel of stubPaths) {
    const stubFull = join(DIST, stubRel);
    if (!existsSync(stubFull)) {
      fail(`Stub file missing: ${stubRel}`);
      continue;
    }

    const stubContent = readFileSync(stubFull, 'utf-8');

    // Extract exported names from stub
    const exportedNames = new Set();
    const exportMatches = stubContent.matchAll(
      /export\s+(?:function|const|let|var|class)\s+(\w+)|export\s*\{\s*(\w+)\s+as\s+(\w+)\s*\}/g
    );
    for (const m of exportMatches) {
      exportedNames.add(m[1] || m[3]);
    }

    // Find all files that import from this stub's path
    for (const f of jsFiles) {
      const relPath = f.replace(DIST + '/', '');
      if (relPath === stubRel) continue; // Don't check stub against itself

      const content = readFileSync(f, 'utf-8');
      // Match imports from this stub
      // e.g. import { foo, bar } from '../state/users.js'
      // or   import * as users from '../state/users.js'
      const stubBasename = stubRel.split('/').pop();
      if (!content.includes(stubBasename)) continue;

      // Named imports: import { X, Y } from '...stubRel'
      const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\//g;
      // We just check that the stub has all needed exports by name
      const namedMatches = content.matchAll(
        new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"][^'"]*${escapeRegex(stubBasename)}'`, 'g')
      );
      for (const m of namedMatches) {
        const names = m[1].split(',').map(n => {
          const parts = n.trim().split(/\s+as\s+/);
          return parts[0].trim();
        }).filter(Boolean);

        for (const name of names) {
          if (!exportedNames.has(name)) {
            fail(`Stub ${stubRel} missing export: ${name} (imported by ${relPath})`);
          }
        }
      }
    }

    ok(`Stub ${stubRel} — ${exportedNames.size} exports`);
  }
}

// ── Check 3: Syntax check all JS files ───────────────────────────────────

console.log('\n3️⃣  Syntax checking all JS files...');
{
  const jsFiles = walkDir(DIST, [], '.js');
  let syntaxOk = 0;

  for (const f of jsFiles) {
    try {
      execSync(`node -c "${f}"`, { stdio: 'pipe' });
      syntaxOk++;
    } catch (err) {
      const relPath = f.replace(DIST + '/', '');
      fail(`Syntax error: ${relPath} — ${err.stderr?.toString().split('\n')[0] || err.message}`);
    }
  }

  ok(`${syntaxOk}/${jsFiles.length} files pass syntax check`);
}

// ── Check 4: Smoke test — import key modules ─────────────────────────────

console.log('\n4️⃣  Smoke test — importing key modules...');
{
  const smokeModules = [
    'protocol/genui.js',
    'protocol/toon.js',
    'protocol/a2ui.js',
    'protocol/surfaces.js',
    'state/db.js',
    'lib/observation-masking.js',
  ];

  for (const mod of smokeModules) {
    const fullPath = join(DIST, mod);
    if (!existsSync(fullPath)) {
      fail(`Module not found: ${mod}`);
      continue;
    }
    try {
      // Use dynamic import in a child process to avoid polluting this process
      const code = `import('${fullPath.replace(/\\/g, '/')}').then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); })`;
      execSync(`node -e "${code.replace(/"/g, '\\"')}"`, {
        stdio: 'pipe',
        timeout: 5000,
      });
      ok(`Import OK: ${mod}`);
    } catch (err) {
      const stderr = err.stderr?.toString().trim() || err.message;
      fail(`Import failed: ${mod} — ${stderr.split('\n')[0]}`);
    }
  }
}

// ── Check 5: Required files exist ────────────────────────────────────────

console.log('\n5️⃣  Checking required files...');
{
  const required = [
    'server/index.js', 'server/router.js', 'server/ws.js',
    'protocol/genui.js', 'protocol/toon.js',
    'public/index.html', 'public/components/sc-chat.js',
    'public/components/sc-canvas.js', 'public/components/sc-tile.js',
    'state/db.js', 'package.json', 'Dockerfile',
    'docker-compose.yml', 'LICENSE', '.env.example',
    'README.md', 'PROTOCOL.md', 'COMPONENTS.md',
  ];

  for (const f of required) {
    if (existsSync(join(DIST, f))) {
      ok(`Present: ${f}`);
    } else {
      fail(`Missing required file: ${f}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Summary                                                           */
/* ------------------------------------------------------------------ */

console.log('\n' + '─'.repeat(60));
if (errors > 0) {
  console.log(`\n❌ Validation failed: ${errors} error(s), ${passed} passed`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${passed} checks passed! OSS distribution is valid.\n`);
}
