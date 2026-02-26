/**
 * @fileoverview TOON (Token-Oriented Object Notation) parser and serializer.
 *
 * TOON is a compact, human-readable data format designed to reduce token count
 * by ~30% compared to JSON while remaining easy for LLMs to generate.
 *
 * Syntax rules:
 *   key: value                        → simple property (auto-typed)
 *   2-space indentation               → nested object
 *   key[N]: v1,v2,v3                  → inline array of N values
 *   key[N]{f1,f2}: + indented rows    → tabular array of N objects
 *   key[N]: + indented lines          → multi-line array of N values
 *   ---                               → separator between top-level objects
 *   "quoted string"                   → preserves commas, colons, whitespace
 *   true / false / null / 123 / 1.5   → auto-typed primitives
 *
 * @module protocol/toon
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Auto-type a raw string value into a JS primitive.
 * @param {string} raw - The raw string value (already trimmed).
 * @returns {string|number|boolean|null}
 */
function autoType(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === '') return '';
  // Number detection: integers, floats, negative, scientific notation
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

/**
 * Strip balanced quotes from a string value if present.
 * @param {string} s
 * @returns {string}
 */
function unquote(s) {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Split a comma-separated value list respecting quoted strings.
 * E.g. `a,"b,c",d` → ['a', 'b,c', 'd']
 * @param {string} line
 * @returns {string[]}
 */
function splitCSV(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes) {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        inQuotes = true;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Measure the leading indentation (number of spaces) of a line.
 * @param {string} line
 * @returns {number}
 */
function indent(line) {
  let n = 0;
  while (n < line.length && line[n] === ' ') n++;
  return n;
}

// ─── Key header regex ───────────────────────────────────────────────────────
// Matches:
//   key[N]{f1,f2}:       → array of objects (tabular)
//   key[N]:              → array (multi-line or inline)
//   key:                 → simple / nested
const KEY_RE = /^([a-zA-Z_$][\w.$-]*?)(?:\[(\d+)\])?(?:\{([^}]+)\})?:\s*(.*)/;

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a TOON text string into a JavaScript value (object, array of objects,
 * or primitive).
 *
 * @param {string} text - The TOON-encoded text.
 * @returns {object|object[]} Parsed value. Multiple `---`-separated documents
 *   are returned as an array.
 *
 * @example
 * const obj = parseToon('name: Alice\nage: 30');
 * // { name: 'Alice', age: 30 }
 *
 * @example
 * const arr = parseToon('a: 1\n---\nb: 2');
 * // [{ a: 1 }, { b: 2 }]
 */
export function parseToon(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseToon expects a string');
  }

  // Normalise line endings
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');

  // Split on top-level `---` separators first
  const documents = [];
  let current = [];
  for (const line of rawLines) {
    if (line.trim() === '---') {
      documents.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  documents.push(current);

  // Filter out completely empty documents
  const nonEmpty = documents.filter(d => d.some(l => l.trim().length > 0));

  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return parseBlock(nonEmpty[0], 0);
  return nonEmpty.map(d => parseBlock(d, 0));
}

/**
 * Parse a block of lines at a given base indentation level into an object.
 *
 * @param {string[]} lines - Lines to parse (may include deeper indentation).
 * @param {number} baseIndent - Expected indentation of keys at this level.
 * @returns {object}
 */
function parseBlock(lines, baseIndent) {
  const obj = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank / whitespace-only lines
    if (line.trim() === '') { i++; continue; }

    const lineIndent = indent(line);

    // If this line is less indented than our base, it belongs to a parent scope
    if (lineIndent < baseIndent) break;

    const trimmed = line.trim();
    const m = KEY_RE.exec(trimmed);

    if (!m) {
      // Unparseable line — skip
      i++;
      continue;
    }

    const key = m[1];
    const arrayLen = m[2] !== undefined ? parseInt(m[2], 10) : null;
    const fieldSpec = m[3] || null; // e.g. "label,value"
    const rest = m[4]; // everything after the colon+space

    // ── Tabular array: key[N]{f1,f2}: ───────────────────────────────────
    if (arrayLen !== null && fieldSpec !== null) {
      const fields = fieldSpec.split(',').map(f => f.trim());
      const rows = [];
      i++;
      while (i < lines.length && rows.length < arrayLen) {
        const rowLine = lines[i];
        if (rowLine.trim() === '' || rowLine.trim() === '---') break;
        const rowIndent = indent(rowLine);
        if (rowIndent <= lineIndent) break;
        const values = splitCSV(rowLine.trim());
        const rowObj = {};
        for (let f = 0; f < fields.length; f++) {
          const raw = f < values.length ? values[f].trim() : '';
          rowObj[fields[f]] = autoType(unquote(raw));
        }
        rows.push(rowObj);
        i++;
      }
      obj[key] = rows;
      continue;
    }

    // ── Array: key[N]: ──────────────────────────────────────────────────
    if (arrayLen !== null && fieldSpec === null) {
      if (rest && rest.trim().length > 0) {
        // Inline array: key[N]: v1,v2,v3
        const parts = splitCSV(rest.trim());
        obj[key] = parts.map(p => autoType(unquote(p.trim())));
      } else {
        // Multi-line array
        const items = [];
        i++;
        while (i < lines.length && items.length < arrayLen) {
          const itemLine = lines[i];
          if (itemLine.trim() === '' || itemLine.trim() === '---') break;
          const itemIndent = indent(itemLine);
          if (itemIndent <= lineIndent) break;

          // Check if this item is itself a nested object (has children)
          const itemTrimmed = itemLine.trim();
          const subMatch = KEY_RE.exec(itemTrimmed);

          if (subMatch) {
            // Gather all lines for this sub-object at itemIndent
            const subLines = [itemLine];
            const subBaseIndent = itemIndent;
            let j = i + 1;
            while (j < lines.length) {
              const nextLine = lines[j];
              if (nextLine.trim() === '' || nextLine.trim() === '---') break;
              const nextIndent = indent(nextLine);
              if (nextIndent <= subBaseIndent) break;
              // This is part of the nested item
              // Actually check: if nextIndent === subBaseIndent it's a sibling key
              // We only collect deeper lines
              subLines.push(nextLine);
              j++;
            }
            // If only one line (simple value on key line), it's a simple value
            if (subLines.length === 1 && subMatch[4] && subMatch[4].trim().length > 0
                && subMatch[2] === undefined && subMatch[3] === null) {
              // Simple value like "  Deploy API,In Progress,Feb 22"
              // Actually this matched KEY_RE, so it's "key: value" — treat as single-line value
              items.push(autoType(unquote(itemTrimmed)));
            } else {
              items.push(parseBlock(subLines, subBaseIndent));
            }
            i = j;
          } else {
            // Plain value line
            items.push(autoType(unquote(itemTrimmed)));
            i++;
          }
        }
        obj[key] = items;
      }
      continue;
    }

    // ── Simple key: value or nested object ──────────────────────────────
    if (rest && rest.trim().length > 0) {
      // Value on the same line
      obj[key] = autoType(unquote(rest.trim()));
      i++;
    } else {
      // No value on line → nested object (children are indented)
      const childIndent = lineIndent + 2;
      const childLines = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        // Allow blank lines within nested blocks
        if (nextLine.trim() === '') {
          // Peek ahead: if next non-blank line is still indented, include blank
          let peek = i + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek++;
          if (peek < lines.length && indent(lines[peek]) >= childIndent) {
            childLines.push(nextLine);
            i++;
            continue;
          }
          break;
        }
        if (nextLine.trim() === '---') break;
        const nextIndent = indent(nextLine);
        if (nextIndent < childIndent) break;
        childLines.push(nextLine);
        i++;
      }
      if (childLines.length > 0) {
        obj[key] = parseBlock(childLines, childIndent);
      } else {
        obj[key] = '';
      }
    }
  }

  return obj;
}

