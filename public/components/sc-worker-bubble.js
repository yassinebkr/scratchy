/**
 * sc-worker-bubble.js — Floating worker status bubble component
 * Shows team worker status as a Messenger-style chat head bubble.
 * State persists to sessionStorage to survive page navigation.
 */

const STORAGE_KEY = 'worker-bubble-state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

class ScWorkerBubble extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._workers = new Map();
    this._expanded = false;
    this._allComplete = false;
    this._autoCollapseTimer = null;
    this._planning = false;
    this._planTasks = [];
    this._previewUrls = [];
    this._dragState = null;
    this._customPos = null;
    this._timeUpdateInterval = null;
    this._render();
    this._bindEvents();
  }

  connectedCallback() {
    this._hide();
    // Restore from sessionStorage if available + fresh
    this._restoreState();
    // Update relative timestamps every 5s
    this._timeUpdateInterval = setInterval(() => this._updateTimestamps(), 5000);
  }

  disconnectedCallback() {
    if (this._autoCollapseTimer) clearTimeout(this._autoCollapseTimer);
    if (this._timeUpdateInterval) clearInterval(this._timeUpdateInterval);
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }

  // ── Persistence ─────────────────────────────────────────────

  _saveState() {
    try {
      const data = {
        ts: Date.now(),
        planning: this._planning,
        planTasks: this._planTasks,
        allComplete: this._allComplete,
        previewUrls: this._previewUrls,
        workers: [],
      };
      for (const [name, w] of this._workers) {
        data.workers.push({
          name: w.name,
          task: w.task,
          color: w.color,
          status: w.status,
          error: w.error,
          activities: w.activities.slice(-20), // keep last 20
          _thinkingText: w._thinkingText || '',
        });
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded or private mode — ignore */ }
  }

  _restoreState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Discard stale state (> TTL)
      if (Date.now() - data.ts > STATE_TTL_MS) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      // Don't restore if there's nothing to show
      if (!data.workers || data.workers.length === 0) return;

      this._planning = data.planning || false;
      this._planTasks = data.planTasks || [];
      this._allComplete = data.allComplete || false;
      this._previewUrls = data.previewUrls || [];

      for (const w of data.workers) {
        this._workers.set(w.name, {
          name: w.name,
          task: w.task || '',
          color: w.color || '#f59e0b',
          status: w.status || 'running',
          error: w.error || null,
          output: '',
          activities: w.activities || [],
          _parseBuffer: '',
          _insideToolCall: false,
          _thinkingText: w._thinkingText || '',
        });
      }

      this._show();
      this._update();
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  _clearSavedState() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // ── Public API ──────────────────────────────────────────────

  addWorker(agentName, task, color) {
    this._planning = false;
    this._allComplete = false;
    this._previewUrls = [];
    if (this._autoCollapseTimer) {
      clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = null;
    }
    this._workers.set(agentName, {
      name: agentName,
      task: task || '',
      color: color || '#f59e0b',
      status: 'running', // running | success | error
      error: null,
      output: '',
      activities: [],
      _parseBuffer: '',
      _insideToolCall: false,
      _thinkingText: '',
    });
    this._show();
    this._update();
    this._saveState();
  }

  completeWorker(agentName, success = true, error = null) {
    const w = this._workers.get(agentName);
    if (!w) return;
    w.status = success ? 'success' : 'error';
    w.error = error || null;
    this._update();
    this._checkAllComplete();
    this._saveState();
  }

  appendOutput(agentName, delta) {
    const w = this._workers.get(agentName);
    if (!w) return;
    w.output += delta;
    this._parseStream(w, delta);
  }

  /** Store preview URLs for completed work — shown as button in bubble footer */
  setPreviewUrls(urls) {
    if (!urls || !Array.isArray(urls) || urls.length === 0) return;
    this._previewUrls = urls;
    this._update();
    this._saveState();
  }

  // ── Stream parsing ──────────────────────────────────────────

  _parseStream(w, delta) {
    w._parseBuffer += delta;
    let changed = false;

    // Process buffer for complete tool_call blocks
    while (true) {
      if (!w._insideToolCall) {
        const startIdx = w._parseBuffer.indexOf('<tool_call>');
        if (startIdx === -1) {
          // No tool_call tag — extract model thinking as status
          // Keep trailing chars that could be start of '<tool_call>' or '<tool_result>'
          const keepFrom = w._parseBuffer.lastIndexOf('<');
          let textBefore = '';
          if (keepFrom > 0 && keepFrom > w._parseBuffer.length - 15) {
            textBefore = w._parseBuffer.slice(0, keepFrom);
            w._parseBuffer = w._parseBuffer.slice(keepFrom);
          } else if (keepFrom === -1) {
            textBefore = w._parseBuffer;
            w._parseBuffer = '';
          }
          // Show meaningful model thinking (skip tool_result blocks and short noise)
          if (textBefore) {
            const clean = textBefore
              .replace(/<tool_result>[\s\S]*?<\/tool_result>/g, '')
              .replace(/<[^>]+>/g, '')
              .trim();
            // Only show lines that look like meaningful thinking (>15 chars, not just whitespace/punctuation)
            if (clean.length > 15 && /[a-zA-Z]{3,}/.test(clean)) {
              const short = clean.length > 80 ? clean.slice(0, 77) + '…' : clean;
              // Update the worker's status text (last thinking line)
              w._thinkingText = short;
              changed = true;
            }
          }
          break;
        }
        // Extract thinking text before the tag
        if (startIdx > 0) {
          const thinking = w._parseBuffer.slice(0, startIdx)
            .replace(/<tool_result>[\s\S]*?<\/tool_result>/g, '')
            .replace(/<[^>]+>/g, '')
            .trim();
          if (thinking.length > 15 && /[a-zA-Z]{3,}/.test(thinking)) {
            w._thinkingText = thinking.length > 80 ? thinking.slice(0, 77) + '…' : thinking;
            changed = true;
          }
        }
        w._parseBuffer = w._parseBuffer.slice(startIdx);
        w._insideToolCall = true;
      }

      // Inside a tool_call — look for closing tag
      const endTag = '</tool_call>';
      const endIdx = w._parseBuffer.indexOf(endTag);
      if (endIdx === -1) {
        // Incomplete — wait for more data
        break;
      }

      // Extract the complete block
      const block = w._parseBuffer.slice('<tool_call>'.length, endIdx);
      w._parseBuffer = w._parseBuffer.slice(endIdx + endTag.length);
      w._insideToolCall = false;

      // Parse the JSON inside
      const activity = this._parseToolCall(block);
      if (activity) {
        w.activities.push(activity);
        changed = true;
      }
    }

    if (changed) {
      this._updateActivitiesUI(w);
      this._updateFooter();
      // Throttled save during streaming (max once per 2s)
      this._throttledSave();
    }
  }

  _throttledSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._saveState();
    }, 2000);
  }

  _parseToolCall(raw) {
    // The content should be JSON like {"name":"file_write","arguments":{"path":"index.html",...}}
    // It may have leading/trailing whitespace or be slightly malformed
    const trimmed = raw.trim();
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Try to extract JSON from the raw text
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return { icon: '🔧', text: 'Tool call', time: Date.now() };
        }
      } else {
        return { icon: '🔧', text: 'Tool call', time: Date.now() };
      }
    }

    const name = parsed.name || '';
    let args = parsed.arguments || parsed.params || {};
    // NullClaw sometimes sends arguments as a JSON string
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = {}; }
    }

    // Map tool names to human-readable activities
    if (name === 'file_write' || name === 'write_file' || name === 'create_file') {
      const path = args.path || args.file_path || 'file';
      const short = path.split('/').pop();
      return { icon: '📄', text: `Created ${short}`, time: Date.now() };
    }
    if (name === 'file_edit' || name === 'edit_file' || name === 'str_replace_editor' || name === 'replace_in_file') {
      const path = args.path || args.file_path || 'file';
      const short = path.split('/').pop();
      return { icon: '✏️', text: `Edited ${short}`, time: Date.now() };
    }
    if (name === 'file_read' || name === 'read_file') {
      const path = args.path || args.file_path || 'file';
      const short = path.split('/').pop();
      return { icon: '📖', text: `Reading ${short}`, time: Date.now() };
    }
    if (name === 'shell' || name === 'execute_command' || name === 'run_command' || name === 'bash' || name === 'terminal') {
      const cmd = args.command || args.cmd || 'command';
      const shortCmd = cmd.length > 40 ? cmd.slice(0, 37) + '…' : cmd;
      return { icon: '⚙️', text: `Running: ${shortCmd}`, time: Date.now() };
    }
    if (name.startsWith('mcp_canvas') || name.includes('canvas')) {
      return { icon: '🎨', text: 'Rendering canvas component', time: Date.now() };
    }
    if (name === 'list_files' || name === 'list_dir') {
      const path = args.path || args.directory || '.';
      const short = path.split('/').pop() || path;
      return { icon: '📂', text: `Listing ${short}`, time: Date.now() };
    }
    if (name === 'search' || name === 'grep' || name === 'search_files') {
      const query = args.query || args.pattern || args.regex || '';
      const shortQ = query.length > 30 ? query.slice(0, 27) + '…' : query;
      return { icon: '🔍', text: `Searching: ${shortQ}`, time: Date.now() };
    }
    if (name === 'delete_file' || name === 'remove_file') {
      const path = args.path || args.file_path || 'file';
      const short = path.split('/').pop();
      return { icon: '🗑️', text: `Deleted ${short}`, time: Date.now() };
    }

    // Fallback for unknown tools
    const displayName = name.replace(/_/g, ' ').replace(/^mcp\s+/, '');
    return { icon: '🔧', text: displayName || 'Tool call', time: Date.now() };
  }

  _relativeTime(ts) {
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  _updateTimestamps() {
    const items = this.shadowRoot.querySelectorAll('.activity-time[data-ts]');
    items.forEach(el => {
      const ts = parseInt(el.getAttribute('data-ts'), 10);
      if (ts) el.textContent = this._relativeTime(ts);
    });
  }

  _updateActivitiesUI(w) {
    const container = this.shadowRoot.querySelector(`.worker-activities[data-agent="${CSS.escape(w.name)}"]`);
    if (!container || container.style.display === 'none') return;
    this._renderActivities(container, w);
  }

  _renderActivities(container, w) {
    container.innerHTML = '';
    const activities = w.activities;
    // Show last 20 activities
    const visible = activities.slice(-20);
    for (const act of visible) {
      const item = document.createElement('div');
      item.className = 'activity-item';
      const isLatest = act === activities[activities.length - 1] && w.status === 'running';
      if (isLatest) item.classList.add('spinning');

      const timeSpan = document.createElement('span');
      timeSpan.className = 'activity-time';
      timeSpan.setAttribute('data-ts', act.time);
      timeSpan.textContent = this._relativeTime(act.time);

      item.textContent = `${act.icon} ${act.text}`;
      item.appendChild(document.createTextNode(' '));
      item.appendChild(timeSpan);
      container.appendChild(item);
    }
    // Show current thinking text if worker is still running
    if (w._thinkingText && w.status === 'running') {
      const thinking = document.createElement('div');
      thinking.className = 'activity-item thinking';
      thinking.textContent = `💭 ${w._thinkingText}`;
      container.appendChild(thinking);
    }
    container.scrollTop = container.scrollHeight;
  }

  _getFileCount() {
    const files = new Set();
    for (const [, w] of this._workers) {
      for (const act of w.activities) {
        if (act.icon === '📄' || act.icon === '✏️') {
          // Extract filename from "Created foo.js" or "Edited bar.css"
          const parts = act.text.split(' ');
          if (parts.length >= 2) files.add(parts.slice(1).join(' '));
        }
      }
    }
    return files.size;
  }

  _updateFooter() {
    const footer = this.shadowRoot.getElementById('footer');
    if (!footer) return;
    const { total, complete } = this._getStats();
    const fileCount = this._getFileCount();
    footer.innerHTML = '';
    if (total > 0) {
      let text = `${complete} of ${total} complete`;
      if (fileCount > 0) text += ` · ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
      const span = document.createElement('span');
      span.textContent = text;
      footer.appendChild(span);
    }
    // Show preview button when all done + preview URLs available
    if (this._allComplete && this._previewUrls.length > 0) {
      for (const url of this._previewUrls) {
        const btn = document.createElement('button');
        btn.className = 'preview-btn';
        btn.textContent = '👁️ Open Preview';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Dispatch tile-action so existing handler opens the webapp surface
          document.dispatchEvent(new CustomEvent('tile-action', {
            detail: { action: `open-preview:${url}` },
          }));
        });
        footer.appendChild(btn);
      }
    }
  }

  reset() {
    this._workers.clear();
    this._expanded = false;
    this._allComplete = false;
    this._planning = false;
    this._planTasks = [];
    this._previewUrls = [];
    if (this._autoCollapseTimer) {
      clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = null;
    }
    this._hide();
    this._update();
    this._updateFooter();
    this._clearSavedState();
  }

  showPlan(tasks) {
    this._planning = true;
    this._planTasks = tasks || [];
    this._allComplete = false;
    this._previewUrls = [];
    this._workers.clear();
    this._show();
    this._update();
    this._saveState();
  }

  // ── Internal ────────────────────────────────────────────────

  _show() {
    const container = this.shadowRoot.getElementById('container');
    container.classList.add('visible');
    container.classList.remove('hidden');
  }

  _hide() {
    const container = this.shadowRoot.getElementById('container');
    container.classList.remove('visible');
    container.classList.add('hidden');
  }

  _toggle() {
    this._expanded = !this._expanded;
    this._update();
  }

  _collapse() {
    this._expanded = false;
    this._update();
  }

  _checkAllComplete() {
    if (this._workers.size === 0) return;
    const all = [...this._workers.values()];
    const done = all.every(w => w.status !== 'running');
    if (done && !this._allComplete) {
      this._allComplete = true;
      // Expand to show completion status (+ preview button when available)
      this._expanded = true;
      this._update();
      // Pulse the badge
      const badge = this.shadowRoot.getElementById('badge');
      if (badge) {
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 600);
      }
      // Auto-collapse after 8s (longer to give time to see results)
      // But only if no preview URLs — if previews exist, stay open
      if (this._previewUrls.length === 0) {
        this._autoCollapseTimer = setTimeout(() => {
          this._expanded = false;
          this._update();
          this._autoCollapseTimer = null;
        }, 8000);
      }
    }
  }

  _getStats() {
    const all = [...this._workers.values()];
    const total = all.length;
    const complete = all.filter(w => w.status !== 'running').length;
    const hasError = all.some(w => w.status === 'error');
    return { total, complete, hasError };
  }

  _update() {
    const bubble = this.shadowRoot.getElementById('bubble');
    const panel = this.shadowRoot.getElementById('panel');
    const badge = this.shadowRoot.getElementById('badge');
    const spinner = this.shadowRoot.getElementById('spinner');
    const workerList = this.shadowRoot.getElementById('worker-list');
    const footer = this.shadowRoot.getElementById('footer');
    const planView = this.shadowRoot.getElementById('plan-view');

    // Planning state
    if (this._planning) {
      badge.textContent = '📋';
      spinner.classList.add('active');
      bubble.classList.remove('complete', 'has-error');
      bubble.classList.add('planning');
      if (this._expanded) {
        panel.classList.add('open');
        planView.style.display = 'block';
        workerList.style.display = 'none';
        footer.style.display = 'none';
        planView.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'plan-title';
        title.textContent = 'Planning…';
        planView.appendChild(title);
        this._planTasks.forEach(t => {
          const row = document.createElement('div');
          row.className = 'plan-row';
          row.innerHTML = `<span class="plan-dot" style="background:${this._escAttr(t.color || '#f59e0b')}"></span>
            <span class="plan-agent">${this._esc(t.agent)}</span>
            <span class="plan-task">${this._esc(t.task)}</span>`;
          planView.appendChild(row);
        });
      } else {
        panel.classList.remove('open');
      }
      return;
    }

    bubble.classList.remove('planning');
    planView.style.display = 'none';
    workerList.style.display = 'block';

    const { total, complete, hasError } = this._getStats();

    // Badge content
    if (this._allComplete) {
      badge.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${hasError ? '#ef4444' : '#22c55e'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      spinner.classList.remove('active');
      bubble.classList.add('complete');
      if (hasError) bubble.classList.add('has-error');
      else bubble.classList.remove('has-error');
    } else {
      badge.textContent = total > 0 ? String(total) : '';
      spinner.classList.toggle('active', total > 0);
      bubble.classList.remove('complete', 'has-error');
    }

    // Panel
    if (this._expanded) {
      panel.classList.add('open');
      footer.style.display = 'block';
    } else {
      panel.classList.remove('open');
      footer.style.display = 'none';
    }

    // Worker list
    workerList.innerHTML = '';
    for (const [name, w] of this._workers) {
      const card = document.createElement('div');
      card.className = 'worker-card';
      card.setAttribute('data-agent', name);

      const statusIcon = w.status === 'running'
        ? '<span class="worker-spinner"></span>'
        : w.status === 'success'
          ? `<svg class="worker-icon ok" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
          : `<svg class="worker-icon err" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

      const activityCount = w.activities.length;
      const activityBadge = activityCount > 0
        ? `<span class="worker-activity-count">${activityCount} action${activityCount !== 1 ? 's' : ''}</span>`
        : '';

      card.innerHTML = `
        <div class="worker-header">
          <span class="worker-dot" style="background:${this._escAttr(w.color)}"></span>
          <span class="worker-name">${this._esc(w.name)}</span>
          ${activityBadge}
          ${statusIcon}
        </div>
        <div class="worker-task">${this._esc(w.task)}</div>
        ${w.error ? `<div class="worker-error">${this._esc(w.error)}</div>` : ''}
        <div class="worker-activities" data-agent="${this._escAttr(name)}" style="display:none"></div>
      `;

      // Click to toggle activities
      card.addEventListener('click', () => {
        const acts = card.querySelector('.worker-activities');
        if (!acts) return;
        const showing = acts.style.display !== 'none';
        acts.style.display = showing ? 'none' : 'block';
        if (!showing) {
          const currentW = this._workers.get(name);
          if (currentW) this._renderActivities(acts, currentW);
        }
      });

      workerList.appendChild(card);
    }

    // Footer (delegates to _updateFooter for preview button logic)
    this._updateFooter();
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _bindEvents() {
    const bubble = this.shadowRoot.getElementById('bubble');
    const closeBtn = this.shadowRoot.getElementById('close-btn');

    bubble.addEventListener('click', (e) => {
      // Don't toggle if we just finished dragging
      if (this._justDragged) {
        this._justDragged = false;
        return;
      }
      this._toggle();
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._collapse();
    });

    // Draggable bubble
    this._initDrag();
  }

  _initDrag() {
    const container = this.shadowRoot.getElementById('container');
    const bubble = this.shadowRoot.getElementById('bubble');
    let startX, startY, origX, origY, moved;

    const onPointerDown = (e) => {
      if (e.target.closest('#panel')) return;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      moved = false;
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      const newX = origX + dx;
      const newY = origY + dy;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.left = newX + 'px';
      container.style.top = newY + 'px';
      this._customPos = true;
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      if (moved) this._justDragged = true;
    };

    bubble.addEventListener('pointerdown', onPointerDown);
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          color: #f0ead6;
        }

        #container {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          transition: opacity 0.2s ease, transform 0.2s ease;
          touch-action: none;
        }

        #container.hidden {
          opacity: 0;
          transform: scale(0);
          pointer-events: none;
        }

        #container.visible {
          opacity: 1;
          transform: scale(1);
          pointer-events: auto;
          animation: bubbleEntrance 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes bubbleEntrance {
          0% { transform: scale(0); }
          100% { transform: scale(1); }
        }

        /* ── Bubble ── */
        #bubble {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(249,166,2,0.15);
          border: 1px solid rgba(249,166,2,0.3);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          transition: transform 0.15s ease, background 0.3s ease, border-color 0.3s ease;
          user-select: none;
          flex-shrink: 0;
        }

        #bubble:hover {
          transform: scale(1.05);
        }

        #bubble.complete {
          background: rgba(34,197,94,0.15);
          border-color: rgba(34,197,94,0.3);
        }

        #bubble.has-error {
          background: rgba(239,68,68,0.15);
          border-color: rgba(239,68,68,0.3);
        }

        #bubble.planning {
          background: rgba(249,166,2,0.1);
          border-color: rgba(249,166,2,0.2);
        }

        #badge {
          font-size: 16px;
          font-weight: 600;
          color: #f59e0b;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        #badge.pulse {
          animation: badgePulse 0.6s ease;
        }

        @keyframes badgePulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }

        .complete #badge {
          color: #22c55e;
        }

        .has-error #badge {
          color: #ef4444;
        }

        /* ── Spinner ring ── */
        #spinner {
          position: absolute;
          top: -3px;
          left: -3px;
          width: 54px;
          height: 54px;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: rgba(249,166,2,0.6);
          border-right-color: rgba(249,166,2,0.2);
          box-sizing: border-box;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }

        #spinner.active {
          opacity: 1;
          animation: spinnerRotate 1.2s linear infinite;
        }

        @keyframes spinnerRotate {
          to { transform: rotate(360deg); }
        }

        /* ── Panel ── */
        #panel {
          position: absolute;
          bottom: 58px;
          right: 0;
          width: 340px;
          max-width: calc(100vw - 32px);
          max-height: 400px;
          background: rgba(20, 18, 14, 0.95);
          border: 1px solid rgba(249,166,2,0.15);
          border-radius: 16px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          opacity: 0;
          transform: translateY(20px);
          pointer-events: none;
          transition: opacity 0.2s ease-out, transform 0.2s ease-out;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }

        #panel.open {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        /* ── Panel header ── */
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(249,166,2,0.1);
          flex-shrink: 0;
        }

        .panel-title {
          font-size: 13px;
          font-weight: 600;
          color: #f0ead6;
          letter-spacing: 0.02em;
        }

        #close-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: rgba(249,166,2,0.1);
          color: #8a7e6a;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          line-height: 1;
          transition: background 0.15s ease, color 0.15s ease;
          padding: 0;
        }

        #close-btn:hover {
          background: rgba(249,166,2,0.2);
          color: #f0ead6;
        }

        /* ── Worker list ── */
        #worker-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
          scrollbar-width: thin;
          scrollbar-color: rgba(249,166,2,0.2) transparent;
        }

        #worker-list::-webkit-scrollbar {
          width: 4px;
        }

        #worker-list::-webkit-scrollbar-thumb {
          background: rgba(249,166,2,0.2);
          border-radius: 4px;
        }

        .worker-card {
          padding: 8px 16px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .worker-card:hover {
          background: rgba(249,166,2,0.05);
        }

        .worker-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .worker-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .worker-name {
          font-size: 12px;
          font-weight: 600;
          color: #f0ead6;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .worker-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(249,166,2,0.2);
          border-top-color: #f59e0b;
          border-radius: 50%;
          animation: spinnerRotate 0.8s linear infinite;
          flex-shrink: 0;
        }

        .worker-icon {
          flex-shrink: 0;
        }

        .worker-task {
          margin-top: 2px;
          margin-left: 16px;
          font-size: 11px;
          color: #8a7e6a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .worker-error {
          margin-top: 4px;
          margin-left: 16px;
          font-size: 11px;
          color: #ef4444;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .worker-activity-count {
          font-size: 10px;
          color: #8a7e6a;
          background: rgba(249,166,2,0.1);
          padding: 1px 6px;
          border-radius: 8px;
          margin-left: auto;
          margin-right: 4px;
          flex-shrink: 0;
        }

        .worker-activities {
          margin-top: 6px;
          margin-left: 16px;
          background: rgba(0,0,0,0.3);
          border-radius: 6px;
          padding: 4px 0;
          max-height: 150px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(249,166,2,0.15) transparent;
        }

        .worker-activities::-webkit-scrollbar {
          width: 3px;
        }

        .worker-activities::-webkit-scrollbar-thumb {
          background: rgba(249,166,2,0.15);
          border-radius: 3px;
        }

        .activity-item {
          display: flex;
          align-items: center;
          padding: 3px 8px;
          font-size: 12px;
          color: #c0b8a4;
          line-height: 1.4;
          gap: 4px;
        }

        .activity-item.spinning {
          animation: activityPulse 2s ease-in-out infinite;
        }

        .activity-item.thinking {
          color: #8a8272;
          font-style: italic;
          font-size: 11px;
          animation: activityPulse 2s ease-in-out infinite;
        }

        @keyframes activityPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .activity-time {
          font-size: 10px;
          color: #6a6252;
          margin-left: auto;
          flex-shrink: 0;
          white-space: nowrap;
        }

        /* ── Plan view ── */
        #plan-view {
          display: none;
          padding: 8px 16px 12px;
        }

        .plan-title {
          font-size: 12px;
          font-weight: 600;
          color: #f59e0b;
          margin-bottom: 8px;
        }

        .plan-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }

        .plan-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .plan-agent {
          font-size: 12px;
          font-weight: 500;
          color: #f0ead6;
        }

        .plan-task {
          font-size: 11px;
          color: #8a7e6a;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Footer ── */
        #footer {
          display: none;
          padding: 8px 16px;
          border-top: 1px solid rgba(249,166,2,0.1);
          font-size: 11px;
          color: #8a7e6a;
          text-align: center;
          flex-shrink: 0;
        }

        .preview-btn {
          display: inline-block;
          margin-top: 6px;
          padding: 5px 14px;
          border: 1px solid rgba(34,197,94,0.3);
          background: rgba(34,197,94,0.12);
          color: #22c55e;
          font-size: 12px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          font-family: inherit;
        }

        .preview-btn:hover {
          background: rgba(34,197,94,0.2);
          border-color: rgba(34,197,94,0.5);
        }

        /* ── Mobile ── */
        @media (max-width: 480px) {
          #panel {
            width: calc(100vw - 32px);
            right: -4px;
          }
        }
      </style>

      <div id="container" class="hidden">
        <div id="panel">
          <div class="panel-header">
            <span class="panel-title">Workers</span>
            <button id="close-btn" aria-label="Close">×</button>
          </div>
          <div id="plan-view"></div>
          <div id="worker-list"></div>
          <div id="footer"></div>
        </div>
        <div id="bubble">
          <div id="spinner"></div>
          <span id="badge"></span>
        </div>
      </div>
    `;
  }
}

customElements.define('sc-worker-bubble', ScWorkerBubble);
