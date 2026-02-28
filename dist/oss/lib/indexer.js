/**
 * @module lib/indexer
 * Document indexer: scans directories of .md files, chunks them, embeds, and stores
 * in the context_index table. Generates TOON-formatted manifests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { serializeEmbedding } from './embeddings.js';
import { serialize } from '../protocol/toon.js';

/**
 * Infer a category from a file path.
 *
 * @param {string} filePath
 * @returns {'tool'|'skill'|'component'|'protocol'|'ops'|'agent'}
 */
export function inferCategory(filePath) {
  const lc = filePath.toLowerCase();
  if (lc.includes('tool') || lc.includes('/tools/')) return 'tool';
  if (lc.includes('skill') || lc.includes('/skills/')) return 'skill';
  if (lc.includes('component') || lc.includes('/components/')) return 'component';
  if (lc.includes('protocol') || lc.includes('/protocols/')) return 'protocol';
  if (lc.includes('ops') || lc.includes('deploy')) return 'ops';
  if (lc.includes('agent') || lc.includes('/agents/')) return 'agent';
  return 'protocol'; // default
}

/**
 * Chunk a markdown file into indexable pieces.
 * Strategy: split by ## headers. Each section = one chunk.
 * If a section > ~4000 chars (~1000 tokens), split at paragraph boundaries.
 * Each chunk includes: source, content, category.
 *
 * @param {string} filePath - Path to the file (used as source identifier)
 * @param {string} content - File content
 * @returns {Array<{source: string, content: string, category: string}>}
 */
export function chunkMarkdown(filePath, content) {
  const category = inferCategory(filePath);
  const MAX_CHUNK_CHARS = 4000;

  // Split by ## headers (keep the header with its section)
  const sections = [];
  const lines = content.split('\n');
  let current = [];

  for (const line of lines) {
    // Split on ## (level 2+) headers, but keep the first chunk (before any ## header)
    if (/^#{1,3}\s/.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const text = current.join('\n').trim();
    if (text) sections.push(text);
  }

  const chunks = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    if (section.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        source: sections.length > 1 ? `${filePath}#${i}` : filePath,
        content: section,
        category,
      });
    } else {
      // Split at paragraph boundaries (double newline)
      const paragraphs = section.split(/\n\n+/);
      let buffer = '';
      let subIdx = 0;

      for (const para of paragraphs) {
        if (buffer.length + para.length + 2 > MAX_CHUNK_CHARS && buffer.length > 0) {
          chunks.push({
            source: `${filePath}#${i}.${subIdx}`,
            content: buffer.trim(),
            category,
          });
          buffer = para;
          subIdx++;
        } else {
          buffer += (buffer ? '\n\n' : '') + para;
        }
      }
      if (buffer.trim()) {
        chunks.push({
          source: `${filePath}#${i}.${subIdx}`,
          content: buffer.trim(),
          category,
        });
      }
    }
  }

  return chunks;
}

/**
 * Recursively find all .md files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function findMarkdownFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Index all documents in a directory tree.
 * Scans for .md files, chunks them, embeds, and stores in context_index.
 * Skips re-embedding when content hash is unchanged (via upsert's chunkHash check).
 *
 * @param {string} docsDir - Root directory to scan
 * @param {Object} opts
 * @param {import('./embeddings.js').EmbeddingProvider} opts.embedder - Embedding provider
 * @param {Object} opts.contextIndex - state/context-index module (with upsert, etc.)
 * @param {Object} [opts.chunkStrategy] - Reserved for future chunk strategies
 * @returns {Promise<{indexed: number, skipped: number, total: number}>}
 */
export async function indexDirectory(docsDir, opts) {
  const { embedder, contextIndex } = opts;
  const mdFiles = findMarkdownFiles(docsDir);

  let indexed = 0;
  let skipped = 0;
  let total = 0;

  for (const filePath of mdFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(docsDir, filePath);
    const chunks = chunkMarkdown(relativePath, content);

    for (const chunk of chunks) {
      total++;

      // Probe: upsert without embedding to check content hash via skipped flag
      const probe = contextIndex.upsert(chunk.source, chunk.content, {
        category: chunk.category,
      });

      if (probe.skipped) {
        // Content unchanged — check if embedding already exists
        const existing = contextIndex.get(probe.id);
        if (existing && existing.embedding) {
          skipped++;
          continue;
        }
        // Embedding missing — fall through to embed
      }

      // Need to embed (new, updated, or missing embedding)
      const embedding = await embedder.embed(chunk.content);
      const embeddingBuf = serializeEmbedding(embedding);

      // Delete + re-insert with embedding (upsert would skip on same hash)
      contextIndex.deleteBySource(chunk.source);
      contextIndex.upsert(chunk.source, chunk.content, {
        category: chunk.category,
        embedding: embeddingBuf,
      });
      indexed++;
    }
  }

  return { indexed, skipped, total };
}

/**
 * Generate a compact manifest from indexed docs.
 * Returns a TOON-formatted string grouped by category.
 *
 * @param {Object} contextIndex - state/context-index module
 * @param {string} [category] - Optional category filter
 * @returns {string} TOON-formatted manifest
 */
export function generateManifest(contextIndex, category) {
  const rows = contextIndex.search(category ? { category } : {});

  if (rows.length === 0) return '';

  // Group by category
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    const preview = row.content.replace(/\n/g, ' ').slice(0, 80).trim();
    grouped[row.category].push({
      source: row.source,
      preview,
    });
  }

  // Generate TOON tabular format per category
  const sections = [];
  for (const [cat, items] of Object.entries(grouped)) {
    const toon = serialize({
      [`${cat}s`]: items,
    });
    sections.push(toon);
  }

  return sections.join('\n');
}
