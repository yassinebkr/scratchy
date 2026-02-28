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
    background: var(--surface, #111118);
    color: var(--text, #e4e4e7);
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
    background: rgba(255,255,255,0.02);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    min-height: 32px;
  }

  .toolbar-title {
    font-size: 12px;
    font-weight: 600;
    color: #71717a;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .query-badge {
    font-size: 12px;
    color: var(--text, #e4e4e7);
    background: rgba(99,102,241,0.12);
    padding: 2px 8px;
    border-radius: 4px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-count {
    font-size: 11px;
    color: #71717a;
    margin-left: auto;
  }

  .toolbar-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: #8b949e;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover { color: #c9d1d9; border-color: rgba(255,255,255,0.2); }

  /* View toggle */
  .view-tabs {
    display: flex;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    overflow: hidden;
  }

  .view-tab {
    padding: 3px 10px;
    font-size: 11px;
    color: #71717a;
    cursor: pointer;
    background: transparent;
    border: none;
    font-family: inherit;
    transition: color 0.1s, background 0.1s;
  }

  .view-tab:hover { color: #c9d1d9; }
  .view-tab.active { background: rgba(255,255,255,0.06); color: var(--text, #e4e4e7); }

  /* Results list */
  .results {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .result-card {
    padding: 10px 12px;
    border-radius: 6px;
    margin-bottom: 4px;
    cursor: pointer;
    transition: background 0.1s;
    border: 1px solid transparent;
  }

  .result-card:hover { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06); }

  .result-title {
    font-size: 14px;
    font-weight: 500;
    color: #58a6ff;
    margin-bottom: 3px;
    line-height: 1.3;
  }

  .result-title:hover { text-decoration: underline; }

  .result-url {
    font-size: 11px;
    color: #3fb950;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-snippet {
    font-size: 12px;
    color: #8b949e;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-index {
    font-size: 11px;
    color: #484f58;
    margin-right: 6px;
    font-weight: 500;
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
  .history-icon { color: #484f58; }
  .history-query { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .history-time { font-size: 11px; color: #484f58; }

  /* Empty */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #484f58;
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
</style>

<div class="toolbar">
  <span class="toolbar-title">Search</span>
  <span class="query-badge" id="query-badge"></span>
  <span class="result-count" id="result-count"></span>
  <div class="view-tabs" id="view-tabs">
    <button class="view-tab active" data-view="results">Results</button>
    <button class="view-tab" data-view="reader">Reader</button>
    <button class="view-tab" data-view="history">History</button>
  </div>
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

    this._resultsView.innerHTML = this._results.map((r, i) => `
      <div class="result-card" data-url="${escapeHtml(r.url || '')}">
        <div class="result-title"><span class="result-index">${i + 1}.</span>${escapeHtml(r.title || 'Untitled')}</div>
        <div class="result-url">${escapeHtml(getDomain(r.url || ''))}</div>
        <div class="result-snippet">${escapeHtml(r.snippet || r.description || '')}</div>
      </div>
    `).join('');

    this._resultsView.querySelectorAll('.result-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        if (url) window.open(url, '_blank', 'noopener');
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
