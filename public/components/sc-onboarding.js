// sc-onboarding.js — Scratchy v2 Onboarding + Empty States
// Shadow DOM modal (first-run) + static inline HTML (empty chat state)

class ScOnboarding extends HTMLElement {

  // ─── SVG Icon Library ───────────────────────────────────────────────
  static icons = {
    code:      (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 4.5L2 9l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 4.5L16 9l-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    palette:   (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 1.5A7.5 7.5 0 0 0 1.5 9a7.5 7.5 0 0 0 7.5 7.5 1.5 1.5 0 0 0 1.5-1.5v-.64a1.5 1.5 0 0 1 1.5-1.5h1.77A3.23 3.23 0 0 0 16.5 9.63 7.5 7.5 0 0 0 9 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5.5" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="5.5" r="1" fill="currentColor"/><circle cx="11.5" cy="5.5" r="1" fill="currentColor"/></svg>`,
    search:    (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7.5" cy="7.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M11.5 11.5L16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    pen:       (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.9 2.1a2.1 2.1 0 0 1 3 3L6.3 14.7l-4 1 1-4L12.9 2.1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    terminal:  (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2.5 2L5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    canvas:    (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="1.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="10.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="10.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`,
    file:      (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1.5H4.5A1.5 1.5 0 0 0 3 3v12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 15 15V6.5L10 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 1.5V6.5H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    lightbulb: (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.75 15.75h4.5M9 1.5a4.5 4.5 0 0 0-2.7 8.1c.46.35.7.88.7 1.4v.75h4v-.75c0-.52.24-1.05.7-1.4A4.5 4.5 0 0 0 9 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    wrench:    (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.4 1.8a4.2 4.2 0 0 0-4.8 6.6L2.4 12.6a1.5 1.5 0 1 0 2.1 2.1l4.2-4.2a4.2 4.2 0 0 0 6.6-4.8l-2.7 2.7-1.8-.6-.6-1.8 2.7-2.7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chart:     (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="9" width="3" height="7" rx=".75" stroke="currentColor" stroke-width="1.5"/><rect x="7.5" y="5" width="3" height="11" rx=".75" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="2" width="3" height="14" rx=".75" stroke="currentColor" stroke-width="1.5"/></svg>`,
    paint:     (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 11.5s1-1.5 3-1.5 3 2 5 2 3-1.5 3-1.5V3.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11.5v3a2 2 0 0 0 4 0v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    document:  (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1.5H4.5A1.5 1.5 0 0 0 3 3v12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 15 15V6.5L10 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 9h6M6 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    magnifier: (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7.5" cy="7.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M11.5 11.5L16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 7.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7.5 5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    arrow:     (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    check:     (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9l3.5 3.5L14 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    close:     (s=18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    scratchy:  (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" stroke-width="1.5"/><path d="M7 8h4M13 8h4M7 12h10M7 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  };

  // ─── Empty State (static HTML for injection) ───────────────────────
  static getEmptyStateHTML() {
    const chipData = [
      { icon: 'lightbulb', text: 'Write a landing page' },
      { icon: 'wrench',    text: 'Debug my code' },
      { icon: 'chart',     text: 'Analyze this data' },
      { icon: 'paint',     text: 'Design a component' },
      { icon: 'document',  text: 'Draft an email' },
      { icon: 'magnifier', text: 'Research a topic' },
    ];

    const chipIcon = (name) => ScOnboarding.icons[name](12);

    const chips = chipData.map(c => `
      <button
        data-suggestion="${c.text}"
        style="
          display:inline-flex; align-items:center; gap:6px;
          padding:8px 14px;
          background:rgba(26,22,16,0.7);
          border:1px solid rgba(249,166,2,0.10);
          border-radius:6px;
          color:#f0ead6;
          font-family:'Geist',system-ui,sans-serif;
          font-size:13px; line-height:1.4;
          cursor:pointer;
          transition:transform 150ms ease,box-shadow 150ms ease,border-color 150ms ease,background 150ms ease;
          white-space:nowrap;
          outline:none;
        "
        onmouseenter="this.style.transform='scale(1.02)';this.style.boxShadow='0 0 12px rgba(249,166,2,0.12)';this.style.borderColor='rgba(249,166,2,0.25)';this.style.background='rgba(37,32,21,0.9)'"
        onmouseleave="this.style.transform='scale(1)';this.style.boxShadow='none';this.style.borderColor='rgba(249,166,2,0.10)';this.style.background='rgba(26,22,16,0.7)'"
        onfocus="this.style.transform='scale(1.02)';this.style.boxShadow='0 0 0 2px rgba(249,166,2,0.3)';this.style.borderColor='rgba(249,166,2,0.25)'"
        onblur="this.style.transform='scale(1)';this.style.boxShadow='none';this.style.borderColor='rgba(249,166,2,0.10)'"
      ><span style="display:inline-flex;color:#8a7e6a;flex-shrink:0">${chipIcon(c.icon)}</span><span>${c.text}</span></button>
    `).join('');

    return `
      <div class="sc-empty-state" style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        padding:48px 24px; max-width:480px; margin:0 auto;
        font-family:'Geist',system-ui,sans-serif;
        animation:scEmptyFadeIn 400ms ease both;
      ">
        <style>
          @keyframes scEmptyFadeIn {
            from { opacity:0; transform:translateY(8px) }
            to   { opacity:1; transform:translateY(0) }
          }
          @media (prefers-reduced-motion:reduce) {
            .sc-empty-state, .sc-empty-state * {
              animation-duration:0.01ms !important;
              transition-duration:0.01ms !important;
            }
          }
        </style>

        <div style="color:#5a5040; margin-bottom:24px;">
          ${ScOnboarding.icons.scratchy(32)}
        </div>

        <p style="
          font-size:16px; font-weight:500; color:#f0ead6;
          margin:0 0 24px; text-align:center; line-height:1.5;
        ">What would you like to work on?</p>

        <div style="
          display:grid;
          grid-template-columns:repeat(2,1fr);
          gap:8px; width:100%;
        " class="sc-empty-chips">
          ${chips}
        </div>

        <style>
          @media (min-width:520px) {
            .sc-empty-chips { grid-template-columns:repeat(3,1fr) !important; }
          }
        </style>

        <p style="
          font-size:12px; color:#5a5040;
          margin:20px 0 0; text-align:center;
        ">or just start typing...</p>
      </div>
    `;
  }

  // ─── Constructor ────────────────────────────────────────────────────
  constructor() {
    super();
    this._slide = 0;
    this._totalSlides = 3;
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (localStorage.getItem('scratchy-onboarded') === 'true') {
      this.remove();
      return;
    }
    this._render();
    this._bind();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const overlay = this.shadowRoot.querySelector('.overlay');
        if (overlay) overlay.classList.add('visible');
      });
    });
  }

  disconnectedCallback() {
    this._unbind();
  }

  // ─── Keyboard & event binding ──────────────────────────────────────
  _bind() {
    this._onKey = (e) => {
      if (e.key === 'Escape') this._skip();
      if (e.key === 'ArrowRight') this._next();
      if (e.key === 'ArrowLeft') this._prev();
    };
    document.addEventListener('keydown', this._onKey);
  }

  _unbind() {
    if (this._onKey) document.removeEventListener('keydown', this._onKey);
  }

  // ─── Navigation ────────────────────────────────────────────────────
  _goTo(i) {
    if (i < 0 || i >= this._totalSlides) return;
    this._slide = i;
    this._updateSlides();
  }

  _next() {
    if (this._slide >= this._totalSlides - 1) {
      this._complete();
    } else {
      this._goTo(this._slide + 1);
    }
  }

  _prev() {
    this._goTo(this._slide - 1);
  }

  _skip() {
    localStorage.setItem('scratchy-onboarded', 'true');
    this.dispatchEvent(new CustomEvent('onboarding-skip', { bubbles: true }));
    this._dismiss();
  }

  _complete() {
    localStorage.setItem('scratchy-onboarded', 'true');
    this.dispatchEvent(new CustomEvent('onboarding-complete', { bubbles: true }));
    this._dismiss();
  }

  _dismiss() {
    const overlay = this.shadowRoot.querySelector('.overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => this.remove(), { once: true });
      setTimeout(() => this.remove(), 500);
    } else {
      this.remove();
    }
  }

  // ─── Update slide visibility ───────────────────────────────────────
  _updateSlides() {
    const slides = this.shadowRoot.querySelectorAll('.slide');
    slides.forEach((el, i) => {
      el.classList.toggle('active', i === this._slide);
      el.classList.toggle('prev', i < this._slide);
      el.classList.toggle('next', i > this._slide);
    });
    const dots = this.shadowRoot.querySelectorAll('.dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === this._slide));
  }

  // ─── Illustrations ─────────────────────────────────────────────────
  static _illustrationWorkspace() {
    return `
      <svg width="200" height="120" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect class="surface s1" x="10" y="20" width="55" height="80" rx="6"
          stroke="rgba(249,166,2,0.3)" stroke-width="1.5" fill="rgba(249,166,2,0.04)"/>
        <rect class="surface s2" x="72" y="10" width="55" height="100" rx="6"
          stroke="rgba(249,166,2,0.25)" stroke-width="1.5" fill="rgba(249,166,2,0.06)"/>
        <rect class="surface s3" x="134" y="25" width="55" height="70" rx="6"
          stroke="rgba(249,166,2,0.2)" stroke-width="1.5" fill="rgba(249,166,2,0.03)"/>
        <circle cx="37" cy="55" r="3" fill="rgba(249,166,2,0.4)"/>
        <circle cx="99" cy="55" r="3" fill="rgba(249,166,2,0.5)"/>
        <circle cx="161" cy="55" r="3" fill="rgba(249,166,2,0.35)"/>
      </svg>
    `;
  }

  static _illustrationSurfaces() {
    return `
      <svg width="220" height="100" viewBox="0 0 220 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect class="surface s1" x="5" y="20" width="60" height="60" rx="6"
          stroke="rgba(249,166,2,0.3)" stroke-width="1.5" fill="rgba(249,166,2,0.04)"/>
        <path d="M12 40h20M12 48h14" stroke="rgba(249,166,2,0.2)" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="15" cy="32" r="2" fill="rgba(249,166,2,0.3)"/>

        <rect class="panel p1" x="80" y="10" width="55" height="35" rx="5"
          stroke="rgba(96,165,250,0.3)" stroke-width="1" fill="rgba(96,165,250,0.05)"/>
        <path d="M87 22h20M87 28h12" stroke="rgba(96,165,250,0.2)" stroke-width="1" stroke-linecap="round"/>

        <rect class="panel p2" x="80" y="52" width="55" height="35" rx="5"
          stroke="rgba(139,92,246,0.3)" stroke-width="1" fill="rgba(139,92,246,0.05)"/>
        <path d="M87 64h20M87 70h16" stroke="rgba(139,92,246,0.2)" stroke-width="1" stroke-linecap="round"/>

        <rect class="panel p3" x="148" y="25" width="55" height="50" rx="5"
          stroke="rgba(52,211,153,0.3)" stroke-width="1" fill="rgba(52,211,153,0.05)"/>
        <path d="M155 42h20M155 48h28M155 54h14" stroke="rgba(52,211,153,0.2)" stroke-width="1" stroke-linecap="round"/>

        <path d="M65 50 L80 30" stroke="rgba(249,166,2,0.15)" stroke-width="1" stroke-dasharray="3 3"/>
        <path d="M65 50 L80 68" stroke="rgba(249,166,2,0.15)" stroke-width="1" stroke-dasharray="3 3"/>
        <path d="M135 48 L148 48" stroke="rgba(249,166,2,0.15)" stroke-width="1" stroke-dasharray="3 3"/>
      </svg>
    `;
  }

  // ─── Render ─────────────────────────────────────────────────────────
  _render() {
    const icon = ScOnboarding.icons;

    const agentCards = [
      { name: 'Atlas', desc: 'Code & debug',       icon: icon.code(18),    color: '#60a5fa' },
      { name: 'Iris',  desc: 'Design & create',    icon: icon.palette(18), color: '#a78bfa' },
      { name: 'Nova',  desc: 'Research & analyze',  icon: icon.search(18),  color: '#34d399' },
      { name: 'Echo',  desc: 'Write & edit',        icon: icon.pen(18),     color: '#fb923c' },
    ];

    const bulletPoints = [
      { icon: icon.terminal(18), text: 'Terminal opens when coding' },
      { icon: icon.canvas(18),   text: 'Canvas renders visual components' },
      { icon: icon.file(18),     text: 'Files appear when browsing' },
      { icon: icon.search(18),   text: 'Search activates for research' },
    ];

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :host {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 10000;
          font-family: 'Geist', system-ui, -apple-system, sans-serif;
        }

        .overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(13, 11, 7, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          opacity: 0;
          transition: opacity 300ms ease;
        }
        .overlay.visible { opacity: 1; }

        .card {
          position: relative;
          width: 90vw;
          max-width: 520px;
          min-height: 420px;
          background: rgba(26, 22, 16, 0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(249, 166, 2, 0.08);
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* ── Skip button ────────────────────────────── */
        .skip-btn {
          position: absolute;
          top: 16px; right: 16px;
          z-index: 2;
          background: none;
          border: none;
          color: #5a5040;
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: color 150ms ease, background 150ms ease;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .skip-btn:hover { color: #8a7e6a; background: rgba(249,166,2,0.05); }
        .skip-btn:focus-visible {
          outline: 2px solid rgba(249,166,2,0.4);
          outline-offset: 2px;
        }

        /* ── Slides container ───────────────────────── */
        .slides {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        .slide {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 40px 32px;
          opacity: 0;
          transform: translateX(24px);
          transition: opacity 300ms ease, transform 300ms ease;
          pointer-events: none;
        }
        .slide.active {
          opacity: 1;
          transform: translateX(0);
          pointer-events: auto;
        }
        .slide.prev {
          opacity: 0;
          transform: translateX(-24px);
        }
        .slide.next {
          opacity: 0;
          transform: translateX(24px);
        }

        /* ── Typography ─────────────────────────────── */
        h2 {
          font-size: 24px;
          font-weight: 600;
          color: #f0ead6;
          text-align: center;
          line-height: 1.3;
          margin-bottom: 8px;
        }

        .subtitle {
          font-size: 14px;
          color: #8a7e6a;
          text-align: center;
          line-height: 1.5;
          max-width: 360px;
        }

        /* ── Illustration ───────────────────────────── */
        .illustration {
          margin: 24px 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .illustration .surface {
          animation: surfaceFloat 4s ease-in-out infinite;
        }
        .illustration .s1 { animation-delay: 0s; }
        .illustration .s2 { animation-delay: 0.8s; }
        .illustration .s3 { animation-delay: 1.6s; }

        .illustration .panel {
          animation: panelSlide 500ms ease both;
        }
        .illustration .p1 { animation-delay: 100ms; }
        .illustration .p2 { animation-delay: 200ms; }
        .illustration .p3 { animation-delay: 300ms; }

        @keyframes surfaceFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }

        @keyframes panelSlide {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        /* ── Agent cards ────────────────────────────── */
        .agents {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          width: 100%;
          max-width: 420px;
          margin: 20px 0 16px;
        }

        .agent-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 14px 8px;
          background: rgba(249, 166, 2, 0.03);
          border: 1px solid rgba(249, 166, 2, 0.06);
          border-radius: 8px;
          transition: border-color 200ms ease, background 200ms ease;
        }
        .agent-card:hover {
          border-color: rgba(249, 166, 2, 0.15);
          background: rgba(249, 166, 2, 0.06);
        }

        .agent-icon {
          width: 36px; height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: rgba(26, 22, 16, 0.8);
          border: 1px solid rgba(249, 166, 2, 0.08);
          color: #f0ead6;
        }

        .agent-dot {
          position: absolute;
          top: -2px; right: -2px;
          width: 8px; height: 8px;
          border-radius: 50%;
          border: 2px solid #1a1610;
        }

        .agent-name {
          font-size: 12px;
          font-weight: 600;
          color: #f0ead6;
        }

        .agent-desc {
          font-size: 11px;
          color: #8a7e6a;
          text-align: center;
        }

        /* ── Bullet points ──────────────────────────── */
        .bullets {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 340px;
          margin: 16px 0;
        }

        .bullet {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #f0ead6;
          line-height: 1.4;
        }

        .bullet-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px; height: 30px;
          border-radius: 6px;
          background: rgba(249, 166, 2, 0.06);
          border: 1px solid rgba(249, 166, 2, 0.08);
          color: #8a7e6a;
        }

        /* ── Buttons ────────────────────────────────── */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 150ms ease, transform 150ms ease, box-shadow 150ms ease;
          outline: none;
        }
        .btn:active { transform: scale(0.98); }
        .btn:focus-visible {
          outline: 2px solid rgba(249,166,2,0.5);
          outline-offset: 2px;
        }

        .btn-primary {
          background: #F9A602;
          color: #0d0b07;
        }
        .btn-primary:hover {
          background: #DAA520;
          box-shadow: 0 0 16px rgba(249,166,2,0.25);
        }

        .btn-ghost {
          background: rgba(249,166,2,0.08);
          color: #f0ead6;
          border: 1px solid rgba(249,166,2,0.12);
        }
        .btn-ghost:hover {
          background: rgba(249,166,2,0.14);
        }

        /* ── Navigation dots ────────────────────────── */
        .nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 20px 0;
        }

        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: rgba(249,166,2,0.15);
          border: none;
          cursor: pointer;
          padding: 0;
          transition: background 200ms ease, transform 200ms ease;
        }
        .dot:hover { background: rgba(249,166,2,0.35); }
        .dot.active {
          background: #F9A602;
          transform: scale(1.2);
        }
        .dot:focus-visible {
          outline: 2px solid rgba(249,166,2,0.5);
          outline-offset: 2px;
        }

        /* ── Reduced motion ─────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .slide {
            transition: opacity 200ms ease;
            transform: none !important;
          }
          .slide.active { transform: none !important; }
          .slide.prev   { transform: none !important; }
          .slide.next   { transform: none !important; }
          .overlay { transition: opacity 200ms ease; }
          .illustration .surface { animation: none; }
          .illustration .panel { animation: none; opacity: 1; }
          .dot { transition: background 200ms ease; transform: none !important; }
          .dot.active { transform: none !important; }
          .btn:active { transform: none !important; }
        }

        /* ── Mobile ─────────────────────────────────── */
        @media (max-width: 520px) {
          .card { min-height: 380px; }
          .slide { padding: 40px 24px 24px; }
          h2 { font-size: 20px; }
          .agents {
            grid-template-columns: repeat(2, 1fr);
            max-width: 280px;
          }
          .illustration svg { transform: scale(0.8); transform-origin: center; }
        }
      </style>

      <div class="overlay" role="dialog" aria-modal="true" aria-label="Welcome to Scratchy">
        <div class="card">

          <button class="skip-btn" aria-label="Skip onboarding">
            Skip ${icon.close(14)}
          </button>

          <div class="slides">

            <!-- Slide 1: Welcome -->
            <div class="slide active" role="tabpanel" aria-label="Welcome">
              <div class="illustration">
                ${ScOnboarding._illustrationWorkspace()}
              </div>
              <h2>Welcome to Scratchy</h2>
              <p class="subtitle" style="margin-bottom:24px">Your AI team, one workspace</p>
              <button class="btn btn-primary" data-action="next">
                Get Started ${icon.arrow(16)}
              </button>
            </div>

            <!-- Slide 2: Meet Your Team -->
            <div class="slide next" role="tabpanel" aria-label="Meet Your Team">
              <h2>Pre-built specialists, ready to work</h2>
              <div class="agents">
                ${agentCards.map(a => `
                  <div class="agent-card">
                    <div class="agent-icon">
                      ${a.icon}
                      <span class="agent-dot" style="background:${a.color}"></span>
                    </div>
                    <span class="agent-name">${a.name}</span>
                    <span class="agent-desc">${a.desc}</span>
                  </div>
                `).join('')}
              </div>
              <p class="subtitle" style="margin-bottom:20px">Switch agents anytime. Each remembers your conversation.</p>
              <button class="btn btn-primary" data-action="next">
                Next ${icon.arrow(16)}
              </button>
            </div>

            <!-- Slide 3: Surfaces & Canvas -->
            <div class="slide next" role="tabpanel" aria-label="Surfaces and Canvas">
              <h2>Context appears automatically</h2>
              <div class="illustration">
                ${ScOnboarding._illustrationSurfaces()}
              </div>
              <div class="bullets">
                ${bulletPoints.map(b => `
                  <div class="bullet">
                    <span class="bullet-icon">${b.icon}</span>
                    <span>${b.text}</span>
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-primary" data-action="complete" style="margin-top:8px">
                Start chatting ${icon.arrow(16)}
              </button>
            </div>

          </div>

          <nav class="nav" aria-label="Onboarding slides">
            ${Array.from({ length: 3 }, (_, i) => `
              <button class="dot${i === 0 ? ' active' : ''}" data-dot="${i}" aria-label="Go to slide ${i + 1}"></button>
            `).join('')}
          </nav>

        </div>
      </div>
    `;

    // Bind click events via delegation
    this.shadowRoot.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (target) {
        const action = target.dataset.action;
        if (action === 'next') this._next();
        if (action === 'prev') this._prev();
        if (action === 'complete') this._complete();
      }

      const dot = e.target.closest('[data-dot]');
      if (dot) {
        this._goTo(parseInt(dot.dataset.dot, 10));
      }

      if (e.target.closest('.skip-btn')) {
        this._skip();
      }
    });
  }
}

customElements.define('sc-onboarding', ScOnboarding);
