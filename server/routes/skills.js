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
    try {
      const skill = getSkill(req.params.id);
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
    try {
      const agentName = req.params.name;
      const skills = getSkillsForAgent(agentName).map(s => ({
        id: s.id, name: s.name, description: s.description, category: s.category,
      }));
      const tools = getToolsForAgent(agentName);
      res.json({
        ok: true,
        data: {
          agent: agentName,
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
      if (!manifest || !manifest.id || !manifest.prompt) {
        return res.status(400).json({
          ok: false,
          error: 'Manifest must include at least: id, prompt',
        });
      }

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
