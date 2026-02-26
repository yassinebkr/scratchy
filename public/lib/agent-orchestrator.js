/**
 * Scratchy v2 — Agent Orchestrator
 * Smart intent classification and agent routing with TF-IDF-like scoring.
 * @module agent-orchestrator
 */

/* ------------------------------------------------------------------ */
/*  Category Definitions & Keyword Weights                            */
/* ------------------------------------------------------------------ */

/**
 * @typedef {'code'|'research'|'memory'|'creative'|'system'|'general'} IntentCategory
 */

/**
 * @typedef {Object} IntentResult
 * @property {IntentCategory} category
 * @property {number} confidence — 0..1
 * @property {string[]} keywords — matched keywords
 */

/**
 * @typedef {Object} RouteResult
 * @property {string} agentId — target agent identifier
 * @property {IntentCategory} category
 * @property {number} confidence
 * @property {string} contextSnippet — condensed context for handoff
 */

/**
 * Keyword definition with weight tiers:
 *   exact  — full word/phrase match (highest weight)
 *   partial — substring / partial match
 *   context — nearby context boosts score
 */
const CATEGORY_KEYWORDS = {
  code: {
    exact: [
      'function', 'variable', 'class', 'module', 'import', 'export',
      'async', 'await', 'const', 'let', 'return', 'console',
      'deploy', 'build', 'compile', 'lint', 'test', 'debug',
      'git', 'commit', 'push', 'pull', 'merge', 'branch', 'rebase',
      'npm', 'node', 'typescript', 'javascript', 'python', 'rust',
      'api', 'endpoint', 'server', 'database', 'query', 'schema',
      'bug', 'error', 'exception', 'stack trace', 'segfault',
      'refactor', 'optimize', 'terminal', 'cli', 'ssh',
    ],
    partial: [
      '.js', '.ts', '.py', '.rs', '.go', '.css', '.html', '.json',
      '.env', '.yml', '.yaml', '.toml', '.md',
      'src/', 'lib/', 'dist/', 'node_modules',
      'http://', 'localhost', '127.0.0.1',
      'stderr', 'stdout', 'argv',
    ],
    context: ['file', 'code', 'script', 'program', 'repo', 'repository', 'package'],
  },

  research: {
    exact: [
      'search', 'find', 'look up', 'lookup', 'google',
      'what is', 'what are', 'who is', 'who are',
      'how does', 'how do', 'how to', 'why does', 'why do',
      'explain', 'define', 'definition', 'meaning',
      'compare', 'comparison', 'versus', 'vs',
      'source', 'reference', 'citation', 'article', 'paper',
      'wikipedia', 'documentation', 'docs',
    ],
    partial: [
      'https://', 'http://', 'www.',
      '.com', '.org', '.edu', '.io',
    ],
    context: ['info', 'information', 'learn', 'understand', 'research', 'study'],
  },

  memory: {
    exact: [
      'remember', 'recall', 'forgot', 'forget',
      'last time', 'previously', 'before', 'earlier',
      'what did we', 'what did i', 'what was',
      'history', 'conversation', 'context',
      'you said', 'i said', 'we discussed', 'we talked',
      'save this', 'note this', 'bookmark',
    ],
    partial: ['yesterday', 'last week', 'last month', 'ago'],
    context: ['memory', 'past', 'previous', 'prior', 'old'],
  },

  creative: {
    exact: [
      'write', 'draft', 'compose', 'author',
      'story', 'poem', 'essay', 'blog', 'article',
      'design', 'brainstorm', 'ideate', 'imagine',
      'create', 'generate', 'invent',
      'rewrite', 'rephrase', 'paraphrase', 'summarize',
      'outline', 'structure', 'format',
      'tone', 'voice', 'style',
      'fiction', 'narrative', 'dialogue',
      'slogan', 'tagline', 'headline', 'caption',
    ],
    partial: [],
    context: ['creative', 'writing', 'content', 'copy', 'text', 'prose'],
  },

  system: {
    exact: [
      'config', 'configure', 'configuration', 'settings', 'preferences',
      'admin', 'administrator', 'dashboard',
      'user', 'users', 'account', 'accounts', 'profile',
      'billing', 'subscription', 'plan', 'payment', 'invoice',
      'permission', 'permissions', 'role', 'roles', 'access',
      'quota', 'limit', 'rate limit',
      'enable', 'disable', 'toggle',
      'plugin', 'plugins', 'integration', 'webhook',
    ],
    partial: [],
    context: ['system', 'manage', 'setup', 'install', 'update', 'upgrade'],
  },
};

/** Weight multipliers for match tiers */
const WEIGHTS = { exact: 3.0, partial: 1.5, context: 0.8 };

/** IDF-like rarity boost: keywords in fewer categories score higher */
const _idfCache = new Map();

