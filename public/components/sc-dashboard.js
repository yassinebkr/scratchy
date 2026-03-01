
class ScDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._userName = window._scratchyUser?.displayName || 'there';
    this._activeAgent = null;
  }

  static get observedAttributes() {
    return [];
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.addEventListener('click', this._handleClicks.bind(this));
    this.refresh();
  }

  disconnectedCallback() {
    // Clean up event listeners if any were added to the document or window
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // Handle attribute changes if needed
  }

  // Public API
  set userName(name) {
    this._userName = name || 'there';
    this._updateGreeting();
  }

  get userName() {
    return this._userName;
  }

  set activeAgent(agent) {
    this._activeAgent = agent;
    // Potentially update a part of the UI to show the active agent
  }

  get activeAgent() {
    return this._activeAgent;
  }

  async refresh() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const from = today.toISOString().split('T')[0];
    const to = tomorrow.toISOString().split('T')[0];

    const urls = [
      `/api/notes?count=true`,
      `/api/calendar?from=${from}&to=${to}&count=true`,
      `/api/emails?status=unread&count=true`,
      `/api/chat/history?limit=5`
    ];

    const results = await Promise.allSettled(urls.map(url =>
      fetch(url, { credentials: 'same-origin' }).then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
    ));

    const [notes, calendar, email, history] = results;

    this._updateWidgetCount('notes', notes.status === 'fulfilled' ? notes.value.count : '—');
    this._updateWidgetCount('calendar', calendar.status === 'fulfilled' ? calendar.value.count : '—');
    this._updateWidgetCount('email', email.status === 'fulfilled' ? email.value.count : '—');

    if (history.status === 'fulfilled') {
      this._updateRecentConversations(history.value);
    } else {
      console.error('Failed to fetch chat history:', history.reason);
      this._updateRecentConversations([]);
    }
  }

  // Private methods
  _updateGreeting() {
    const greetingEl = this.shadowRoot.querySelector('.greeting-text');
    if (greetingEl) {
      const hour = new Date().getHours();
      let greeting = 'Good evening';
      if (hour < 12) {
        greeting = 'Good morning';
      } else if (hour < 18) {
        greeting = 'Good afternoon';
      }
      greetingEl.textContent = `${greeting}, ${this._userName}.`;
    }
  }

  _updateWidgetCount(widget, count) {
    const el = this.shadowRoot.querySelector(`.widget-card[data-widget="${widget}"] .widget-count`);
    if (el) {
      el.textContent = count;
    }
  }

  _updateRecentConversations(conversations) {
    const container = this.shadowRoot.querySelector('.conversations-list');
    if (!container) return;

    if (!conversations || conversations.length === 0) {
        container.innerHTML = '<div class="conversation-item empty">No recent conversations.</div>';
        return;
    }

    container.innerHTML = conversations.map(convo => `
      <div class="conversation-item" data-id="${convo.id}">
        <div class="convo-icon">💬</div>
        <div class="convo-title">${convo.title || 'Untitled Conversation'}</div>
      </div>
    `).join('');
  }

  _handleClicks(event) {
    const widgetCard = event.target.closest('.widget-card');
    if (widgetCard) {
      const widget = widgetCard.dataset.widget;
      this.dispatchEvent(new CustomEvent('dashboard-open-widget', {
        detail: { widget },
        bubbles: true,
        composed: true
      }));
      return;
    }

    const suggestionChip = event.target.closest('.suggestion-chip');
    if (suggestionChip) {
      const text = suggestionChip.dataset.text;
      this.dispatchEvent(new CustomEvent('dashboard-suggestion', {
        detail: { text },
        bubbles: true,
        composed: true
      }));
      return;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --bg: #0d0b07;
          --surface: rgba(26,22,16,0.85);
          --border: rgba(249,166,2,0.10);
          --text: #f0ead6;
          --muted: #8a7e6a;
          --accent: #F9A602;
          --font: 'Geist', system-ui, sans-serif;

          display: block;
          width: 100%;
          height: 100%;
          font-family: var(--font);
          color: var(--text);
          overflow-y: auto;
          padding: 2rem;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dashboard-container {
          max-width: 900px;
          margin: 0 auto;
          animation: fadeIn 0.5s ease-out;
        }

        .greeting-bar {
          padding-bottom: 2rem;
          font-size: 1.75rem;
          font-weight: 500;
          color: var(--text);
        }

        .widgets-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .widget-card {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 120px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
          backdrop-filter: blur(12px);
          animation: fadeIn 0.5s ease-out forwards;
          opacity: 0;
        }
        
        .widget-card:nth-child(1) { animation-delay: 0.1s; }
        .widget-card:nth-child(2) { animation-delay: 0.2s; }
        .widget-card:nth-child(3) { animation-delay: 0.3s; }

        .widget-card:hover {
          background-color: rgba(37, 32, 21, 0.9);
          border-color: rgba(249, 166, 2, 0.15);
        }

        .widget-header {
          display: flex;
          align-items: center;
          font-size: 1rem;
          font-weight: 500;
        }

        .widget-icon {
          margin-right: 0.75rem;
          font-size: 1.25rem;
        }

        .widget-count {
          margin-left: auto;
          font-size: 1.75rem;
          font-weight: 600;
          color: var(--text);
        }

        .suggestions-container {
          margin-bottom: 2.5rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .suggestion-chip {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-chip:hover {
          color: var(--text);
          border-color: rgba(249, 166, 2, 0.2);
          background-color: rgba(37, 32, 21, 0.9);
        }
        
        .section-header {
            font-size: 1rem;
            font-weight: 500;
            color: var(--muted);
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border);
        }
        
        .conversations-list {
            display: grid;
            gap: 0.5rem;
        }

        .conversation-item {
            display: flex;
            align-items: center;
            padding: 0.75rem;
            border-radius: 6px;
            background-color: transparent;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .conversation-item:hover {
            background-color: var(--surface);
        }
        
        .conversation-item.empty {
            color: var(--muted);
            cursor: default;
        }
        
        .conversation-item.empty:hover {
             background-color: transparent;
        }

        .convo-icon {
            margin-right: 1rem;
            color: var(--muted);
        }
        
        .convo-title {
            color: var(--text);
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
          :host {
            padding: 1.5rem 1rem;
          }
          
          .greeting-bar {
            font-size: 1.5rem;
            padding-bottom: 1.5rem;
          }

          .widgets-grid {
            grid-template-columns: 1fr;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            display: flex;
            padding-bottom: 1rem; /* for scrollbar */
            gap: 1rem;
          }
          
          .widget-card {
            flex-shrink: 0;
            width: 70vw;
            min-height: 110px;
            scroll-snap-align: start;
          }

          .suggestions-container {
            margin-bottom: 2rem;
          }
        }
      </style>
      <div class="dashboard-container">
        <div class="greeting-bar">
          <span class="greeting-text"></span>
        </div>

        <div class="widgets-grid">
          <div class="widget-card" data-widget="notes">
            <div class="widget-header">
              <span class="widget-icon">📝</span>
              <span>Notes</span>
            </div>
            <div class="widget-count">—</div>
          </div>
          <div class="widget-card" data-widget="calendar">
            <div class="widget-header">
              <span class="widget-icon">📅</span>
              <span>Calendar</span>
            </div>
            <div class="widget-count">—</div>
          </div>
          <div class="widget-card" data-widget="email">
            <div class="widget-header">
              <span class="widget-icon">📧</span>
              <span>Email</span>
            </div>
            <div class="widget-count">—</div>
          </div>
        </div>

        <div class="suggestions-container">
          <div class="suggestion-chip" data-text="What's on my mind?">What's on my mind?</div>
          <div class="suggestion-chip" data-text="Summarize my morning emails">Summarize my morning emails</div>
          <div class="suggestion-chip" data-text="Draft a new note">Draft a new note</div>
          <div class="suggestion-chip" data-text="What are my top priorities?">What are my top priorities?</div>
          <div class="suggestion-chip" data-text="Show me the latest news">Show me the latest news</div>
        </div>
        
        <div class="recent-conversations">
            <div class="section-header">Recent</div>
            <div class="conversations-list">
                <!-- Populated by JS -->
            </div>
        </div>
      </div>
    `;
    this._updateGreeting();
  }
}

customElements.define('sc-dashboard', ScDashboard);
export default ScDashboard;
