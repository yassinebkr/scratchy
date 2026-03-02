/**
 * Skills registry contract tests.
 *
 * Verifies agent → skill mapping, tool whitelists, and skill prompt generation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSkillsForAgent,
  getToolsForAgent,
  getSkillPrompt,
  listSkills,
  getSkill,
  ALL_SKILLS,
} from '../lib/skills/index.js';

describe('Skills Registry', () => {

  // ─── listSkills / ALL_SKILLS ────────────────────────────────────────────────
  describe('listSkills', () => {
    it('returns exactly 12 skills', () => {
      assert.equal(listSkills().length, 12);
    });

    it('ALL_SKILLS has 12 entries', () => {
      assert.equal(ALL_SKILLS.length, 12);
    });

    it('each skill has required metadata fields', () => {
      for (const skill of listSkills()) {
        assert.ok(skill.id, `skill missing id`);
        assert.ok(skill.name, `skill ${skill.id} missing name`);
        assert.ok(skill.description, `skill ${skill.id} missing description`);
      }
    });

    it('listSkills does not include prompt text (for UI display)', () => {
      for (const skill of listSkills()) {
        assert.equal(skill.prompt, undefined, `skill ${skill.id} should not expose prompt`);
      }
    });

    it('ALL_SKILLS entries have prompt text', () => {
      for (const skill of ALL_SKILLS) {
        assert.ok(skill.prompt, `skill ${skill.id} missing prompt`);
        assert.ok(skill.prompt.length > 0, `skill ${skill.id} has empty prompt`);
      }
    });
  });

  // ─── getSkillsForAgent ──────────────────────────────────────────────────────
  describe('getSkillsForAgent', () => {
    it('atlas has code-review skill', () => {
      const skills = getSkillsForAgent('atlas');
      assert.equal(skills.length, 1);
      assert.equal(skills[0].id, 'code-review');
    });

    it('iris has genui-mastery and css-architecture skills', () => {
      const skills = getSkillsForAgent('iris');
      assert.equal(skills.length, 2);
      const ids = skills.map(s => s.id);
      assert.ok(ids.includes('genui-mastery'));
      assert.ok(ids.includes('css-architecture'));
    });

    it('nova has research skill', () => {
      const skills = getSkillsForAgent('nova');
      assert.equal(skills.length, 1);
      assert.equal(skills[0].id, 'research');
    });

    it('echo has no skills (writer role)', () => {
      const skills = getSkillsForAgent('echo');
      assert.equal(skills.length, 0);
    });

    it('architect has spec-driven-dev and code-review', () => {
      const skills = getSkillsForAgent('architect');
      assert.equal(skills.length, 2);
      const ids = skills.map(s => s.id);
      assert.ok(ids.includes('spec-driven-dev'));
      assert.ok(ids.includes('code-review'));
    });

    it('qa has code-review and security-testing', () => {
      const skills = getSkillsForAgent('qa');
      assert.equal(skills.length, 2);
      const ids = skills.map(s => s.id);
      assert.ok(ids.includes('code-review'));
      assert.ok(ids.includes('security-testing'));
    });

    it('unknown agent returns empty array', () => {
      const skills = getSkillsForAgent('nonexistent_agent');
      assert.deepEqual(skills, []);
    });

    it('is case-insensitive', () => {
      const skills = getSkillsForAgent('Atlas');
      assert.equal(skills.length, 1);
      assert.equal(skills[0].id, 'code-review');
    });
  });

  // ─── getToolsForAgent ───────────────────────────────────────────────────────
  describe('getToolsForAgent', () => {
    it('atlas has null tools (unrestricted)', () => {
      assert.equal(getToolsForAgent('atlas'), null);
    });

    it('iris has null tools (unrestricted)', () => {
      assert.equal(getToolsForAgent('iris'), null);
    });

    it('nova has null tools (unrestricted)', () => {
      assert.equal(getToolsForAgent('nova'), null);
    });

    it('echo has null tools (unrestricted)', () => {
      assert.equal(getToolsForAgent('echo'), null);
    });

    it('backend dev agents have restricted tool lists', () => {
      for (const agent of ['architect', 'sys', 'api', 'data', 'scout', 'qa']) {
        const tools = getToolsForAgent(agent);
        assert.ok(Array.isArray(tools), `${agent} should have a tools array`);
        assert.ok(tools.length > 0, `${agent} should have at least one tool`);
        assert.ok(tools.includes('memory_search'), `${agent} should have memory_search`);
        assert.ok(tools.includes('memory_save'), `${agent} should have memory_save`);
      }
    });

    it('frontend agents have restricted tool lists', () => {
      for (const agent of ['director', 'component', 'layout', 'interact', 'visualizer']) {
        const tools = getToolsForAgent(agent);
        assert.ok(Array.isArray(tools), `${agent} should have a tools array`);
        assert.ok(tools.includes('canvas_clear'), `${agent} should have canvas_clear`);
      }
    });

    it('unknown agent returns null (all tools)', () => {
      assert.equal(getToolsForAgent('unknown_agent'), null);
    });

    it('scout has web_search and web_fetch tools', () => {
      const tools = getToolsForAgent('scout');
      assert.ok(tools.includes('web_search'));
      assert.ok(tools.includes('web_fetch'));
    });
  });

  // ─── getSkillPrompt ─────────────────────────────────────────────────────────
  describe('getSkillPrompt', () => {
    it('returns non-empty prompt for agents with skills', () => {
      for (const agent of ['atlas', 'iris', 'nova', 'architect', 'qa']) {
        const prompt = getSkillPrompt(agent);
        assert.ok(prompt.length > 0, `${agent} should have a non-empty skill prompt`);
      }
    });

    it('returns empty string for echo (no skills)', () => {
      assert.equal(getSkillPrompt('echo'), '');
    });

    it('returns empty string for unknown agent', () => {
      assert.equal(getSkillPrompt('nonexistent'), '');
    });

    it('prompt contains content from all assigned skills', () => {
      // architect has spec-driven-dev and code-review
      const prompt = getSkillPrompt('architect');
      const specSkill = getSkill('spec-driven-dev');
      const codeSkill = getSkill('code-review');
      assert.ok(prompt.includes(specSkill.prompt.slice(0, 50)));
      assert.ok(prompt.includes(codeSkill.prompt.slice(0, 50)));
    });
  });

  // ─── getSkill ───────────────────────────────────────────────────────────────
  describe('getSkill', () => {
    it('returns skill by id', () => {
      const skill = getSkill('code-review');
      assert.ok(skill);
      assert.equal(skill.id, 'code-review');
    });

    it('returns undefined for unknown skill id', () => {
      assert.equal(getSkill('nonexistent'), undefined);
    });
  });
});
