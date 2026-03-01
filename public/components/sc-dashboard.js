
class ScDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._userName = window._scratchyUser?.displayName || 'there';
    this._activeAgent = null;
  }

  static get observedAttributes() {
    return ['user-name'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'user-name' && oldValue !== newValue) {
      this.userName = newValue;
    }
  }

  get userName() {
    return this._userName;
  }

  set userName(name) {
    if (this._userName === name) return;
    this._userName = name;
    const greetingNameEl = this.shadowRoot.querySelector('.greeting-name');
    if (greetingNameEl) {
      greetingNameEl.textContent = this._userName;
    }
  }

  get activeAgent() {
    return this._activeAgent;
  }

  set activeAgent(agent) {
    this._activeAgent = agent;
    // Future use: Update an agent display element
  }

  connectedCallback() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        :host {
          --bg: #0d0b07;
          --surface: rgba(26,22,16,0.85);
          --border: rgba(249,166,2,0.10);
          --text: #f0ead6;
          --muted: #8a7e6a;
          --accent: #F9A602;
          --font: 'Geist', system-ui, -apple-system, sans-serif;

          display: block;
          padding: 2rem;
          font-family: var(--font);
          color: var(--text);
          height: 100%;
          overflow-y: auto;
        }

        .dashboard-grid {
          display: grid;
          gap: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .greeting-bar {
          font-size: 1.75rem;
          font-weight: 500;
          opacity: 0;
          animation: fadeIn 0.5s 0.1s ease-out forwards;
        }

        .widget-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .widget-card {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          cursor: pointer;
          transition: transform 0.2s ease, background-color 0.2s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          opacity: 0;
          animation: fadeIn 0.5s ease-out forwards;
        }
        
        .widget-card:nth-child(1) { animation-delay: 0.2s; }
        .widget-card:nth-child(2) { animation-delay: 0.3s; }
        .widget-card:nth-child(3) { animation-delay: 0.4s; }

        .widget-card:hover {
          transform: translateY(-4px);
          background-color: rgba(37, 32, 21, 0.9);
        }

        .widget-header {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 1.1rem;
          font-weight: 500;
        }

        .widget-header .icon {
          font-size: 1.5rem;
        }

        .widget-count {
          margin-left: auto;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--accent);
        }

        .widget-description {
          font-size: 0.9rem;
          color: var(--muted);
        }

        .suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          opacity: 0;
          animation: fadeIn 0.5s 0.5s ease-out forwards;
        }

        .suggestion-chip {
          background-color: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .suggestion-chip:hover {
          background-color: var(--surface);
          color: var(--text);
          border-color: var(--accent);
        }

        .conversations {
          margin-top: 20px;
          opacity: 0;
          animation: fadeIn 0.5s 0.6s ease-out forwards;
        }
        
        .conversations h2 {
          font-size: 1.25rem;
          margin-bottom: 16px;
          color: var(--muted);
          font-weight: 500;
        }

        .conversation-item {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 10px;
          font-size: 0.95rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .conversation-item:hover {
          background-color: rgba(37, 32, 21, 0.9);
        }
        
        .conversation-item .truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--muted);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          :host {
            padding: 1rem;
          }
          .greeting-bar {
            font-size: 1.5rem;
          }
          .widget-cards {
            grid-template-columns: 1fr;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            padding-bottom: 15px; /* for scrollbar */
            /* A bit of a hack for horizontal scrolling on mobile */
            display: flex;
            width: 100%;
          }
          .widget-card {
            min-width: 280px;
            scroll-snap-align: start;
          }
        }
      </style>
      
      <div class="dashboard-grid">
        <div class="greeting-bar">
          <span class="greeting-text"></span> <span class="greeting-name"></span>
        </div>

        <div class="widget-cards">
          <div class="widget-card" data-widget="notes">
            <div class="widget-header"><span class="icon">📝</span><span>Notes</span><span class="widget-count" id="notes-count">—</span></div>
            <div class="widget-description">Quick thoughts and long-form ideas.</div>
          </div>
          <div class="widget-card" data-widget="calendar">
            <div class="widget-header"><span class="icon">📅</span><span>Calendar</span><span class="widget-count" id="calendar-count">—</span></div>
            <div class="widget-description">What's on your agenda for today.</div>
          </div>
          <div class="widget-card" data-widget="email">
            <div class="widget-header"><span class="icon">📧</span><span>Email</span><span class="widget-count" id="email-count">—</span></div>
            <div class="widget-description">Unread messages in your inbox.</div>
          </div>
        </div>

        <div class="suggestions">
          <button class="suggestion-chip" data-suggestion="Summarize my morning emails">Summarize my morning emails</button>
          <button class="suggestion-chip" data-suggestion="What's on my calendar today?">What's on my calendar today?</button>
          <button class="suggestion-chip" data-suggestion="Draft a thank-you note">Draft a thank-you note</button>
          <button class="suggestion-chip" data-suggestion="Review my open tasks">Review my open tasks</button>
        </div>
        
        <div class="conversations">
          <h2>Recent Chats</h2>
          <div id="conversation-list">
            <div class="empty-state">No recent conversations.</div>
          </div>
        </div>
      </div>
    `;

    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._updateGreeting();
    this.refresh();
    this._attachEventListeners();
  }

  _updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour < 12) {
      greeting = 'Good morning';
    } else if (hour < 18) {
      greeting = 'Good afternoon';
    } else {
      greeting = 'Good evening';
    }
    this.shadowRoot.querySelector('.greeting-text').textContent = greeting + ',';
    this.shadowRoot.querySelector('.greeting-name').textContent = this.userName;
  }
  
  _attachEventListeners() {
    this.shadowRoot.querySelectorAll('.widget-card').forEach(card => {
      card.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('dashboard-open-widget', {
          detail: { widget: card.dataset.widget },
          bubbles: true,
          composed: true
        }));
      });
    });

    this.shadowRoot.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('dashboard-suggestion', {
          detail: { text: chip.dataset.suggestion },
          bubbles: true,
          composed: true
        }));
      });
    });
  }

  async refresh() {
    this._updateGreeting();
    const fetchOptions = {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    };
    
    // Fetch counts
    const countsPromise = Promise.all([
      fetch('/api/notes', fetchOptions).then(res => res.ok ? res.json() : { count: '—' }).catch(() => ({ count: '—' })),
      fetch(`/api/calendar?from=today&to=tomorrow`, fetchOptions).then(res => res.ok ? res.json() : { count: '—' }).catch(() => ({ count: '—' })),
      fetch('/api/emails?status=unread', fetchOptions).then(res => res.ok ? res.json() : { count: '—' }).catch(() => ({ count: '—' }))
    ]);

    // Fetch conversations
    const historyPromise = fetch('/api/chat/history?limit=5', fetchOptions)
      .then(res => res.ok ? res.json() : [])
      .catch(() => []);

    const [counts, history] = await Promise.all([countsPromise, historyPromise]);

    this.shadowRoot.getElementById('notes-count').textContent = counts[0].count ?? '—';
    this.shadowRoot.getElementById('calendar-count').textContent = counts[1].count ?? '—';
    this.shadowRoot.getElementById('email-count').textContent = counts[2].count ?? '—';

    // Render conversations
    const conversationList = this.shadowRoot.getElementById('conversation-list');
    if (history && history.length > 0) {
      conversationList.innerHTML = history.map(chat => `
        <div class="conversation-item" data-chat-id="${chat.id}">
          <div class="truncate">${chat.title || 'Untitled Chat'}</div>
        </div>
      `).join('');
    } else {
      conversationList.innerHTML = '<div class="empty-state">No recent conversations.</div>';
    }
  }
}

customElements.define('sc-dashboard', ScDashboard);
export default ScDashboard;
