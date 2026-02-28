/**
 * Scratchy v2 — Search Results Surface
 * <sc-search> Web Component
 *
 * Displays web search results and fetched page content from agent web_search/web_fetch.
 * Features:
 * - Search results with titles, URLs, snippets
 * - Fetched page content viewer
 * - Query history
 * - Click to open in new tab
 */

function escapeHtml(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

function truncate(s, max) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max) + '…';
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    background: var(--sc-bg, #0e0c09);
    color: var(--sc-text, #e8e0d2);
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(14,12,9,0.5);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
    min-height: 32px;
  }

  .toolbar-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--sc-text-dim, #5a5040);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .query-badge {
    font-size: 12px;
    color: var(--sc-text, #f0ead6);
    background: var(--sc-accent-subtle, rgba(249, 166, 2, 0.08));
    padding: 2px 8px;
    border-radius: 4px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-count {
    font-size: 11px;
    color: var(--sc-text-dim, #5a5040);
    margin-left: auto;
  }

  .toolbar-btn {
    background: none;
    border: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    border-radius: 4px;
    color: var(--sc-text-dim, #5a5040);
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover { color: var(--sc-text, #e8e0d2); border-color: var(--sc-accent, #F9A602); }
  .toolbar-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(249,166,2,0.35); }

  /* View toggle */
  .view-tabs {
    display: flex;
    border: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    border-radius: 4px;
    overflow: hidden;
  }

  .view-tab {
    padding: 3px 10px;
    font-size: 11px;
    color: var(--sc-text-dim, #5a5040);
    cursor: pointer;
    background: transparent;
    border: none;
    font-family: inherit;
    transition: color 0.1s, background 0.1s;
  }

  .view-tab:hover { color: var(--sc-text, #e8e0d2); }
  .view-tab:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(249,166,2,0.35); }
  .view-tab.active { background: rgba(249,166,2,0.06); color: var(--sc-text, #e8e0d2); }

  /* Results list */
  .results {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .search-result-card {
    padding: 12px 14px;
    border-radius: var(--sc-radius-md, 10px);
    margin-bottom: 6px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    border: 1px solid var(--sc-border, rgba(249, 166, 2, 0.10));
    background: rgba(255,255,255,0.02);
  }

  .search-result-card:hover {
    border-color: rgba(249,166,2,0.15);
    background: rgba(249,166,2,0.03);
  }

  .search-result-url {
    font-size: 11px;
    color: var(--sc-accent, #F9A602);
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-result-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--sc-text, #f0ead6);
    margin-bottom: 4px;
    line-height: 1.3;
  }

  .search-result-snippet {
    font-size: 13px;
    color: var(--sc-text-muted, #8a7e6a);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Fetch view */
  .fetch-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    font-size: 13px;
    line-height: 1.7;
  }

  .fetch-header {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .fetch-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text, #e4e4e7);
    margin-bottom: 4px;
  }

  .fetch-url {
    font-size: 11px;
    color: #3fb950;
  }

  .fetch-body {
    color: #c9d1d9;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .fetch-body h1, .fetch-body h2, .fetch-body h3 {
    color: var(--text, #e4e4e7);
    margin: 16px 0 8px;
  }

  .fetch-body a { color: #58a6ff; }
  .fetch-body code {
    background: rgba(255,255,255,0.06);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--mono, monospace);
    font-size: 12px;
  }

  .fetch-body pre {
    background: rgba(0,0,0,0.3);
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 8px 0;
    font-family: var(--mono, monospace);
    font-size: 12px;
    line-height: 1.5;
  }

  /* History */
  .history-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin: 2px 8px;
    transition: background 0.1s;
  }

  .history-item:hover { background: rgba(255,255,255,0.03); }
  .history-icon { color: var(--sc-text-dim, #5a5040); }
  .history-query { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .history-time { font-size: 11px; color: var(--sc-text-dim, #5a5040); }

  /* Empty */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--sc-text-dim, #5a5040);
    font-size: 13px;
    gap: 8px;
  }

  .empty-state .icon { font-size: 20px; }

  /* Scrollbar */
  .results::-webkit-scrollbar,
  .fetch-content::-webkit-scrollbar { width: 6px; }
  .results::-webkit-scrollbar-track,
  .fetch-content::-webkit-scrollbar-track { background: transparent; }
  .results::-webkit-scrollbar-thumb,
  .fetch-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  /* Surface header — 36px uniform glassmorphism */
  .surface-header {
    display: flex;
    align-items: center;
    height: 36px;
    min-height: 36px;
    padding: 0 12px;
    background: var(--sc-glass-bg, rgba(26,22,16,0.85));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
    gap: 8px;
  }
  .surface-header-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-muted, #8a7e6a);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }
  .surface-header-icon {
    color: var(--sc-accent, #F9A602);
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .surface-close {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--sc-text-dim, #5a5040);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .surface-close:hover {
    background: rgba(239,68,68,0.12);
    color: #ef4444;
  }
  .surface-close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(249,166,2,0.35);
  }

  @media (max-width: 767px) {
    .surface-header {
      padding-left: 48px;
    }
  }
</style>

<div class="surface-header">
  <span class="surface-header-title">
    <svg class="surface-header-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/>
    </svg>
  </span>
  <span class="query-badge" id="query-badge"></span>
  <span class="result-count" id="result-count"></span>
  <div class="view-tabs" id="view-tabs">
    <button class="view-tab active" data-view="results">Results</button>
    <button class="view-tab" data-view="reader">Reader</button>
    <button class="view-tab" data-view="history">History</button>
  </div>
  <button class="surface-close" id="surface-close-btn" title="Close search">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
  </button>
</div>
<div class="results" id="results-view">
  <div class="empty-state"><span class="icon">🔍</span><span>Search results will appear here</span></div>
</div>
<div class="fetch-content" id="reader-view" style="display:none">
  <div class="empty-state"><span class="icon">📖</span><span>No page loaded</span></div>
</div>
<div class="results" id="history-view" style="display:none"></div>
`;

export class ScSearch extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    this._resultsView = this.shadowRoot.getElementById('results-view');
    this._readerView = this.shadowRoot.getElementById('reader-view');
    this._historyView = this.shadowRoot.getElementById('history-view');
    this._queryBadge = this.shadowRoot.getElementById('query-badge');
    this._resultCount = this.shadowRoot.getElementById('result-count');
    this._viewTabs = this.shadowRoot.getElementById('view-tabs');

    /** @type {{query: string, results: Array, ts: number}[]} */
    this._history = [];
    /** @type {Array} current results */
    this._results = [];
    this._currentQuery = '';
    this._currentView = 'results';
    /** @type {{url: string, title: string, content: string}|null} */
    this._fetchedPage = null;
  }

  connectedCallback() {
    this._viewTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.view-tab');
      if (!tab) return;
      this._switchView(tab.dataset.view);
    });
    this.shadowRoot.getElementById('surface-close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('surface-close', { detail: { type: 'search' }, bubbles: true, composed: true }));
    });
  }

  /** Add search results from web_search */
  setResults(query, results) {
    this._currentQuery = query;
    this._results = results || [];
    this._history.push({ query, results: this._results, ts: Date.now() });
    if (this._history.length > 20) this._history.shift();

    this._queryBadge.textContent = truncate(query, 40);
    this._queryBadge.title = query;
    this._resultCount.textContent = `${this._results.length} results`;

    this._renderResults();
    this._switchView('results');
  }

  /** Show fetched page content from web_fetch */
  setFetchedPage(url, title, content) {
    this._fetchedPage = { url, title: title || getDomain(url), content };
    this._renderReader();
    this._switchView('reader');
  }

  /** Clear everything */
  clear() {
    this._results = [];
    this._currentQuery = '';
    this._fetchedPage = null;
    this._queryBadge.textContent = '';
    this._resultCount.textContent = '';
    this._resultsView.innerHTML = '<div class="empty-state"><span class="icon">🔍</span><span>Search results will appear here</span></div>';
    this._readerView.innerHTML = '<div class="empty-state"><span class="icon">📖</span><span>No page loaded</span></div>';
  }

  // ─── Internal ─────────────────────────────────────────

  _switchView(view) {
    this._currentView = view;
    this._resultsView.style.display = view === 'results' ? '' : 'none';
    this._readerView.style.display = view === 'reader' ? '' : 'none';
    this._historyView.style.display = view === 'history' ? '' : 'none';

    this._viewTabs.querySelectorAll('.view-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === view);
    });

    if (view === 'history') this._renderHistory();
  }

  _renderResults() {
    if (!this._results.length) {
      this._resultsView.innerHTML = '<div class="empty-state"><span class="icon">🔍</span><span>No results found</span></div>';
      return;
    }

    this._resultsView.innerHTML = this._results.map((r) => `
      <div class="search-result-card" data-url="${escapeHtml(r.url || '')}" data-title="${escapeHtml(r.title || '')}">
        <div class="search-result-url">${escapeHtml(getDomain(r.url || ''))}</div>
        <div class="search-result-title">${escapeHtml(r.title || 'Untitled')}</div>
        <div class="search-result-snippet">${escapeHtml(r.snippet || r.description || '')}</div>
      </div>
    `).join('');

    this._resultsView.querySelectorAll('.search-result-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        const title = card.dataset.title;
        this.dispatchEvent(new CustomEvent('search-result-click', {
          detail: { url, title },
          bubbles: true,
          composed: true
        }));
      });
    });
  }

  _renderReader() {
    if (!this._fetchedPage) {
      this._readerView.innerHTML = '<div class="empty-state"><span class="icon">📖</span><span>No page loaded</span></div>';
      return;
    }

    const { url, title, content } = this._fetchedPage;
    this._readerView.innerHTML = `
      <div class="fetch-header">
        <div class="fetch-title">${escapeHtml(title)}</div>
        <div class="fetch-url">${escapeHtml(url)}</div>
      </div>
      <div class="fetch-body">${escapeHtml(content)}</div>
    `;
  }

  _renderHistory() {
    if (!this._history.length) {
      this._historyView.innerHTML = '<div class="empty-state"><span class="icon">📋</span><span>No search history</span></div>';
      return;
    }

    this._historyView.innerHTML = [...this._history].reverse().map(h => {
      const time = new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="history-item" data-query="${escapeHtml(h.query)}">
        <span class="history-icon">🔍</span>
        <span class="history-query">${escapeHtml(h.query)}</span>
        <span class="history-time">${time}</span>
      </div>`;
    }).join('');

    this._historyView.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const q = item.dataset.query;
        const entry = this._history.find(h => h.query === q);
        if (entry) {
          this._results = entry.results;
          this._currentQuery = q;
          this._queryBadge.textContent = truncate(q, 40);
          this._resultCount.textContent = `${this._results.length} results`;
          this._renderResults();
          this._switchView('results');
        }
      });
    });
  }
}

customElements.define('sc-search', ScSearch);