// ─── Serializer ─────────────────────────────────────────────────────────────

/**
 * Serialize a JavaScript value to TOON format.
 *
 * @param {*} value - The value to serialize. Objects, arrays of objects,
 *   primitives, and nested structures are all supported.
 * @returns {string} TOON-formatted string.
 *
 * @example
 * toToon({ name: 'Alice', age: 30 });
 * // 'name: Alice\nage: 30'
 *
 * @example
 * toToon([{ a: 1 }, { b: 2 }]);
 * // 'a: 1\n---\nb: 2'
 */
export function toToon(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return String(value);

  // Array of top-level objects → join with ---
  if (Array.isArray(value)) {
    return value.map(item => serializeObject(item, 0)).join('\n---\n');
  }

  return serializeObject(value, 0);
}

/**
 * Check if a string value needs quoting in TOON.
 * @param {string} s
 * @returns {boolean}
 */
function needsQuote(s) {
  if (typeof s !== 'string') return false;
  if (s.length === 0) return false;
  if (s.includes(',') || s.includes(':') || s.includes('"')) return true;
  if (s !== s.trim()) return true; // leading/trailing whitespace
  // Avoid confusion with primitives
  if (['true', 'false', 'null'].includes(s)) return true;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) return true;
  return false;
}

/**
 * Quote a string for TOON output if necessary.
 * @param {*} val
 * @returns {string}
 */
