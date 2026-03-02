/**
 * @module lib/skills/index
 * Skills registry — maps agents to skill modules and tool whitelists.
 *
 * Usage:
 *   import { getSkillsForAgent, getToolsForAgent, getSkillPrompt, ALL_SKILLS } from './skills/index.js';
 *
 *   const skills = getSkillsForAgent('architect');  // → [specDrivenDev, codeReview]
 *   const tools  = getToolsForAgent('architect');   // → ['memory_search', 'memory_save', ...]
 *   const prompt = getSkillPrompt('architect');      // → combined skill prompt text
 */

import specDrivenDev from './spec-driven-dev.js';
import codeReview from './code-review.js';
import systemsEngineering from './systems-engineering.js';
import apiEngineering from './api-engineering.js';
import dataEngineering from './data-engineering.js';
import research from './research.js';
import securityTesting from './security-testing.js';
import genuiMastery from './genui-mastery.js';
import webComponents from './web-components.js';
import cssArchitecture from './css-architecture.js';
import accessibility from './accessibility.js';
import visualDocs from './visual-docs.js';

/* ------------------------------------------------------------------ */
/*  All registered skills                                             */
/* ------------------------------------------------------------------ */

export const ALL_SKILLS = [
  specDrivenDev,
  codeReview,
  systemsEngineering,
  apiEngineering,
  dataEngineering,
  research,
  securityTesting,
  genuiMastery,
  webComponents,
  cssArchitecture,
  accessibility,
  visualDocs,
];

/** Lookup by skill id */
const SKILL_MAP = new Map(ALL_SKILLS.map(s => [s.id, s]));

/* ------------------------------------------------------------------ */
/*  Agent → Skills mapping                                            */
/* ------------------------------------------------------------------ */

/**
 * Which skills each agent gets.
 * Keys are lowercase agent names matching seed-agents.js definitions.
 */
const AGENT_SKILLS = {
  // ── Original 4 (general-purpose — get subset of relevant skills) ──
  atlas:   ['code-review'],
  iris:    ['genui-mastery', 'css-architecture'],
  nova:    ['research'],
  echo:    [],  // Writer — no specialized skill module (role prompt is sufficient)

  // ── Backend Dev Team ──
  architect: ['spec-driven-dev', 'code-review'],
  sys:       ['systems-engineering'],
  api:       ['api-engineering'],
  data:      ['data-engineering'],
  scout:     ['research'],
  qa:        ['code-review', 'security-testing'],

  // ── Frontend Team ──
  director:   ['genui-mastery'],
  component:  ['web-components'],
  layout:     ['css-architecture'],
  interact:   ['accessibility'],
  visualizer: ['visual-docs'],
};

/* ------------------------------------------------------------------ */
/*  Agent → Tool whitelist                                            */
/* ------------------------------------------------------------------ */

/**
 * Which builtin tools each agent can access.
 * Keys are lowercase agent names.
 * If an agent is not listed, they get ALL tools (backward compat for originals).
 */
const AGENT_TOOLS = {
  // ── Original 4 — full access (backward compatible) ──
  atlas: null,  // null = all tools
  iris:  null,
  nova:  null,
  echo:  null,

  // ── Backend Dev Team ──
  architect: ['memory_search', 'memory_save', 'context_search', 'get_current_time'],
  sys:       ['memory_search', 'memory_save', 'canvas_clear', 'get_current_time'],
  api:       ['memory_search', 'memory_save', 'web_fetch', 'get_current_time'],
  data:      ['memory_search', 'memory_save', 'context_search', 'get_current_time'],
  scout:     ['memory_search', 'memory_save', 'web_search', 'web_fetch', 'context_search', 'get_current_time'],
  qa:        ['memory_search', 'memory_save', 'context_search', 'get_current_time'],

  // ── Frontend Team ──
  director:   ['memory_search', 'memory_save', 'canvas_clear', 'get_current_time'],
  component:  ['memory_search', 'memory_save', 'canvas_clear', 'get_current_time'],
  layout:     ['memory_search', 'memory_save', 'canvas_clear', 'get_current_time'],
  interact:   ['memory_search', 'memory_save', 'canvas_clear', 'get_current_time'],
  visualizer: ['memory_search', 'memory_save', 'web_fetch', 'canvas_clear', 'open_webapp', 'get_current_time'],
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Get skill objects for an agent.
 * @param {string} agentName — case-insensitive agent name
 * @returns {Array<Object>} skill objects
 */
export function getSkillsForAgent(agentName) {
  const key = agentName.toLowerCase();
  const skillIds = AGENT_SKILLS[key];
  if (!skillIds) return [];
  return skillIds.map(id => SKILL_MAP.get(id)).filter(Boolean);
}

/**
 * Get the combined skill prompt text for an agent.
 * This is appended to the agent's system prompt.
 * @param {string} agentName
 * @returns {string} combined prompt text (may be empty)
 */
export function getSkillPrompt(agentName) {
  const skills = getSkillsForAgent(agentName);
  if (skills.length === 0) return '';
  return '\n\n' + skills.map(s => s.prompt).join('\n\n');
}

/**
 * Get the tool whitelist for an agent.
 * @param {string} agentName
 * @returns {string[]|null} array of allowed tool names, or null for unrestricted
 */
export function getToolsForAgent(agentName) {
  const key = agentName.toLowerCase();
  if (!(key in AGENT_TOOLS)) return null; // unknown agent = all tools
  return AGENT_TOOLS[key]; // null means all tools
}

/**
 * Get a skill by its id.
 * @param {string} skillId
 * @returns {Object|undefined}
 */
export function getSkill(skillId) {
  return SKILL_MAP.get(skillId);
}

/**
 * List all available skills with metadata (no prompt text — for UI display).
 * @returns {Array<{ id, name, description, category, source, version }>}
 */
export function listSkills() {
  return ALL_SKILLS.map(({ id, name, description, category, source, version }) => ({
    id, name, description, category, source, version,
  }));
}
