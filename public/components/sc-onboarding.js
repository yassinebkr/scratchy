
class ScOnboarding extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentSlide = 0;
    this.slides = [];

    this.handleKeydown = this.handleKeydown.bind(this);
  }

  static get observedAttributes() {
    return ['open'];
  }

  connectedCallback() {
    this.render();
    this.slides = this.shadowRoot.querySelectorAll('.slide');
    this.dots = this.shadowRoot.querySelectorAll('.dot');
    
    this.shadowRoot.querySelector('.skip-btn').addEventListener('click', () => this.finish());
    this.shadowRoot.querySelector('.start-btn').addEventListener('click', () => this.showSlide(1));
    this.shadowRoot.querySelector('.finish-btn').addEventListener('click', () => this.finish());

    this.dots.forEach((dot, index) => {
        dot.addEventListener('click', () => this.showSlide(index));
    });

    document.addEventListener('keydown', this.handleKeydown);
    this.updateVisibility();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      this.updateVisibility();
    }
  }

  handleKeydown(event) {
    if (this.hasAttribute('open') && event.key === 'Escape') {
      this.finish();
    }
  }

  updateVisibility() {
    const isOpen = this.hasAttribute('open');
    this.shadowRoot.querySelector('.overlay').style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      this.showSlide(0);
    }
  }

  showSlide(index) {
    if (index < 0 || index >= this.slides.length) return;

    this.slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    this.dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
    this.currentSlide = index;
  }

  finish() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('onboarding-complete', {
      bubbles: true,
      composed: true
    }));
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --bg: #0d0b07;
          --surface: #1a1610;
          --text: #f0ead6;
          --muted: #8a7e6a;
          --accent: #F9A602;
          --hover: #DAA520;
          --radius: 8px;
          --font-family: 'Geist', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(26, 22, 16, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: var(--font-family);
          color: var(--text);
          opacity: 0;
          transition: opacity 0.3s ease;
          display: none;
        }

        :host([open]) .overlay {
          opacity: 1;
        }
        
        .modal {
          position: relative;
          width: 90%;
          max-width: 680px;
          height: 420px;
        }

        .skip-btn {
          position: absolute;
          top: -30px;
          right: 0;
          background: none;
          border: none;
          color: var(--muted);
          font-size: 14px;
          cursor: pointer;
          transition: color 0.2s ease;
        }
        .skip-btn:hover {
          color: var(--text);
        }

        .slide {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.5s ease, visibility 0.5s;
        }
        
        .slide.active {
          opacity: 1;
          visibility: visible;
        }

        .slide-icon {
          font-size: 64px;
          line-height: 1;
          color: var(--accent);
          margin-bottom: 24px;
        }

        h1 {
          font-size: 48px;
          font-weight: 500;
          margin: 0 0 16px;
          color: var(--text);
        }

        .subtitle {
          font-size: 20px;
          color: var(--muted);
          margin-bottom: 32px;
        }
        
        .action-btn {
          background-color: var(--accent);
          color: var(--bg);
          font-size: 16px;
          font-weight: 500;
          padding: 12px 24px;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .action-btn:hover {
          background-color: var(--hover);
        }
        
        .secondary-title {
            font-size: 16px;
            color: var(--muted);
            margin-top: 32px;
            max-width: 400px;
        }

        .agent-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            width: 100%;
            margin-top: 24px;
        }
        
        .agent-card {
            background-color: var(--surface);
            border-radius: var(--radius);
            padding: 20px;
            border: 1px solid rgba(240, 234, 214, 0.1);
        }
        
        .agent-card .emoji { font-size: 24px; }
        .agent-card .name { font-size: 16px; font-weight: 500; margin: 8px 0; }
        .agent-card .desc { font-size: 13px; color: var(--muted); line-height: 1.4; }

        .tips-list {
          list-style: none;
          padding: 0;
          margin: 24px 0 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: flex-start;
          width: fit-content;
          margin-left: auto;
          margin-right: auto;
        }

        .tip-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 16px;
          background-color: var(--surface);
          padding: 10px 16px;
          border-radius: var(--radius);
          border: 1px solid rgba(240, 234, 214, 0.1);
          width: 320px;
        }
        
        .tip-item kbd {
            background: rgba(240, 234, 214, 0.1);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
        }

        .dot-indicators {
            position: absolute;
            bottom: -30px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 8px;
        }

        .dot {
            width: 8px;
            height: 8px;
            background-color: var(--muted);
            border-radius: 50%;
            cursor: pointer;
            transition: background-color 0.2s ease, transform 0.2s ease;
        }
        
        .dot.active {
            background-color: var(--accent);
            transform: scale(1.2);
        }

      </style>
      <div class="overlay">
        <div class="modal">
          <button class="skip-btn">Skip</button>
          
          <!-- Slide 1: Welcome -->
          <div class="slide active">
            <div class="slide-icon">✨</div>
            <h1>Welcome to Scratchy</h1>
            <p class="subtitle">Your AI-powered workspace</p>
            <button class="action-btn start-btn">Get Started</button>
          </div>

          <!-- Slide 2: Meet Your Team -->
          <div class="slide">
             <h2>Meet Your Team</h2>
             <div class="agent-grid">
                <div class="agent-card">
                    <div class="emoji">🏗️</div>
                    <div class="name">Atlas</div>
                    <div class="desc">Your general-purpose coding and systems expert.</div>
                </div>
                <div class="agent-card">
                    <div class="emoji">🎨</div>
                    <div class="name">Iris</div>
                    <div class="desc">A creative designer for UI, UX, and brand concepts.</div>
                </div>
                <div class="agent-card">
                    <div class="emoji">🔬</div>
                    <div class="name">Nova</div>
                    <div class="desc">A thorough researcher for deep dives and analysis.</div>
                </div>
                <div class="agent-card">
                    <div class="emoji">✍️</div>
                    <div class="name">Echo</div>
                    <div class="desc">A skilled writer for drafting, editing, and style.</div>
                </div>
             </div>
             <p class="secondary-title">Each agent has unique skills. Talk to any of them.</p>
          </div>
          
          <!-- Slide 3: Quick Tips -->
          <div class="slide">
            <h2>Quick Tips</h2>
            <ul class="tips-list">
              <li class="tip-item"><span>Open command palette</span> <kbd>⌘K</kbd></li>
              <li class="tip-item"><span>Drag and drop files to upload</span></li>
              <li class="tip-item"><span>Switch agents in the sidebar</span></li>
            </ul>
            <button class="action-btn finish-btn">Start Chatting</button>
          </div>

          <div class="dot-indicators">
            <div class="dot active"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('sc-onboarding', ScOnboarding);
