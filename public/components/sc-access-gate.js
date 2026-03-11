class ScAccessGate extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --bg-color: #0d0b07;
          --surface-color: rgba(26, 22, 16, 0.85);
          --border-color: rgba(249, 166, 2, 0.10);
          --accent-color: #F9A602;
          --text-color: #f0ead6;
          --text-muted-color: #8a7e6a;
          --font-family: 'Geist', system-ui, sans-serif;

          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 9000;
          justify-content: center;
          align-items: center;
          background-color: rgba(0, 0, 0, 0.5);
          opacity: 0;
          transition: opacity 0.3s ease;
          font-family: var(--font-family);
        }

        :host([visible]) {
          display: flex;
          opacity: 1;
        }

        .card {
          background-color: var(--surface-color);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 2.5rem;
          max-width: 480px;
          width: calc(100% - 2rem);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          text-align: center;
          color: var(--text-color);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          transform: scale(0.95);
          transition: transform 0.3s ease;
        }
        
        :host([visible]) .card {
            transform: scale(1);
        }

        .lock-icon {
          font-size: 3rem;
          line-height: 1;
          color: var(--accent-color);
          margin-bottom: -0.5rem;
        }

        h1 {
          font-size: 1.75rem;
          font-weight: 500;
          margin: 0;
        }

        p {
          font-size: 1rem;
          line-height: 1.5;
          margin: 0;
          color: var(--text-muted-color);
        }

        .title-section p {
            color: var(--text-color);
            opacity: 0.9;
        }

        .options {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-top: 1rem;
        }

        .button {
          background-color: var(--accent-color);
          color: var(--bg-color);
          border: none;
          border-radius: 8px;
          padding: 0.875rem 1.5rem;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease, transform 0.2s ease;
          font-family: var(--font-family);
        }

        .button:hover {
          background-color: #ffbf3a;
          transform: translateY(-2px);
        }
        
        .button:active {
            transform: translateY(0);
        }

        .request-access {
            font-size: 0.875rem;
        }
        
        .request-access strong {
            font-weight: 500;
            color: var(--text-color);
        }

        .footer-note {
          margin-top: 1rem;
          font-size: 0.75rem;
          color: var(--text-muted-color);
          opacity: 0.7;
        }
        
        @media (max-width: 480px) {
            .card {
                padding: 2rem 1.5rem;
            }
            h1 {
                font-size: 1.5rem;
            }
            p {
                font-size: 0.95rem;
            }
        }
      </style>
      <div class="card">
        <div class="lock-icon">🔒</div>
        <div class="title-section">
            <h1>Access Required</h1>
            <p>Your account doesn't have chat access yet.</p>
        </div>
        
        <div class="options">
          <button class="button" id="use-key-btn">Use Your Own API Key</button>
          <p class="request-access">
            Alternatively, <strong>Request Access</strong> by contacting the administrator.
          </p>
        </div>

        <p class="footer-note">Already have access? Try refreshing the page.</p>
      </div>
    `;
  }

  connectedCallback() {
    this.shadowRoot.getElementById('use-key-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('open-settings', { bubbles: true, composed: true }));
    });
  }

  show() {
    this.setAttribute('visible', '');
  }

  hide() {
    this.removeAttribute('visible');
  }
}

customElements.define('sc-access-gate', ScAccessGate);
