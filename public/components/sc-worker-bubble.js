/**
 * sc-worker-bubble.js — Floating worker status bubble component
 * Shows team worker status as a Messenger-style chat head bubble.
 */
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
    this._dragState = null;
    this._customPos = null;
    this._render();
    this._bindEvents();
  }

  connectedCallback() {
    this._hide();
  }

  disconnectedCallback() {
    if (this._autoCollapseTimer) clearTimeout(this._autoCollapseTimer);
  }

  // ── Public API ──────────────────────────────────────────────

  addWorker(agentName, task, color) {
    this._planning = false;
    this._allComplete = false;
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
    });
    this._show();
    this._update();
  }

  completeWorker(agentName, success = true, error = null) {
    const w = this._workers.get(agentName);
    if (!w) return;
    w.status = success ? 'success' : 'error';
    w.error = error || null;
    this._update();
    this._checkAllComplete();
  }

  appendOutput(agentName, delta) {
    const w = this._workers.get(agentName);
    if (!w) return;
    w.output += delta;
    // Update output area if expanded and this worker's detail is open
    const detail = this.shadowRoot.querySelector(`.worker-output[data-agent="${CSS.escape(agentName)}"]`);
    if (detail && detail.style.display !== 'none') {
      detail.textContent = w.output;
      detail.scrollTop = detail.scrollHeight;
    }
  }

  reset() {
    this._workers.clear();
    this._expanded = false;
    this._allComplete = false;
    this._planning = false;
    this._planTasks = [];
    if (this._autoCollapseTimer) {
      clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = null;
    }
    this._hide();
    this._update();
  }

  showPlan(tasks) {
    this._planning = true;
    this._planTasks = tasks || [];
    this._allComplete = false;
    this._workers.clear();
    this._show();
    this._update();
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
      this._update();
      // Pulse the badge
      const badge = this.shadowRoot.getElementById('badge');
      if (badge) {
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 600);
      }
      // Auto-collapse after 3s
      this._autoCollapseTimer = setTimeout(() => {
        this._expanded = false;
        this._update();
        this._autoCollapseTimer = null;
      }, 3000);
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

      card.innerHTML = `
        <div class="worker-header">
          <span class="worker-dot" style="background:${this._escAttr(w.color)}"></span>
          <span class="worker-name">${this._esc(w.name)}</span>
          ${statusIcon}
        </div>
        <div class="worker-task">${this._esc(w.task)}</div>
        ${w.error ? `<div class="worker-error">${this._esc(w.error)}</div>` : ''}
        <div class="worker-output" data-agent="${this._escAttr(name)}" style="display:none">${this._esc(w.output)}</div>
      `;

      // Click to toggle output
      card.addEventListener('click', () => {
        const out = card.querySelector('.worker-output');
        if (!out) return;
        const showing = out.style.display !== 'none';
        out.style.display = showing ? 'none' : 'block';
        if (!showing) {
          out.textContent = this._workers.get(name)?.output || '';
          out.scrollTop = out.scrollHeight;
        }
      });

      workerList.appendChild(card);
    }

    // Footer
    if (total > 0) {
      footer.textContent = `${complete} of ${total} complete`;
    } else {
      footer.textContent = '';
    }
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

        .worker-output {
          margin-top: 6px;
          margin-left: 16px;
          font-size: 11px;
          color: #8a7e6a;
          background: rgba(0,0,0,0.3);
          border-radius: 6px;
          padding: 6px 8px;
          max-height: 120px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: 'Geist Mono', monospace;
          scrollbar-width: thin;
          scrollbar-color: rgba(249,166,2,0.15) transparent;
        }

        .worker-output::-webkit-scrollbar {
          width: 3px;
        }

        .worker-output::-webkit-scrollbar-thumb {
          background: rgba(249,166,2,0.15);
          border-radius: 3px;
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
