/**
 * @module server/seed-agents
 * Seeds default agent records into the database on first startup.
 * Reads the base system prompt from config/agent-system-prompt.md
 * and creates 4 builtin agents if none exist.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SYSTEM_PROMPT_PATH = path.join(import.meta.dirname, '..', 'config', 'agent-system-prompt.md');

/**
 * Role-specific prompt additions appended to the base system prompt.
 */
const AGENT_DEFS = [
  {
    name: 'Atlas',
    model: 'sonnet',
    temperature: 0.7,
    avatar: '🏛️',
    rolePrompt: `\n## Role: Code & General Purpose\nYou are Atlas, a general-purpose coding agent. You excel at writing, reviewing, and debugging code. Use \`code\` components for snippets, \`checklist\` for task tracking, and \`table\` for structured data. Default agent for all requests.`,
  },
  {
    name: 'Iris',
    model: 'sonnet',
    temperature: 0.8,
    avatar: '🎨',
    rolePrompt: `\n## Role: UI/UX Designer\nYou are Iris, a UI/UX design specialist. Use the canvas extensively — render mockups with \`card\`, \`hero\`, \`buttons\`, and layout components. Prefer visual responses. Use color-coded \`tags\` and \`stats\` for design system tokens.`,
  },
  {
    name: 'Nova',
    model: 'sonnet',
    temperature: 0.5,
    avatar: '🔭',
    rolePrompt: `\n## Role: Researcher\nYou are Nova, a research and analysis agent. Use \`table\` for comparisons, \`chart-bar\`/\`chart-line\`/\`chart-pie\` for data visualization, \`link-card\` for sources, and \`timeline\` for chronological findings. Cite sources when possible.`,
  },
  {
    name: 'Echo',
    model: 'sonnet',
    temperature: 0.9,
    avatar: '✍️',
    rolePrompt: `\n## Role: Writer\nYou are Echo, a content writing agent. Use \`card\` for drafts, \`accordion\` for structured outlines, \`tabs\` for variations, and \`checklist\` for editorial checklists. Prefer plain text for short-form; canvas for structured long-form content.`,
  },
];

/**
 * Seed default agents into the database if none exist.
 * Reads the base system prompt from config/agent-system-prompt.md
 * and inserts 4 builtin agents: Atlas, Iris, Nova, Echo.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function seedAgents(db) {
  // Check if agents table has any rows
  const row = db.prepare(
    "SELECT COUNT(*) AS count FROM agents"
  ).get();

  if (row.count > 0) {
    console.log(`[seed-agents] ${row.count} agent(s) already exist — skipping seed`);
    return;
  }

  // Read the base system prompt
  let basePrompt = '';
  try {
    basePrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
  } catch (err) {
    console.warn(`[seed-agents] Could not read system prompt at ${SYSTEM_PROMPT_PATH}: ${err.message}`);
    console.warn('[seed-agents] Agents will be created with empty system prompts');
  }

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO agents (id, name, systemPrompt, model, temperature, surfaces, mcpServers, skills, avatar, enabled, isBuiltin, userId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, '[]', '[]', '[]', ?, 1, 1, NULL, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const def of AGENT_DEFS) {
      const id = crypto.randomUUID();
      const systemPrompt = basePrompt + def.rolePrompt;

      insert.run(
        id,
        def.name,
        systemPrompt,
        def.model,
        def.temperature,
        def.avatar,
        now,
        now
      );
    }
  });

  tx();
  console.log(`[seed-agents] Seeded ${AGENT_DEFS.length} default agents: ${AGENT_DEFS.map(d => d.name).join(', ')}`);
}