function quote(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'null';
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  const s = String(val);
  return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Detect if an array is "tabular" — all elements are plain objects with
 * identical keys (suitable for TOON tabular syntax).
 * @param {Array} arr
 * @returns {string[]|null} Field names if tabular, null otherwise.
 */
function detectTabular(arr) {
  if (arr.length === 0) return null;
  if (!arr.every(item => item && typeof item === 'object' && !Array.isArray(item))) return null;
  const keys0 = Object.keys(arr[0]);
  if (keys0.length === 0) return null;
  // All items must have the same keys
  for (let i = 1; i < arr.length; i++) {
    const ki = Object.keys(arr[i]);
    if (ki.length !== keys0.length) return null;
    for (let k = 0; k < keys0.length; k++) {
      if (ki[k] !== keys0[k]) return null;
    }
  }
  // All values must be primitives (not nested objects/arrays)
  for (const item of arr) {
    for (const v of Object.values(item)) {
      if (v !== null && typeof v === 'object') return null;
    }
  }
  return keys0;
}

/**
 * Detect if an array contains only primitive values.
 * @param {Array} arr
 * @returns {boolean}
 */
function isPrimitiveArray(arr) {
  return arr.every(v => v === null || typeof v !== 'object');
}

/**
 * Serialize an object at a given indentation depth.
 * @param {object} obj
 * @param {number} depth - Indentation depth (each level = 2 spaces).
 * @returns {string}
 */
function serializeObject(obj, depth) {
  if (obj === null || obj === undefined) return pad(depth) + 'null';
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return pad(depth) + quote(obj);
  }

  const lines = [];
  const pre = pad(depth);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || typeof value !== 'object') {
      // Simple key: value
      lines.push(`${pre}${key}: ${quote(value)}`);
    } else if (Array.isArray(value)) {
      lines.push(...serializeArray(key, value, depth));
    } else {
      // Nested object
      lines.push(`${pre}${key}:`);
      lines.push(serializeObject(value, depth + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Serialize an array value for a given key.
 * @param {string} key
 * @param {Array} arr
 * @param {number} depth
 * @returns {string[]} Lines to append.
 */
function serializeArray(key, arr, depth) {
  const pre = pad(depth);
  const childPre = pad(depth + 1);
  const lines = [];

  if (arr.length === 0) {
    lines.push(`${pre}${key}[0]:`);
    return lines;
  }

  // Check for tabular form
  const fields = detectTabular(arr);
  if (fields) {
    lines.push(`${pre}${key}[${arr.length}]{${fields.join(',')}}:`);
    for (const item of arr) {
      const vals = fields.map(f => quote(item[f]));
      lines.push(`${childPre}${vals.join(',')}`);
    }
    return lines;
  }

  // Primitive array
  if (isPrimitiveArray(arr)) {
    // Short arrays inline, long arrays multi-line
    const inlineStr = arr.map(v => quote(v)).join(',');
    if (inlineStr.length <= 80) {
      lines.push(`${pre}${key}[${arr.length}]: ${inlineStr}`);
    } else {
      lines.push(`${pre}${key}[${arr.length}]:`);
      for (const v of arr) {
        lines.push(`${childPre}${quote(v)}`);
      }
    }
    return lines;
  }

  // Mixed / nested array — multi-line
  lines.push(`${pre}${key}[${arr.length}]:`);
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      lines.push(serializeObject(item, depth + 1));
    } else if (Array.isArray(item)) {
      // Nested array — serialise as inline
      lines.push(`${childPre}${item.map(v => quote(v)).join(',')}`);
    } else {
      lines.push(`${childPre}${quote(item)}`);
    }
  }

  return lines;
}

/**
 * Generate indentation string.
 * @param {number} depth
 * @returns {string}
 */
function pad(depth) {
  return '  '.repeat(depth);
}
