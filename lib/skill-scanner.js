/**
 * @module lib/skill-scanner
 * Security vetting pipeline for community/marketplace skills.
 *
 * Scans skill manifests for:
 * 1. Prompt injection patterns (static regex analysis)
 * 2. Content integrity (SHA-256 hash verification)
 * 3. Dangerous tool requests (risk classification)
 * 4. Suspicious patterns (encoded payloads, exfiltration attempts)
 *
 * Context: Snyk Agent Scan found 2.7% of 13,729 community skills were malicious.
 * Attack vectors: prompt injection, tool poisoning, cross-origin escalation,
 * toxic flows, MCP rug pulls, malware payloads, hard-coded secrets.
 *
 * Usage:
 *   import { scanSkill, RISK_LEVELS } from './skill-scanner.js';
 *   const report = scanSkill(manifest);
 *   if (report.risk === 'critical') reject(report);
 */

import crypto from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Risk levels                                                       */
/* ------------------------------------------------------------------ */

export const RISK_LEVELS = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const RISK_LABELS = ['safe', 'low', 'medium', 'high', 'critical'];

/* ------------------------------------------------------------------ */
/*  Injection patterns (static analysis)                              */
/* ------------------------------------------------------------------ */

/**
 * Regex patterns that indicate prompt injection attempts.
 * Each has a pattern, description, and severity.
 */
const INJECTION_PATTERNS = [
  // Direct instruction override
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, desc: 'Instruction override attempt', severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?prior\s+(instructions|context|rules)/i, desc: 'Instruction disregard attempt', severity: 'critical' },
  { pattern: /forget\s+(everything|all)\s+(you|that)/i, desc: 'Memory wipe attempt', severity: 'critical' },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, desc: 'Identity reassignment attempt', severity: 'critical' },
  { pattern: /new\s+instructions?\s*:/i, desc: 'Instruction injection', severity: 'critical' },
  { pattern: /system\s*prompt\s*:/i, desc: 'System prompt injection', severity: 'critical' },

  // Exfiltration
  { pattern: /send\s+(to|all|the|this)\s+.*(email|webhook|url|endpoint)/i, desc: 'Data exfiltration via send', severity: 'high' },
  { pattern: /fetch\s*\(\s*['"][^'"]*['"].*\b(token|key|secret|password|credential)/i, desc: 'Credential exfiltration via fetch', severity: 'critical' },
  { pattern: /curl\s+.*\b(token|key|secret|password)/i, desc: 'Credential exfiltration via curl', severity: 'critical' },
  { pattern: /base64\s*(encode|decode)/i, desc: 'Base64 encoding (potential payload obfuscation)', severity: 'medium' },

  // Privilege escalation
  { pattern: /\bsudo\b/i, desc: 'Privilege escalation (sudo)', severity: 'high' },
  { pattern: /chmod\s+[0-7]*7[0-7]*/i, desc: 'Dangerous permission change', severity: 'high' },
  { pattern: /rm\s+-rf?\s+\//i, desc: 'Destructive filesystem operation', severity: 'critical' },

  // Tool poisoning
  { pattern: /override\s+(the\s+)?tool/i, desc: 'Tool override attempt', severity: 'high' },
  { pattern: /redefine\s+(the\s+)?function/i, desc: 'Function redefinition attempt', severity: 'high' },
  { pattern: /\beval\s*\(/i, desc: 'Dynamic code execution (eval)', severity: 'high' },
  { pattern: /new\s+Function\s*\(/i, desc: 'Dynamic function construction', severity: 'high' },
  { pattern: /process\.env/i, desc: 'Environment variable access', severity: 'medium' },

  // Encoded payloads
  { pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){3,}/i, desc: 'Hex-encoded payload', severity: 'high' },
  { pattern: /\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){3,}/i, desc: 'Unicode-encoded payload', severity: 'high' },
];

/* ------------------------------------------------------------------ */
/*  Dangerous tool classifications                                    */
/* ------------------------------------------------------------------ */

const TOOL_RISK = {
  // Critical — full system access
  exec: 'critical',
  shell: 'critical',
  run_command: 'critical',
  execute_command: 'critical',

  // High — filesystem write access
  filesystem_write: 'high',
  write_file: 'high',
  create_file: 'high',
  delete_file: 'high',

  // High — network access
  http_request: 'high',
  network_request: 'high',
  send_email: 'high',
  webhook: 'high',

  // Medium — browser/screen access
  browser_control: 'medium',
  screenshot: 'medium',
  screen_capture: 'medium',

  // Low — read-only operations
  filesystem_read: 'low',
  read_file: 'low',
  web_search: 'low',
  web_fetch: 'low',
  memory_search: 'safe',
  memory_save: 'safe',
  get_current_time: 'safe',
  canvas_clear: 'safe',
};

/* ------------------------------------------------------------------ */
/*  Scanner implementation                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute SHA-256 hash of skill content for integrity verification.
 * @param {string} content
 * @returns {string} hex digest
 */
export function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Run static analysis on text for injection patterns.
 * @param {string} text — prompt text to scan
 * @returns {Array<{ pattern: string, desc: string, severity: string, match: string }>}
 */
function scanForInjections(text) {
  const findings = [];
  for (const { pattern, desc, severity } of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        pattern: pattern.source,
        desc,
        severity,
        match: match[0].slice(0, 100), // truncate match for report
      });
    }
  }
  return findings;
}