/**
 * Compute IDF-like score for a keyword across all categories.
 * @param {string} keyword
 * @returns {number}
 */
function _idf(keyword) {
  if (_idfCache.has(keyword)) return _idfCache.get(keyword);

  const kw = keyword.toLowerCase();
  let categoryCount = 0;
  const totalCategories = Object.keys(CATEGORY_KEYWORDS).length;

  for (const cat of Object.values(CATEGORY_KEYWORDS)) {
    const all = [...cat.exact, ...cat.partial, ...cat.context];
    if (all.some((w) => w.toLowerCase() === kw || kw.includes(w.toLowerCase()))) {
      categoryCount++;
    }
  }

  // IDF: log(total / (1 + count))
  const score = Math.log((totalCategories + 1) / (1 + categoryCount)) + 1;
  _idfCache.set(keyword, score);
  return score;
}

/* ------------------------------------------------------------------ */
/*  AgentOrchestrator                                                 */
/* ------------------------------------------------------------------ */

class AgentOrchestrator {
  constructor() {
    /** @type {Record<IntentCategory, string>} */
    this._routes = {
      code: 'agent-default',
      research: 'agent-default',
      memory: 'agent-default',
      creative: 'agent-default',
      system: 'agent-default',
      general: 'agent-default',
    };

    /** @type {Array<{ category: IntentCategory, confidence: number, agentId: string, ts: number }>} */
    this._history = [];

    /** @type {Array<{ role: string, content: string, ts: number }>} */
    this._messageLog = [];

    /** @type {Object|null} */
    this._activeSurface = null;

    /** @type {Set<string>} — agents currently marked unavailable */
    this._unavailableAgents = new Set();
  }

  /* ------------------------------------------------------------------ */
  /*  Configuration                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Set routing table mapping categories to agent IDs.
   * @param {Partial<Record<IntentCategory, string>>} routes
   */
  setRoutes(routes) {
    Object.assign(this._routes, routes);
  }

  /**
   * Get current routing table.
   * @returns {Record<IntentCategory, string>}
   */
  getRoutes() {
    return { ...this._routes };
  }

  /**
   * Set availability of an agent at runtime.
   * Unavailable agents are skipped during routing (falls back to general).
   * @param {string} agentId — agent identifier
   * @param {boolean} available — whether the agent is available
   */
  setAgentAvailability(agentId, available) {
    if (available) {
      this._unavailableAgents.delete(agentId);
    } else {
      this._unavailableAgents.add(agentId);
    }
  }

  /**
   * Check if an agent is currently available.
   * @param {string} agentId
   * @returns {boolean}
   */
  isAgentAvailable(agentId) {
    return !this._unavailableAgents.has(agentId);
  }

  /**
   * Update the active surface state for context handoff.
   * @param {Object|null} surface — current surface state
   */
  setSurfaceState(surface) {
    this._activeSurface = surface;
  }

  /* ------------------------------------------------------------------ */
  /*  Intent Classification                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Classify the intent of a message.
   * @param {string} message — user message text
   * @returns {IntentResult}
   */
  classifyIntent(message) {
    if (!message || typeof message !== 'string') {
      return { category: 'general', confidence: 0.1, keywords: [] };
    }

    const text = message.toLowerCase().trim();
    const words = text.split(/\s+/);

    /** @type {Record<string, { score: number, matches: string[] }>} */
    const scores = {};

    for (const [category, kwSets] of Object.entries(CATEGORY_KEYWORDS)) {
      let totalScore = 0;
      const matches = [];

      // Exact matches (full phrase in text)
      for (const kw of kwSets.exact) {
        const kwLower = kw.toLowerCase();
        if (text.includes(kwLower)) {
          // Bonus for word-boundary match
          const isWordBound = words.includes(kwLower) ||
            text.includes(` ${kwLower} `) ||
            text.startsWith(`${kwLower} `) ||
            text.endsWith(` ${kwLower}`);

          const weight = isWordBound ? WEIGHTS.exact : WEIGHTS.exact * 0.75;
          totalScore += weight * _idf(kw);
          matches.push(kw);
        }
      }

      // Partial matches (substring)
      for (const kw of kwSets.partial) {
        if (text.includes(kw.toLowerCase())) {
          totalScore += WEIGHTS.partial * _idf(kw);
          matches.push(kw);
        }
      }

      // Context matches
      for (const kw of kwSets.context) {
        if (text.includes(kw.toLowerCase())) {
          totalScore += WEIGHTS.context * _idf(kw);
          matches.push(kw);
        }
      }

      scores[category] = { score: totalScore, matches };
    }

    // Find winner
    let bestCat = 'general';
    let bestScore = 0;
    let bestMatches = [];

    for (const [cat, { score, matches }] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
        bestMatches = matches;
      }
    }

