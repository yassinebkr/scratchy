/**
 * @module lib/genui-response-parser
 * Parses GenUI code blocks from agent text responses.
 *
 * Detects `scratchy-canvas` (JSON), `scratchy-toon` (TOON), and `scratchy-tpl`
 * (template shorthand) fenced code blocks, parses them into canvas operation
 * arrays, and strips them from the response text.
 *
 * Delegates to the canonical parsers in protocol/genui.js and protocol/toon.js
 * rather than reimplementing parsing logic.
 */

import { parseToon } from '../protocol/toon.js';

// ─── Block extraction regexes ───────────────────────────────────────────────

/**
 * Matches all three GenUI fenced block types:
 *   ```scratchy-canvas  — JSON lines
 *   ```scratchy-toon    — TOON format
 *   ```scratchy-tpl     — Template shorthand
 *
 * Captures:
 *   [1] = block type (canvas | toon | tpl)
 *   [2] = block content (between fences)
 */
const GENUI_BLOCK_RE = /```scratchy-(canvas|toon|tpl)\s*\n([\s\S]*?)```/g;

/**
 * Fallback regex: catches unfenced patterns where the agent writes
 * "scratchy-canvas" as a label/heading followed by JSON ops (one per line).
 * Matches: `scratchy-canvas\n{"op":...}\n{"op":...}\n` (greedy until non-JSON line)
 *
 * This handles cases where the LLM forgets triple-backtick fences.
 */
const UNFENCED_CANVAS_RE = /(?:^|\n)\s*scratchy-canvas\s*\n((?:\s*\{[^\n]+\}\s*\n?)+)/gi;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a response string for GenUI code blocks.
 *
 * @param {string} response — full agent response text
 * @returns {{ text: string, ops: Array<Object>, hasOps: boolean }}
 *   - text: response with GenUI blocks stripped (clean chat text)
 *   - ops: array of canvas operations extracted
 *   - hasOps: whether any GenUI blocks were found
 */
export function parseGenUIResponse(response) {
  if (typeof response !== 'string' || !response) {
    return { text: response || '', ops: [], hasOps: false };
  }

  const ops = [];
  let hasOps = false;

  // Reset regex state
  GENUI_BLOCK_RE.lastIndex = 0;

  let match;
  while ((match = GENUI_BLOCK_RE.exec(response)) !== null) {
    const blockType = match[1];
    const blockContent = match[2];
    hasOps = true;

    let blockOps;
    switch (blockType) {
      case 'canvas':
        blockOps = parseCanvasBlock(blockContent);
        break;
      case 'toon':
        blockOps = parseToonBlock(blockContent);
        break;
      case 'tpl':
        blockOps = parseTemplateBlock(blockContent);
        break;
      default:
        blockOps = [];
    }

    ops.push(...blockOps);
  }

  // ── Fallback: catch unfenced "scratchy-canvas" followed by JSON lines ──
  if (!hasOps) {
    UNFENCED_CANVAS_RE.lastIndex = 0;
    let unfencedMatch;
    while ((unfencedMatch = UNFENCED_CANVAS_RE.exec(response)) !== null) {
      const jsonBlock = unfencedMatch[1];
      const blockOps = parseCanvasBlock(jsonBlock);
      if (blockOps.length > 0) {
        ops.push(...blockOps);
        hasOps = true;
      }
    }
  }

  // Strip all GenUI blocks from the text (fenced + unfenced)
  let text = response
    .replace(GENUI_BLOCK_RE, '');
  if (hasOps) {
    text = text.replace(UNFENCED_CANVAS_RE, '');
  }
  text = text
    .replace(/\n{3,}/g, '\n\n')   // collapse triple+ newlines left by removal
    .trim();

  return { text, ops, hasOps };
}

// ─── Block parsers ──────────────────────────────────────────────────────────

/**
 * Parse a single scratchy-canvas block (JSON lines).
 *
 * Each non-empty line is expected to be a JSON object representing one op.
 * Lines that fail JSON.parse are skipped with a warning.
 *
 * @param {string} block — content between the code fences
 * @returns {Array<Object>} parsed operations
 */
function parseCanvasBlock(block) {
  const ops = [];
  const lines = block.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && parsed.op) {
        ops.push(parsed);
      }
    } catch (err) {
      console.warn(`[genui-response-parser] Skipping unparseable canvas line: ${trimmed.slice(0, 80)}`);
    }
  }

  return ops;
}

/**
 * Parse a single scratchy-toon block using the canonical TOON parser.
 *
 * A single block may contain multiple ops separated by `---`.
 *
 * @param {string} block — TOON content between the code fences
 * @returns {Array<Object>} parsed operations
 */
function parseToonBlock(block) {
  const ops = [];

  try {
    const parsed = parseToon(block);

    if (Array.isArray(parsed)) {
      // Multiple ops separated by ---
      for (const item of parsed) {
        if (item && typeof item === 'object' && item.op) {
          ops.push(item);
        }
      }
    } else if (parsed && typeof parsed === 'object' && parsed.op) {
      // Single op
      ops.push(parsed);
    }
  } catch (err) {
    console.warn(`[genui-response-parser] Failed to parse TOON block: ${err.message}`);
  }

  return ops;
}

/**
 * Parse a single scratchy-tpl block (template shorthand).
 *
 * Each non-empty line is a JSON object with at minimum a `tpl` field.
 * The template expansion happens client-side; we just wrap it as an op.
 *
 * @param {string} block — content between the code fences
 * @returns {Array<Object>} parsed operations
 */
function parseTemplateBlock(block) {
  const ops = [];
  const lines = block.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && parsed.tpl) {
        // Wrap as a template op — client-side will expand
        const { tpl, ...rest } = parsed;
        ops.push({ op: 'template', tpl, ...rest });
      }
    } catch (err) {
      console.warn(`[genui-response-parser] Skipping unparseable template line: ${trimmed.slice(0, 80)}`);
    }
  }

  return ops;
}