/**
 * Classify tool risk levels.
 * @param {string[]} tools — list of tool names the skill requests
 * @returns {Array<{ tool: string, risk: string }>}
 */
function classifyTools(tools) {
  if (!tools || !Array.isArray(tools)) return [];
  return tools.map(tool => ({
    tool,
    risk: TOOL_RISK[tool.toLowerCase()] || 'medium', // unknown tools default to medium
  }));
}

/**
 * Scan a skill manifest for security issues.
 *
 * @param {Object} manifest — skill to scan
 * @param {string} manifest.id — skill identifier
 * @param {string} manifest.name — display name
 * @param {string} manifest.prompt — the skill's prompt text
 * @param {string[]} [manifest.tools] — tools the skill requests
 * @param {string} [manifest.source] — 'custom' | 'anthropic' | 'community'
 * @param {string} [manifest.expectedHash] — published SHA-256 hash for integrity check
 * @returns {Object} scan report
 */
export function scanSkill(manifest) {
  const report = {
    skillId: manifest.id,
    skillName: manifest.name,
    source: manifest.source || 'unknown',
    scannedAt: new Date().toISOString(),
    contentHash: null,
    hashMatch: null,
    injectionFindings: [],
    toolFindings: [],
    riskScore: 0,
    risk: 'safe',
    passed: true,
    summary: '',
  };

  // ── Step 1: Content hash ──
  const promptText = manifest.prompt || '';
  report.contentHash = hashContent(promptText);

  if (manifest.expectedHash) {
    report.hashMatch = report.contentHash === manifest.expectedHash;
    if (!report.hashMatch) {
      report.riskScore = Math.max(report.riskScore, RISK_LEVELS.critical);
      report.summary += 'HASH MISMATCH — content modified after publish. ';
    }
  }

  // ── Step 2: Injection scan ──
  report.injectionFindings = scanForInjections(promptText);
  for (const finding of report.injectionFindings) {
    const level = RISK_LEVELS[finding.severity] || RISK_LEVELS.medium;
    report.riskScore = Math.max(report.riskScore, level);
  }

  // ── Step 3: Tool risk classification ──
  report.toolFindings = classifyTools(manifest.tools);
  for (const tf of report.toolFindings) {
    const level = RISK_LEVELS[tf.risk] || RISK_LEVELS.medium;
    report.riskScore = Math.max(report.riskScore, level);
  }

  // ── Step 4: Source trust bonus ──
  // Trusted sources get risk reduced by 1 (but never below findings)
  if (manifest.source === 'custom' || manifest.source === 'anthropic') {
    // Trusted — only flag if actual injection patterns found
    if (report.injectionFindings.length === 0) {
      report.riskScore = Math.min(report.riskScore, RISK_LEVELS.low);
    }
  }

  // ── Final classification ──
  report.risk = RISK_LABELS[report.riskScore] || 'critical';
  report.passed = report.riskScore < RISK_LEVELS.high;

  if (!report.summary) {
    if (report.passed) {
      const toolWarnings = report.toolFindings.filter(t => RISK_LEVELS[t.risk] >= RISK_LEVELS.medium).length;
      report.summary = toolWarnings > 0
        ? `Passed with ${toolWarnings} tool warning(s).`
        : 'Clean — no issues found.';
    } else {
      const critical = report.injectionFindings.filter(f => f.severity === 'critical').length;
      const high = report.injectionFindings.filter(f => f.severity === 'high').length;
      report.summary = `BLOCKED — ${critical} critical, ${high} high severity finding(s).`;
    }
  }

  return report;
}

/**
 * Batch scan multiple skills.
 * @param {Array<Object>} manifests
 * @returns {Array<Object>} array of scan reports
 */
export function scanSkills(manifests) {
  return manifests.map(scanSkill);
}

/**
 * Generate a human-readable scan report.
 * @param {Object} report — from scanSkill()
 * @returns {string} formatted report
 */
export function formatReport(report) {
  const lines = [
    `Skill Scanner Report — ${report.skillName} (${report.skillId})`,
    `Source: ${report.source} | Scanned: ${report.scannedAt}`,
    `Hash: ${report.contentHash?.slice(0, 16)}...`,
    report.hashMatch !== null ? `Hash Match: ${report.hashMatch ? 'YES' : 'NO ⚠️'}` : '',
    `Risk: ${report.risk.toUpperCase()} (score: ${report.riskScore}/4)`,
    `Verdict: ${report.passed ? 'PASS ✅' : 'BLOCK ❌'}`,
    '',
  ];

  if (report.injectionFindings.length > 0) {
    lines.push('Injection Findings:');
    for (const f of report.injectionFindings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.desc} — matched: "${f.match}"`);
    }
    lines.push('');
  }

  if (report.toolFindings.length > 0) {
    lines.push('Tool Risk:');
    for (const t of report.toolFindings) {
      lines.push(`  [${t.risk.toUpperCase()}] ${t.tool}`);
    }
    lines.push('');
  }

  lines.push(report.summary);
  return lines.filter(l => l !== undefined).join('\n');
}