    // Normalize confidence to 0..1 using sigmoid-like curve
    // Score of ~10 → confidence ~0.8, score of ~20 → ~0.95
    const confidence = bestScore > 0
      ? Math.min(0.99, 1 - 1 / (1 + bestScore / 5))
      : 0.1;

    // Fallback to 'general' if confidence is below threshold
    const finalCategory = confidence < 0.15 ? 'general' : bestCat;

    return {
      category: /** @type {IntentCategory} */ (finalCategory),
      confidence: Math.round(confidence * 100) / 100,
      keywords: [...new Set(bestMatches)],
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Message Routing                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Route a message to the appropriate agent.
   * @param {string} message — user message
   * @param {{ messages?: Array<{ role: string, content: string }>, surface?: Object }} [context]
   * @returns {RouteResult}
   */
  routeMessage(message, context = {}) {
    const intent = this.classifyIntent(message);

    // Log the message for context building
    this._messageLog.push({
      role: 'user',
      content: message,
      ts: Date.now(),
    });
    // Keep last 50 messages
    if (this._messageLog.length > 50) {
      this._messageLog = this._messageLog.slice(-50);
    }

    if (context.surface) {
      this._activeSurface = context.surface;
    }

    let agentId = this._routes[intent.category] || this._routes.general;

    // If the target agent is unavailable, fall back to general
    if (this._unavailableAgents.has(agentId)) {
      agentId = this._routes.general;
    }

    // Build context snippet for handoff
    const contextSnippet = this._buildContextSnippet(intent.category, context);

    // Record in history
    this._history.push({
      category: intent.category,
      confidence: intent.confidence,
      agentId,
      ts: Date.now(),
    });

    // Keep history bounded
    if (this._history.length > 200) {
      this._history = this._history.slice(-200);
    }

    return {
      agentId,
      category: intent.category,
      confidence: intent.confidence,
      contextSnippet,
    };
  }

  /**
   * Build a condensed context snippet for agent handoff.
   * Extracts last 3 relevant messages + active surface state.
   * @private
   * @param {IntentCategory} category
   * @param {Object} context
   * @returns {string}
   */
  _buildContextSnippet(category, context = {}) {
    const parts = [];

    // Last 3 relevant messages from the log
    const relevantMessages = (context.messages || this._messageLog)
      .slice(-10)
      .filter((m) => {
        if (!m.content) return false;
        // Quick relevance check — does the message relate to the same category?
        const quickIntent = this.classifyIntent(m.content);
        return quickIntent.category === category || quickIntent.confidence < 0.3;
      })
      .slice(-3);

    if (relevantMessages.length) {
      parts.push('Recent context:');
      for (const m of relevantMessages) {
        const prefix = m.role === 'user' ? 'User' : 'Assistant';
        const snippet = m.content.length > 120
          ? m.content.slice(0, 120) + '…'
          : m.content;
        parts.push(`  [${prefix}] ${snippet}`);
      }
    }

    // Active surface
    const surface = context.surface || this._activeSurface;
    if (surface) {
      parts.push(`Active surface: ${surface.type || 'unknown'}${surface.id ? ` (${surface.id})` : ''}`);
    }

    return parts.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /*  Statistics                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Get routing statistics.
   * @returns {{ perCategory: Record<string, { count: number, avgConfidence: number }>, mostUsedAgent: string, totalRouted: number }}
   */
  getRoutingStats() {
    /** @type {Record<string, { count: number, totalConf: number }>} */
    const cats = {};
    /** @type {Record<string, number>} */
    const agentCounts = {};

    for (const entry of this._history) {
      if (!cats[entry.category]) {
        cats[entry.category] = { count: 0, totalConf: 0 };
      }
      cats[entry.category].count++;
      cats[entry.category].totalConf += entry.confidence;

      agentCounts[entry.agentId] = (agentCounts[entry.agentId] || 0) + 1;
    }

    /** @type {Record<string, { count: number, avgConfidence: number }>} */
    const perCategory = {};
    for (const [cat, data] of Object.entries(cats)) {
      perCategory[cat] = {
        count: data.count,
        avgConfidence: Math.round((data.totalConf / data.count) * 100) / 100,
      };
    }

    // Most used agent
    let mostUsedAgent = 'none';
    let maxCount = 0;
    for (const [agent, count] of Object.entries(agentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostUsedAgent = agent;
      }
    }

    return {
      perCategory,
      mostUsedAgent,
      totalRouted: this._history.length,
    };
  }

  /**
   * Clear routing history and message log.
   */
  reset() {
    this._history = [];
    this._messageLog = [];
    this._activeSurface = null;
  }
}

export { AgentOrchestrator };
export default AgentOrchestrator;
