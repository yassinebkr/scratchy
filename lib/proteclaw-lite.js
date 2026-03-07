/**
 * @fileoverview ProteClaw-Lite — Lightweight injection detection for Scratchy v2.
 *
 * Provides three security layers for NullClaw-backed agent sessions:
 *   1. Input sanitization  — strip zero-width chars, HTML comment injections
 *   2. Tool result scanning — regex-based injection pattern detection
 *   3. Dynamic tool blocking — reject dangerous tools when threat detected
 *
 * All state lives on the caller's session objects (no per-instance overhead).
 * All operations < 1ms. No LLM calls, no fork divergence with NullClaw.
 *
 * @module lib/proteclaw-lite
 */

// ─── External Injection Patterns (ported from ProteClaw index.ts) ──────────────

/**
 * @typedef {Object} SignalMatch
 * @property {string} pattern — pattern name
 * @property {'injection'|'exfiltration'} category
 * @property {number} confidence — 0.0–1.0
 * @property {string} matched — truncated match text
 */

const EXTERNAL_PATTERNS = [
  // Instruction override attempts
  { re: /(?:AI|assistant|agent|bot|model|GPT|Claude|LLM),?\s+(?:please|you\s+must|you\s+should|I\s+need\s+you\s+to)\s+(?:ignore|disregard|forget|override)/i, name: 'indirect_override', confidence: 0.85 },
  { re: /\[hidden\s*(?:instruction|prompt|command)\]/i, name: 'hidden_instruction_tag', confidence: 0.95 },
  { re: /<!--\s*(?:system|instruction|prompt|inject)/i, name: 'html_comment_injection', confidence: 0.85 },
  { re: /\bIMPORTANT\s*(?:INSTRUCTION|MESSAGE|NOTE)\s*(?:FOR|TO)\s*(?:THE\s*)?(?:AI|ASSISTANT|AGENT|MODEL)\b/i, name: 'important_instruction_for_ai', confidence: 0.95 },
  { re: /\bdo\s+not\s+(?:tell|show|reveal|mention)\s+(?:the\s+)?user\b/i, name: 'hide_from_user', confidence: 0.95 },
  { re: /\b(?:secretly|silently|quietly|without\s+(?:telling|informing|showing))\s+(?:the\s+)?user\b/i, name: 'secret_action', confidence: 0.85 },
  { re: /\bexecute\s+(?:this|the\s+following)\s+(?:command|code|script)\s*:/i, name: 'execute_command', confidence: 0.80 },
  { re: /\byou\s+(?:are|have\s+been)\s+(?:reprogrammed|updated|modified|reconfigured)\b/i, name: 'claim_reprogrammed', confidence: 0.85 },
  { re: /\bnew\s+(?:system\s+)?(?:objective|goal|mission|task|directive)\s*:/i, name: 'new_objective', confidence: 0.85 },
  { re: /\b(?:from\s+now\s+on|henceforth|going\s+forward)\s*,?\s*(?:your|the)\s+(?:primary|main|new)\s+(?:task|goal|objective|function)\b/i, name: 'redefine_goal', confidence: 0.80 },

  // Standard injection patterns
  { re: /ignore\s+(all\s+)?previous\s+instructions/i, name: 'ignore_previous', confidence: 0.90 },
  { re: /disregard\s+(all\s+)?prior\s+(instructions|context|rules)/i, name: 'disregard_prior', confidence: 0.90 },
  { re: /\[system\]|\[INST\]|<<SYS>>|<\|im_start\|>system/i, name: 'format_markers', confidence: 0.95 },
  { re: /override\s+(your|the|all)\s+(safety|rules|instructions|guardrails)/i, name: 'override_safety', confidence: 0.90 },
  { re: /jailbreak|DAN\s+mode|developer\s+mode|god\s+mode/i, name: 'jailbreak_terms', confidence: 0.95 },

  // Exfiltration patterns
  { re: /\b(?:send|post|transmit|upload|leak)\s+.{0,40}(?:to|via)\s+(?:https?:\/\/|webhook|api|endpoint)/i, name: 'exfil_to_endpoint', confidence: 0.85 },
  { re: /\b(?:fetch|curl|wget|http)\b.*\b(webhook|ngrok|pipedream|requestbin|hookbin)/i, name: 'http_exfil', confidence: 0.85 },
  { re: /read\s+(the\s+)?(env|\.env|environment|secrets?|credentials?|tokens?|api.?keys?)\s+.{0,30}(send|post|upload|give|show|display)/i, name: 'read_secrets', confidence: 0.85 },

  // Invisible text
  { re: /[\u200B\u200C\u200D\uFEFF]{3,}/, name: 'zero_width_chars', confidence: 0.70 },
  { re: /(?:color:\s*(?:transparent|#(?:fff(?:fff)?|white))|font-size:\s*0|display:\s*none|opacity:\s*0)[^}]*(?:instruction|prompt|command|ignore|override)/i, name: 'css_hidden_injection', confidence: 0.95 },
];

/** Instruction verbs for density heuristic. */
const INSTRUCTION_VERBS = [
  'ignore', 'disregard', 'forget', 'override', 'execute', 'run',
  'send', 'upload', 'post', 'reveal', 'show', 'display', 'output',
  'pretend', 'act as', 'you must', 'you should', 'you are now',
];

// ─── Scanner ────────────────────────────────────────────────────────────────

/**
 * Scan text for injection/exfiltration patterns.
 * Typically < 0.1ms for texts under 10KB.
 *
 * @param {string} text — tool result or external content
 * @returns {SignalMatch[]}
 */
export function scanForSignals(text) {
  if (!text || typeof text !== 'string') return [];

  const signals = [];

  for (const p of EXTERNAL_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      signals.push({
        pattern: p.name,
        category: p.name.includes('exfil') || p.name === 'http_exfil' || p.name === 'read_secrets'
          ? 'exfiltration' : 'injection',
        confidence: p.confidence,
        matched: m[0].substring(0, 100),
      });
    }
  }

  // Instruction density heuristic
  const lower = text.toLowerCase();
  const verbCount = INSTRUCTION_VERBS.filter(v => lower.includes(v)).length;
  if (verbCount >= 3 && text.length < 2000) {
    signals.push({
      pattern: 'instruction_density',
      category: 'injection',
      confidence: Math.min(0.5 + verbCount * 0.1, 0.95),
      matched: `${verbCount} instruction verbs in ${text.length} chars`,
    });
  }

  return signals;
}

/**
 * Evaluate whether signals constitute a confirmed threat.
 * Multi-signal threshold: 3+ high-severity OR 1 at ≥0.95 confidence.
 *
 * @param {SignalMatch[]} signals
 * @returns {{ confirmed: boolean, highSeverity: SignalMatch[] }}
 */
export function evaluateThreat(signals) {
  const highSeverity = signals.filter(s => s.confidence >= 0.8);
  const confirmed = highSeverity.length >= 3 || highSeverity.some(s => s.confidence >= 0.95);
  return { confirmed, highSeverity };
}

// ─── Input Sanitization ─────────────────────────────────────────────────────

/**
 * Sanitize user input before it reaches NullClaw.
 * Strips invisible manipulation characters and HTML comment injections.
 * Does NOT modify visible content.
 *
 * @param {string} input — raw user message
 * @returns {{ sanitized: string, stripped: string[] }}
 */
export function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return { sanitized: input, stripped: [] };

  const stripped = [];
  let result = input;

  // Strip zero-width characters (invisible manipulation)
  const zwOrigLen = result.length;
  result = result.replace(/[\u200B\u200C\u200D\u200E\u200F\u2060\u2061\u2062\u2063\u2064\uFEFF]/g, '');
  if (result.length !== zwOrigLen) {
    stripped.push(`zero-width chars (${zwOrigLen - result.length} removed)`);
  }

  // Strip HTML comments that could hide instructions
  const commentMatch = result.match(/<!--[\s\S]*?-->/g);
  if (commentMatch) {
    result = result.replace(/<!--[\s\S]*?-->/g, '');
    stripped.push(`HTML comments (${commentMatch.length} removed)`);
  }

  // Normalize unicode confusables for common attack chars
  // (homoglyph attacks: using lookalike chars to bypass filters)
  const confusables = {
    '\u0410': 'A', '\u0412': 'B', '\u0421': 'C', '\u0415': 'E',  // Cyrillic → Latin
    '\u041D': 'H', '\u041A': 'K', '\u041C': 'M', '\u041E': 'O',
    '\u0420': 'P', '\u0422': 'T', '\u0425': 'X',
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
    '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
  };
  let confusableCount = 0;
  result = result.replace(/[\u0410\u0412\u0421\u0415\u041D\u041A\u041C\u041E\u0420\u0422\u0425\u0430\u0435\u043E\u0440\u0441\u0443\u0445]/g, (ch) => {
    confusableCount++;
    return confusables[ch] || ch;
  });
  if (confusableCount > 0) {
    stripped.push(`unicode confusables (${confusableCount} normalized)`);
  }

  return { sanitized: result, stripped };
}

// ─── Threat State Management ────────────────────────────────────────────────

/**
 * @typedef {Object} ThreatState
 * @property {boolean} active — whether dangerous tools should be blocked
 * @property {number} signalCount — number of high-severity signals that triggered this
 * @property {string} lastTool — tool name that produced the threatening content
 * @property {number} timestamp — when the threat was detected (epoch ms)
 * @property {string[]} patterns — pattern names that triggered
 */

/** Tools blocked when threat is active. */
const DANGEROUS_TOOLS = new Set([
  'shell', 'bash',            // Command execution
  'file_write', 'write',      // File writes
  'file_edit', 'edit',        // File edits
  'http_request',             // Network requests
]);

/** Tools whose results should be scanned. */
const SCANNABLE_TOOLS = new Set([
  'http_request',             // External HTTP
  'file_read', 'read',        // Could read attacker-controlled files
  'shell', 'bash',            // Output could contain injection
]);

/**
 * Create a fresh (inactive) threat state.
 * Attach this to your session/user object.
 *
 * @returns {ThreatState}
 */
export function createThreatState() {
  return {
    active: false,
    signalCount: 0,
    lastTool: '',
    timestamp: 0,
    patterns: [],
  };
}

/**
 * Activate threat state (called when confirmed threat detected in tool result).
 *
 * @param {ThreatState} state — mutated in place
 * @param {SignalMatch[]} highSeverity — the signals that triggered
 * @param {string} toolName — tool that produced the threatening content
 */
export function activateThreat(state, highSeverity, toolName) {
  state.active = true;
  state.signalCount = highSeverity.length;
  state.lastTool = toolName;
  state.timestamp = Date.now();
  state.patterns = highSeverity.map(s => s.pattern);
}

/**
 * Clear threat state (called on new user message).
 *
 * @param {ThreatState} state — mutated in place
 */
export function clearThreat(state) {
  state.active = false;
  state.signalCount = 0;
  state.lastTool = '';
  state.timestamp = 0;
  state.patterns = [];
}

/**
 * Check if a tool should be blocked given current threat state.
 * Auto-expires after 5 minutes as safety net.
 *
 * @param {ThreatState} state
 * @param {string} toolName — the tool being called
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function shouldBlockTool(state, toolName) {
  if (!state || !state.active) return { blocked: false };

  // 5-minute expiry safety net
  if (Date.now() - state.timestamp > 5 * 60 * 1000) {
    clearThreat(state);
    return { blocked: false };
  }

  if (DANGEROUS_TOOLS.has(toolName)) {
    return {
      blocked: true,
      reason: `[ProteClaw-Lite] Tool "${toolName}" blocked — ${state.signalCount} injection signal(s) ` +
              `detected in ${state.lastTool} output (patterns: ${state.patterns.join(', ')}). ` +
              `Waiting for clean user message to unlock.`,
    };
  }

  return { blocked: false };
}

/**
 * Check if a tool result should be scanned for injection.
 *
 * @param {string} toolName
 * @returns {boolean}
 */
export function shouldScanToolResult(toolName) {
  return SCANNABLE_TOOLS.has(toolName);
}

// ─── Stats (lightweight, bounded) ───────────────────────────────────────────

const _stats = {
  scanned: 0,
  signalsDetected: 0,
  threatsConfirmed: 0,
  toolsBlocked: 0,
  inputsSanitized: 0,
  recentSignals: [],  // last 20
};

const MAX_RECENT = 20;

/**
 * Record scan result in stats.
 * @param {SignalMatch[]} signals
 * @param {boolean} confirmed
 * @param {string} [userId]
 */
export function recordStats(signals, confirmed, userId) {
  _stats.scanned++;
  _stats.signalsDetected += signals.length;
  if (confirmed) _stats.threatsConfirmed++;

  for (const s of signals) {
    _stats.recentSignals.push({
      t: Date.now(),
      pattern: s.pattern,
      confidence: s.confidence,
      userId: userId || null,
    });
  }

  // Bound recent signals
  if (_stats.recentSignals.length > MAX_RECENT) {
    _stats.recentSignals = _stats.recentSignals.slice(-MAX_RECENT);
  }
}

/** Record a tool block event. */
export function recordBlock() { _stats.toolsBlocked++; }

/** Record an input sanitization. */
export function recordSanitize() { _stats.inputsSanitized++; }

/**
 * Get current stats snapshot (for admin dashboard / monitoring).
 * @returns {Readonly<typeof _stats>}
 */
export function getStats() {
  return { ..._stats, recentSignals: [..._stats.recentSignals] };
}
