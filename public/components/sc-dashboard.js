/**
 * Scratchy v2 — Dashboard Web Component
 * <sc-dashboard> — Default workspace home screen.
 *
 * Events:  dashboard-open-widget  { widget: 'notes'|'calendar'|'email' }
 *          dashboard-suggestion   { text: string }
 */

class ScDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._userName = null;
    this._activeAgent = null;
    this._conversations = [];
    this._counts = { notes: null, calendar: null, email: null };
  }

  /* ── public API ─────────────────────────────────────── */

  set userName(name) {
    this._userName = name;
    this._updateGreeting();
  }

  set activeAgent(agent) {
    this._activeAgent = agent;
    this._updateAgent();
  }

  async refresh() {
    await Promise.all([
      this._fetchCounts(),
      this._fetchConversations()
    ]);
    this._render();
  }

  /* ── lifecycle ──────────────────────────────────────── */

  connectedCallback() {
    this._render();
    this.refresh();
  }

  /* ── data fetching ──────────────────────────────────── */

  async _fetchCounts() {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    var from = yyyy + '-' + mm + '-' + dd;
    var tom = new Date(today);
    tom.setDate(tom.getDate() + 1);
    var ty = tom.getFullYear();
    var tm = String(tom.getMonth() + 1).padStart(2, '0');
    var td = String(tom.getDate()).padStart(2, '0');
    var to = ty + '-' + tm + '-' + td;

    var results = await Promise.allSettled([
      fetch('/api/notes', { credentials: 'same-origin' }).then(function(r) { return r.ok ? r.json() : Promise.reject(); }),
      fetch('/api/calendar?from=' + from + '&to=' + to, { credentials: 'same-origin' }).then(function(r) { return r.ok ? r.json() : Promise.reject(); }),
      fetch('/api/emails?status=unread', { credentials: 'same-origin' }).then(function(r) { return r.ok ? r.json() : Promise.reject(); })
    ]);

    if (results[0].status === 'fulfilled') {
      var nd = results[0].value;
      this._counts.notes = Array.isArray(nd) ? nd.length : (nd && nd.count != null ? nd.count : null);
    } else {
      this._counts.notes = null;
    }

    if (results[1].status === 'fulfilled') {
      var cd = results[1].value;
      this._counts.calendar = Array.isArray(cd) ? cd.length : (cd && cd.count != null ? cd.count : null);
    } else {
      this._counts.calendar = null;
    }

    if (results[2].status === 'fulfilled') {
      var ed = results[2].value;
      this._counts.email = Array.isArray(ed) ? ed.length : (ed && ed.count != null ? ed.count : null);
    } else {
      this._counts.email = null;
    }
  }

  async _fetchConversations() {
    try {
      var r = await fetch('/api/chat/history?limit=5', { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      var data = await r.json();
      this._conversations = Array.isArray(data) ? data : (data && Array.isArray(data.conversations) ? data.conversations : []);
    } catch (e) {
      this._conversations = [];
    }
  }

  /* ── helpers ────────────────────────────────────────── */

  _getGreeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  _displayName() {
    if (this._userName) return this._userName;
    if (typeof window !== 'undefined' && window._scratchyUser && window._scratchyUser.displayName) {
      return window._scratchyUser.displayName;
    }
    return 'there';
  }

  _formatCount(val) {
    if (val === null || val === undefined) return '\u2014';
    return String(val);
  }

  _relativeTime(dateStr) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      var now = Date.now();
      var diff = now - d.getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      var hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      var days = Math.floor(hrs / 24);
      return days + 'd ago';
    } catch (e) {
      return '';
    }
  }

  _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '\u2026' : str;
  }

  _updateGreeting() {
    var el = this.shadowRoot && this.shadowRoot.querySelector('.greeting-name');
    if (el) el.textContent = this._displayName();
  }

  _updateAgent() {
    var el = this.shadowRoot && this.shadowRoot.querySelector('.agent-badge');
    if (el && this._activeAgent) {
      el.textContent = (this._activeAgent.emoji || '') + ' ' + (this._activeAgent.name || '');
      el.style.display = 'inline-flex';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  /* ── events ─────────────────────────────────────────── */

  _onWidgetClick(widget) {
    this.dispatchEvent(new CustomEvent('dashboard-open-widget', {
      bubbles: true, composed: true,
      detail: { widget: widget }
    }));
  }

  _onSuggestion(text) {
    this.dispatchEvent(new CustomEvent('dashboard-suggestion', {
      bubbles: true, composed: true,
      detail: { text: text }
    }));
  }

  /* ── render ─────────────────────────────────────────── */

  _render() {
    var self = this;
    var greeting = this._getGreeting();
    var name = this._displayName();
    var nc = this._formatCount(this._counts.notes);
    var cc = this._formatCount(this._counts.calendar);
    var ec = this._formatCount(this._counts.email);

    var suggestions = [
      'Summarize my unread emails',
      'What is on my calendar today?',
      'Draft a quick note',
      'Show me recent activity',
      'Create a new task',
      'Search my notes'
    ];

    var convosHtml = '';
    if (this._conversations.length > 0) {
      var items = '';
      for (var i = 0; i < this._conversations.length; i++) {
        var c = this._conversations[i];
        var title = self._truncate(c.title || c.name || c.summary || 'Conversation', 50);
        var time = self._relativeTime(c.updatedAt || c.updated_at || c.createdAt || c.created_at || c.date);
        var preview = self._truncate(c.lastMessage || c.preview || c.snippet || '', 70);
        items += '<div class="convo-item" style="animation-delay: ' + (0.3 + i * 0.08) + 's">'
          + '<div class="convo-header">'
          + '<span class="convo-title">' + self._escHtml(title) + '</span>'
          + '<span class="convo-time">' + self._escHtml(time) + '</span>'
          + '</div>'
          + (preview ? '<div class="convo-preview">' + self._escHtml(preview) + '</div>' : '')
          + '</div>';
      }
      convosHtml = '<section class="section conversations">'
        + '<h3 class="section-title">Recent conversations</h3>'
        + '<div class="convo-list">' + items + '</div>'
        + '</section>';
    }

    var chipsHtml = '';
    for (var j = 0; j < suggestions.length; j++) {
      chipsHtml += '<button class="chip" data-suggestion="' + self._escAttr(suggestions[j]) + '" style="animation-delay: ' + (0.25 + j * 0.06) + 's">'
        + self._escHtml(suggestions[j])
        + '</button>';
    }

    this.shadowRoot.innerHTML = '<style>' + ScDashboard._styles() + '</style>'
      + '<div class="dashboard">'
      + '<header class="greeting">'
      + '<div class="greeting-text">'
      + '<h1>' + self._escHtml(greeting) + ', <span class="greeting-name">' + self._escHtml(name) + '</span></h1>'
      + '<span class="agent-badge" style="display:' + (self._activeAgent ? 'inline-flex' : 'none') + '">'
      + (self._activeAgent ? self._escHtml((self._activeAgent.emoji || '') + ' ' + (self._activeAgent.name || '')) : '')
      + '</span>'
      + '</div>'
      + '<p class="greeting-sub">What would you like to do?</p>'
      + '</header>'
      + '<section class="section widgets">'
      + '<div class="widget-grid">'
      + '<button class="widget-card" data-widget="notes" style="animation-delay: 0.1s">'
      + '<span class="widget-icon">\uD83D\uDCDD</span>'
      + '<span class="widget-label">Notes</span>'
      + '<span class="widget-count">' + nc + '</span>'
      + '</button>'
      + '<button class="widget-card" data-widget="calendar" style="animation-delay: 0.18s">'
      + '<span class="widget-icon">\uD83D\uDCC5</span>'
      + '<span class="widget-label">Calendar</span>'
      + '<span class="widget-count">' + cc + '</span>'
      + '</button>'
      + '<button class="widget-card" data-widget="email" style="animation-delay: 0.26s">'
      + '<span class="widget-icon">\uD83D\uDCE7</span>'
      + '<span class="widget-label">Email</span>'
      + '<span class="widget-count">' + ec + '</span>'
      + '</button>'
      + '</div>'
      + '</section>'
      + '<section class="section suggestions">'
      + '<h3 class="section-title">Quick actions</h3>'
      + '<div class="chip-row">' + chipsHtml + '</div>'
      + '</section>'
      + convosHtml
      + '</div>';

    /* ── event delegation ── */
    var root = this.shadowRoot;
    root.querySelectorAll('.widget-card').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._onWidgetClick(btn.getAttribute('data-widget'));
      });
    });
    root.querySelectorAll('.chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._onSuggestion(btn.getAttribute('data-suggestion'));
      });
    });
  }

  /* ── sanitization ───────────────────────────────────── */

  _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _escAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── styles ─────────────────────────────────────────── */

  static _styles() {
    return [
      ':host {',
      '  --bg: #0d0b07;',
      '  --surface: rgba(26,22,16,0.85);',
      '  --surface-hover: #252015;',
      '  --border: rgba(249,166,2,0.10);',
      '  --text: #f0ead6;',
      '  --muted: #8a7e6a;',
      '  --accent: #F9A602;',
      '  --accent-hover: #DAA520;',
      '  --radius: 10px;',
      '  --font: "Geist", system-ui, -apple-system, sans-serif;',
      '  display: block;',
      '  width: 100%;',
      '  height: 100%;',
      '  font-family: var(--font);',
      '  font-size: 14px;',
      '  color: var(--text);',
      '  -webkit-font-smoothing: antialiased;',
      '  -moz-osx-font-smoothing: grayscale;',
      '}',
      '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',

      /* dashboard container */
      '.dashboard {',
      '  max-width: 720px;',
      '  margin: 0 auto;',
      '  padding: 48px 24px 64px;',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 32px;',
      '}',

      /* greeting */
      '.greeting { animation: fadeSlideIn 0.5s ease both; }',
      '.greeting h1 {',
      '  font-size: 28px;',
      '  font-weight: 600;',
      '  letter-spacing: -0.02em;',
      '  color: var(--text);',
      '  line-height: 1.2;',
      '}',
      '.greeting-name { color: var(--accent); }',
      '.greeting-sub {',
      '  margin-top: 6px;',
      '  font-size: 15px;',
      '  color: var(--muted);',
      '  font-weight: 400;',
      '}',
      '.greeting-text { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }',
      '.agent-badge {',
      '  font-size: 12px;',
      '  padding: 3px 10px;',
      '  border-radius: 99px;',
      '  background: rgba(249,166,2,0.10);',
      '  color: var(--accent);',
      '  align-items: center;',
      '  gap: 4px;',
      '  font-weight: 500;',
      '}',

      /* sections */
      '.section { animation: fadeSlideIn 0.5s ease both; }',
      '.section-title {',
      '  font-size: 13px;',
      '  font-weight: 500;',
      '  color: var(--muted);',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.06em;',
      '  margin-bottom: 12px;',
      '}',

      /* widget cards */
      '.widget-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(3, 1fr);',
      '  gap: 12px;',
      '}',
      '.widget-card {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 24px 16px;',
      '  background: var(--surface);',
      '  backdrop-filter: blur(12px);',
      '  -webkit-backdrop-filter: blur(12px);',
      '  border: 1px solid var(--border);',
      '  border-radius: var(--radius);',
      '  cursor: pointer;',
      '  transition: background 0.2s, border-color 0.2s, transform 0.2s;',
      '  font-family: var(--font);',
      '  color: var(--text);',
      '  outline: none;',
      '  animation: cardFadeIn 0.45s ease both;',
      '}',
      '.widget-card:hover {',
      '  background: var(--surface-hover);',
      '  border-color: rgba(249,166,2,0.22);',
      '  transform: translateY(-2px);',
      '}',
      '.widget-card:focus-visible {',
      '  box-shadow: 0 0 0 2px rgba(249,166,2,0.3);',
      '}',
      '.widget-icon { font-size: 28px; line-height: 1; }',
      '.widget-label {',
      '  font-size: 13px;',
      '  font-weight: 500;',
      '  color: var(--muted);',
      '}',
      '.widget-count {',
      '  font-size: 22px;',
      '  font-weight: 600;',
      '  color: var(--text);',
      '  line-height: 1;',
      '}',

      /* suggestion chips */
      '.chip-row {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 8px;',
      '}',
      '.chip {',
      '  padding: 7px 14px;',
      '  font-size: 13px;',
      '  font-family: var(--font);',
      '  color: var(--text);',
      '  background: rgba(26,22,16,0.6);',
      '  border: 1px solid var(--border);',
      '  border-radius: 99px;',
      '  cursor: pointer;',
      '  transition: background 0.2s, border-color 0.2s;',
      '  outline: none;',
      '  animation: cardFadeIn 0.4s ease both;',
      '  white-space: nowrap;',
      '}',
      '.chip:hover {',
      '  background: rgba(249,166,2,0.08);',
      '  border-color: rgba(249,166,2,0.25);',
      '}',
      '.chip:focus-visible {',
      '  box-shadow: 0 0 0 2px rgba(249,166,2,0.3);',
      '}',

      /* conversations */
      '.convo-list {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 2px;',
      '}',
      '.convo-item {',
      '  padding: 12px 14px;',
      '  border-radius: 8px;',
      '  transition: background 0.15s;',
      '  animation: cardFadeIn 0.45s ease both;',
      '}',
      '.convo-item:hover { background: rgba(249,166,2,0.04); }',
      '.convo-header {',
      '  display: flex;',
      '  justify-content: space-between;',
      '  align-items: center;',
      '  gap: 12px;',
      '}',
      '.convo-title {',
      '  font-size: 14px;',
      '  font-weight: 500;',
      '  color: var(--text);',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '  flex: 1;',
      '}',
      '.convo-time {',
      '  font-size: 12px;',
      '  color: var(--muted);',
      '  white-space: nowrap;',
      '  flex-shrink: 0;',
      '}',
      '.convo-preview {',
      '  font-size: 13px;',
      '  color: var(--muted);',
      '  margin-top: 3px;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '}',

      /* animations */
      '@keyframes fadeSlideIn {',
      '  from { opacity: 0; transform: translateY(12px); }',
      '  to   { opacity: 1; transform: translateY(0); }',
      '}',
      '@keyframes cardFadeIn {',
      '  from { opacity: 0; transform: translateY(8px) scale(0.97); }',
      '  to   { opacity: 1; transform: translateY(0) scale(1); }',
      '}',

      /* mobile */
      '@media (max-width: 768px) {',
      '  .dashboard { padding: 32px 16px 48px; gap: 24px; }',
      '  .greeting h1 { font-size: 22px; }',
      '  .widget-grid {',
      '    grid-template-columns: none;',
      '    display: flex;',
      '    overflow-x: auto;',
      '    scroll-snap-type: x mandatory;',
      '    -webkit-overflow-scrolling: touch;',
      '    gap: 10px;',
      '    padding-bottom: 4px;',
      '  }',
      '  .widget-card {',
      '    min-width: 140px;',
      '    flex-shrink: 0;',
      '    scroll-snap-align: start;',
      '  }',
      '  .chip-row { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }',
      '  .chip { flex-shrink: 0; }',
      '}'
    ].join('\n');
  }
}

customElements.define('sc-dashboard', ScDashboard);

export default ScDashboard;
