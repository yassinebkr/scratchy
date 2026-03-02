/**
 * @module server/routes/skills
 * API endpoints for the skills system.
 *
 * GET  /api/skills              — List all available skills (metadata only)
 * GET  /api/skills/:id          — Get a single skill's metadata
 * GET  /api/skills/agent/:name  — Get skills assigned to an agent
 * POST /api/skills/scan         — Scan a skill manifest for security issues
 */

import { listSkills, getSkill, getSkillsForAgent, getToolsForAgent } from '../../lib/skills/index.js';
import { scanSkill, formatReport } from '../../lib/skill-scanner.js';

/* ── Input-validation helpers ── */
const MAX_ID   = 200;
const MAX_NAME = 200;
const MAX_PROMPT = 50000;

/**
 * Register skills routes on the app.
 * @param {Object} app — Express-like app (or raw http router)
 * @param {Object} deps — { requireAuth }
 */
export function registerSkillRoutes(app, deps = {}) {
  const { requireAuth } = deps;

  /**
   * GET /api/skills — List all registered skills
   * Returns metadata only (no prompt text — that's internal).
   */
  app.get('/api/skills', (req, res) => {
    try {
      const skills = listSkills();
      res.json({ ok: true, data: skills });
    } catch (err) {
      console.error('[skills-api] List failed:', err.message);
      res.status(500).json({ ok: false, error: 'Failed to list skills' });
    }
  });

  /**
   * GET /api/skills/:id — Get a single skill's metadata
   */
  app.get('/api/skills/:id', (req, res) => {
    const skillId = req.params.id;
    if (typeof skillId !== 'string' || !skillId.trim() || skillId.length > MAX_ID) {
      return res.status(400).json({ ok: false, error: 'Invalid skill ID' });
    }

    try {
      const skill = getSkill(skillId.trim());
      if (!skill) {
        return res.status(404).json({ ok: false, error: 'Skill not found' });
      }
      // Return metadata without the full prompt (security)
      const { id, name, description, category, source, version } = skill;
      res.json({ ok: true, data: { id, name, description, category, source, version } });
    } catch (err) {
      console.error('[skills-api] Get failed:', err.message);
      res.status(500).json({ ok: false, error: 'Failed to get skill' });
    }
  });

  /**
   * GET /api/skills/agent/:name — Get skills + tools for an agent
   */
  app.get('/api/skills/agent/:name', (req, res) => {
    const agentName = req.params.name;
    if (typeof agentName !== 'string' || !agentName.trim() || agentName.length > MAX_NAME) {
      return res.status(400).json({ ok: false, error: 'Invalid agent name' });
    }

    try {
      const name = agentName.trim();
      const skills = getSkillsForAgent(name).map(s => ({
        id: s.id, name: s.name, description: s.description, category: s.category,
      }));
      const tools = getToolsForAgent(name);
      res.json({
        ok: true,
        data: {
          agent: name,
          skills,
          tools: tools || 'unrestricted',
          skillCount: skills.length,
        },
      });
    } catch (err) {
      console.error('[skills-api] Agent skills failed:', err.message);
      res.status(500).json({ ok: false, error: 'Failed to get agent skills' });
    }
  });

  /**
   * POST /api/skills/scan — Scan a skill manifest for security issues
   * Body: { id, name, prompt, tools[], source, expectedHash? }
   * Returns: scan report with risk level and findings
   */
  app.post('/api/skills/scan', (req, res) => {
    try {
      const manifest = req.body;
      if (!manifest || typeof manifest !== 'object') {
        return res.status(400).json({ ok: false, error: 'Request body must be a JSON object' });
      }
      if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
        return res.status(400).json({ ok: false, error: 'id is required and must be a non-empty string' });
      }
      if (typeof manifest.prompt !== 'string' || !manifest.prompt.trim()) {
        return res.status(400).json({ ok: false, error: 'prompt is required and must be a non-empty string' });
      }
      if (manifest.tools != null && !Array.isArray(manifest.tools)) {
        return res.status(400).json({ ok: false, error: 'tools must be an array if provided' });
      }

      // Sanitize lengths
      manifest.id = manifest.id.trim().slice(0, MAX_ID);
      manifest.prompt = manifest.prompt.trim().slice(0, MAX_PROMPT);
      if (manifest.name != null) manifest.name = String(manifest.name).trim().slice(0, MAX_NAME);
      if (manifest.source != null) manifest.source = String(manifest.source).trim().slice(0, MAX_NAME);

      const report = scanSkill(manifest);
      const formatted = formatReport(report);

      res.json({
        ok: true,
        data: {
          ...report,
          formattedReport: formatted,
        },
      });
    } catch (err) {
      console.error('[skills-api] Scan failed:', err.message);
      res.status(500).json({ ok: false, error: 'Skill scan failed' });
    }
  });
}
