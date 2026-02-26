/**
 * @module lib/memory-extraction
 * Auto-extraction pipeline: after each turn, uses a cheap LLM call to identify
 * facts, preferences, and decisions worth remembering. Embeds and stores them.
 */

import { serializeEmbedding } from './embeddings.js';

/**
 * The system prompt used for memory extraction.
 * Designed to be cheap (small output) and reliable (structured JSON).
 */
const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction engine. Your job is to identify facts, preferences, decisions, and technical details worth remembering from a conversation turn.

Rules:
- Extract ONLY genuinely useful information (not small talk or pleasantries)
- Each fact should be a single, self-contained statement
- Classify each fact into a category: episodic (event that happened), semantic (fact/preference), procedural (how-to/process)
- Assign relevant topic tags (1-3 keywords)
- Assign confidence 0.0-1.0 (how certain this information is correct and worth storing)
- If nothing is worth remembering, return an empty array

Respond with a JSON array ONLY. No explanation, no markdown fences.
Example:
[{"content":"User prefers TypeScript over JavaScript","category":"semantic","tags":["code","preference"],"confidence":0.9}]`;

/**
 * Build the user prompt for extraction.
 * @param {string} userMessage
 * @param {string} assistantResponse
 * @returns {string}
 */
function buildExtractionPrompt(userMessage, assistantResponse) {
  return `User message:\n${userMessage}\n\nAssistant response:\n${assistantResponse}\n\nExtract memorable facts from this exchange as a JSON array:`;
}

/**
 * Parse the LLM response into structured facts.
 * Handles common LLM quirks (markdown fences, extra text, etc.)
 *
 * @param {string} response
 * @returns {Array<{content: string, category: string, tags: string[], confidence: number}>}
 */
function parseExtractionResponse(response) {
  if (!response || typeof response !== 'string') return [];

  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  // Try to find a JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    // Validate and normalize each item
    return parsed
      .filter(item =>
        item &&
        typeof item === 'object' &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0
      )
      .map(item => ({
        content: item.content.trim(),
        category: ['episodic', 'semantic', 'procedural'].includes(item.category)
          ? item.category
          : 'semantic',
        tags: Array.isArray(item.tags) ? item.tags.map(t => String(t)) : [],
        confidence: typeof item.confidence === 'number'
          ? Math.max(0, Math.min(1, item.confidence))
          : 0.5,
      }));
  } catch {
    return [];
  }
}

/**
 * Extract facts/preferences/decisions from a conversation turn.
 * Uses a cheap LLM to identify memorable information, then embeds and stores.
 *
 * @param {string} userMessage - The user's message
 * @param {string} assistantResponse - The assistant's response
 * @param {Object} opts
 * @param {Function} opts.llmCall - async (systemPrompt, userPrompt) => string
 * @param {import('./embeddings.js').EmbeddingProvider} opts.embedder
 * @param {Object} opts.memory - state/memory module
 * @param {string} opts.userId
 * @param {string} [opts.agentId]
 * @returns {Promise<Array<{content: string, category: string, tags: string[], confidence: number}>>}
 */
export async function extractMemories(userMessage, assistantResponse, opts) {
  const { llmCall, embedder, memory, userId, agentId } = opts;

  if (!userMessage || !assistantResponse) return [];
  if (!llmCall || typeof llmCall !== 'function') {
    throw new Error('opts.llmCall must be a function');
  }
  if (!userId) throw new Error('opts.userId is required');

  // Call LLM to extract facts
  const userPrompt = buildExtractionPrompt(userMessage, assistantResponse);
  const llmResponse = await llmCall(EXTRACTION_SYSTEM_PROMPT, userPrompt);

  // Parse the response
  const facts = parseExtractionResponse(llmResponse);
  if (facts.length === 0) return [];

  // Embed and store each fact
  const stored = [];
  for (const fact of facts) {
    const embedding = await embedder.embed(fact.content);
    const embeddingBuf = serializeEmbedding(embedding);

    memory.store(userId, fact.content, {
      agentId: agentId || null,
      source: 'extraction',
      category: fact.category,
      tags: fact.tags,
      confidence: fact.confidence,
      embedding: embeddingBuf,
    });

    stored.push(fact);
  }

  return stored;
}

// Export for testing
export { EXTRACTION_SYSTEM_PROMPT, parseExtractionResponse };
