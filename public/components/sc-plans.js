// sc-plans.js — Plan Choice / Pricing Landing Screen Web Component
// Self-contained, shadow DOM, no external dependencies.

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'mo',
    badge: null,
    highlight: false,
    features: [
      '50 messages / day',
      '100K tokens / day',
      'Sonnet only',
      '1 seat',
    ],
    cta: 'Get Started',
    ctaStyle: 'ghost',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 15,
    period: 'mo',
    badge: 'Most Popular',
    highlight: true,
    features: [
      '500 messages / day',
      '1M tokens / day',
      'Sonnet + Opus',
      '1 seat',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    ctaStyle: 'solid',
  },
  {
    id: 'team',
    name: 'Team',
    price: 39,
    period: 'mo',
    badge: null,
    highlight: false,
    features: [
      '2 000 messages / day',
      '5M tokens / day',
      'Sonnet + Opus',
      '5 seats',
      'Admin dashboard',
    ],
    cta: 'Contact Sales',
    ctaStyle: 'outline',
  },
  {
    id: 'byok',
    name: 'BYOK',
    price: 5,
    period: 'mo',
    badge: 'Power User',
    highlight: false,
    features: [
      'Unlimited messages',
      'Unlimited tokens',
      'All models',
      '1 seat',
      'Bring your own API key',
    ],
    cta: 'Configure',
    ctaStyle: 'ghost',
  },
];

const FAQS = [
  {
    q: 'How does billing work?',
    a: 'You are billed at the start of each billing cycle — monthly or annually. Annual plans are charged upfront at a 20% discount. All prices are in EUR and exclude applicable taxes.',
  },
  {
    q: 'Can I cancel or change my plan at any time?',
    a: 'Yes. You can upgrade, downgrade, or cancel from your account settings at any time. When you cancel, you keep access until the end of your current billing period. No refunds for partial periods.',
  },
  {
    q: 'What is BYOK (Bring Your Own Key)?',
    a: 'BYOK lets you connect your own API keys from providers like OpenAI, Anthropic, or Google. You pay the provider directly for token usage, and we charge a flat €5/mo platform fee with no message or token limits.',
  },
  {
    q: 'Do you offer discounts for startups or education?',
    a: 'Yes! We offer 50% off Pro and Team plans for verified students, educators, and early-stage startups. Contact us at support@scratchy.dev with proof of eligibility.',
  },
];

const ANNUAL_DISCOUNT = 0.8; // 20 % off

class ScPlans extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._interval = 'monthly'; // 'monthly' | 'annual'
    this._openFaq = null;       // index of open FAQ or null
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  connectedCallback() {
    this._render();
    this._bindEvents();
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                          */
  /* ------------------------------------------------------------------ */

  _render() {
    this.shadowRoot.innerHTML = /* html */ `
      <style>${ScPlans._styles()}</style>
      <section class="plans-root" aria-label="Pricing plans">
        <header class="header">
          <h2 class="title">Simple, transparent pricing</h2>
          <p class="subtitle">Start free. Scale when you're ready.</p>
          ${this._renderToggle()}
        </header>
        <div class="grid" role="list">
          ${PLANS.map((p, i) => this._renderCard(p, i)).join('')}
        </div>
        <section class="faq-section" aria-label="Frequently asked questions">
          <h3 class="faq-heading">Frequently Asked Questions</h3>
          <div class="faq-list">
            ${FAQS.map((f, i) => this._renderFaq(f, i)).join('')}
          </div>
        </section>
      </section>
    `;
  }

  _renderToggle() {
    const isAnnual = this._interval === 'annual';
    return /* html */ `
      <div class="toggle-wrap" role="radiogroup" aria-label="Billing interval">
        <button
          class="toggle-btn ${!isAnnual ? 'active' : ''}"
          role="radio"
          aria-checked="${!isAnnual}"
          data-interval="monthly"
        >Monthly</button>
        <button
          class="toggle-btn ${isAnnual ? 'active' : ''}"
          role="radio"
          aria-checked="${isAnnual}"
          data-interval="annual"
        >Annual <span class="save-badge">-20%</span></button>
      </div>
    `;
  }

  _renderCard(plan, index) {
    const price = this._priceFor(plan);
    const isHighlight = plan.highlight;
    return /* html */ `
      <article
        class="card ${isHighlight ? 'card--highlight' : ''}"
        role="listitem"
        style="--anim-delay:${index * 100}ms"
        data-plan="${plan.id}"
      >
        ${plan.badge ? `<span class="badge ${isHighlight ? 'badge--accent' : 'badge--muted'}">${plan.badge}</span>` : '<span class="badge-spacer"></span>'}
        <h3 class="card-name">${plan.name}</h3>
        <div class="card-price-row">
          <span class="card-currency">€</span>
          <span class="card-price" data-plan-id="${plan.id}">${price}</span>
        </div>
        <span class="card-period">per ${this._interval === 'annual' ? 'month, billed annually' : 'month'}</span>
        <ul class="features">
          ${plan.features.map(f => `
            <li class="feature">
              <svg class="check-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${f}
            </li>
          `).join('')}
        </ul>
        <button
          class="cta cta--${plan.ctaStyle}"
          data-plan-id="${plan.id}"
          aria-label="${plan.cta} — ${plan.name} plan"
        >${plan.cta}</button>
      </article>
    `;
  }

  _renderFaq(faq, index) {
    const isOpen = this._openFaq === index;
    return /* html */ `
      <details class="faq-item" ${isOpen ? 'open' : ''} data-faq-index="${index}">
        <summary class="faq-q">
          <span>${faq.q}</span>
          <svg class="faq-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </summary>
        <div class="faq-a">${faq.a}</div>
      </details>
    `;
  }

  /* ------------------------------------------------------------------ */
  /*  Events                                                             */
  /* ------------------------------------------------------------------ */

  _bindEvents() {
    const root = this.shadowRoot;

    // Interval toggle
    root.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.interval;
        if (next === this._interval) return;
        this._interval = next;
        this._updateToggle();
        this._updatePrices();
      });
    });

    // CTA buttons
    root.querySelectorAll('.cta').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('plan-selected', {
          bubbles: true,
          composed: true,
          detail: { planId: btn.dataset.planId, interval: this._interval },
        }));
      });
    });

    // FAQ accordion
    root.querySelectorAll('.faq-item').forEach(det => {
      det.addEventListener('toggle', () => {
        const idx = Number(det.dataset.faqIndex);
        this._openFaq = det.open ? idx : null;
        this.dispatchEvent(new CustomEvent('faq-toggle', {
          bubbles: true,
          composed: true,
          detail: { index: idx, open: det.open, question: FAQS[idx].q },
        }));
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Updates (no full re-render)                                        */
  /* ------------------------------------------------------------------ */

  _updateToggle() {
    const isAnnual = this._interval === 'annual';
    this.shadowRoot.querySelectorAll('.toggle-btn').forEach(btn => {
      const match = btn.dataset.interval === this._interval;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-checked', String(match));
    });
    // Update period labels
    this.shadowRoot.querySelectorAll('.card-period').forEach(el => {
      el.textContent = isAnnual ? 'per month, billed annually' : 'per month';
    });
  }

  _updatePrices() {
    PLANS.forEach(plan => {
      const el = this.shadowRoot.querySelector(`.card-price[data-plan-id="${plan.id}"]`);
      if (!el) return;
      const target = this._priceFor(plan);
      const current = Number(el.textContent);
      this._animatePrice(el, current, target);
    });
  }

  _animatePrice(el, from, to) {
    if (from === to) return;
    const duration = 300;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = Math.round(from + (to - from) * ease);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  _priceFor(plan) {
    if (plan.price === 0) return 0;
    if (this._interval === 'annual') return Math.round(plan.price * ANNUAL_DISCOUNT);
    return plan.price;
  }

  /* ------------------------------------------------------------------ */
  /*  Styles                                                             */
  /* ------------------------------------------------------------------ */

  static _styles() {
    return /* css */ `
      /* === Reset & Host === */
      :host {
        display: block;
        font-family: 'Geist', system-ui, -apple-system, sans-serif;
        font-size: 14px;
        color: #e4e4e7;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* === Root === */
      .plans-root {
        max-width: 1200px;
        margin: 0 auto;
        padding: 64px 24px 80px;
      }

      /* === Header === */
      .header {
        text-align: center;
        margin-bottom: 48px;
      }
      .title {
        font-size: 32px;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 8px;
        color: #e4e4e7;
      }
      .subtitle {
        font-size: 16px;
        color: #71717a;
        margin-bottom: 28px;
      }

      /* === Toggle === */
      .toggle-wrap {
        display: inline-flex;
        background: #111118;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        padding: 3px;
        gap: 2px;
      }
      .toggle-btn {
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        padding: 8px 18px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #71717a;
        cursor: pointer;
        transition: color 200ms ease, background 200ms ease;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .toggle-btn.active {
        background: #1a1a24;
        color: #e4e4e7;
      }
      .toggle-btn:focus-visible {
        outline: 2px solid #6366f1;
        outline-offset: 2px;
      }
      .save-badge {
        font-size: 11px;
        font-weight: 600;
        color: #34d399;
        background: rgba(52,211,153,0.12);
        padding: 2px 6px;
        border-radius: 4px;
      }

      /* === Grid === */
      .grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        align-items: start;
      }
      @media (max-width: 1024px) {
        .grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 639px) {
        .grid { grid-template-columns: 1fr; max-width: 400px; margin: 0 auto; }
      }

      /* === Card === */
      .card {
        position: relative;
        background: #111118;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px;
        padding: 28px 24px 24px;
        display: flex;
        flex-direction: column;
        transition: transform 250ms ease, border-color 250ms ease, box-shadow 250ms ease;
        animation: card-enter 500ms ease both;
        animation-delay: var(--anim-delay, 0ms);
      }
      @keyframes card-enter {
        from { opacity: 0; transform: translateY(24px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .card { animation: none; }
      }

      @media (hover: hover) {
        .card:hover {
          transform: translateY(-4px);
          border-color: rgba(255,255,255,0.12);
        }
        .card--highlight:hover {
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 0 24px rgba(99,102,241,0.18);
        }
      }

      .card--highlight {
        border-color: rgba(99,102,241,0.35);
        box-shadow: 0 0 20px rgba(99,102,241,0.10);
      }

      /* === Badge === */
      .badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 3px 10px;
        border-radius: 20px;
        margin-bottom: 16px;
        width: fit-content;
      }
      .badge--accent {
        background: rgba(99,102,241,0.14);
        color: #818cf8;
      }
      .badge--muted {
        background: rgba(251,191,36,0.12);
        color: #fbbf24;
      }
      .badge-spacer {
        display: block;
        height: 22px;
        margin-bottom: 16px;
      }

      /* === Card content === */
      .card-name {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #e4e4e7;
      }
      .card-price-row {
        display: flex;
        align-items: baseline;
        gap: 2px;
        margin-bottom: 2px;
      }
      .card-currency {
        font-size: 22px;
        font-weight: 600;
        color: #71717a;
        align-self: flex-start;
        margin-top: 4px;
      }
      .card-price {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 48px;
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1;
        color: #e4e4e7;
      }
      .card-period {
        font-size: 13px;
        color: #71717a;
        margin-bottom: 24px;
      }

      /* === Features === */
      .features {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 28px;
        flex-grow: 1;
      }
      .feature {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #a1a1aa;
        line-height: 1.4;
      }
      .check-icon {
        width: 16px;
        height: 16px;
        color: #34d399;
        flex-shrink: 0;
      }

      /* === CTA Buttons === */
      .cta {
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
        min-height: 44px;
        width: 100%;
        text-align: center;
        border: 1.5px solid transparent;
      }
      .cta:focus-visible {
        outline: 2px solid #6366f1;
        outline-offset: 2px;
      }

      /* Ghost */
      .cta--ghost {
        background: transparent;
        border-color: rgba(255,255,255,0.10);
        color: #e4e4e7;
      }
      @media (hover: hover) {
        .cta--ghost:hover {
          background: #1a1a24;
          border-color: rgba(255,255,255,0.16);
        }
      }

      /* Solid (accent) */
      .cta--solid {
        background: #6366f1;
        border-color: #6366f1;
        color: #fff;
      }
      @media (hover: hover) {
        .cta--solid:hover {
          background: #4f46e5;
          border-color: #4f46e5;
          box-shadow: 0 0 16px rgba(99,102,241,0.25);
        }
      }

      /* Outline (accent) */
      .cta--outline {
        background: transparent;
        border-color: #6366f1;
        color: #818cf8;
      }
      @media (hover: hover) {
        .cta--outline:hover {
          background: rgba(99,102,241,0.08);
          border-color: #818cf8;
        }
      }

      /* === FAQ Section === */
      .faq-section {
        margin-top: 72px;
        max-width: 680px;
        margin-left: auto;
        margin-right: auto;
      }
      .faq-heading {
        font-size: 22px;
        font-weight: 700;
        text-align: center;
        margin-bottom: 28px;
        color: #e4e4e7;
        letter-spacing: -0.01em;
      }
      .faq-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .faq-item {
        background: #111118;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        overflow: hidden;
        transition: border-color 200ms ease;
      }
      .faq-item[open] {
        border-color: rgba(255,255,255,0.10);
      }
      .faq-q {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
        font-size: 14px;
        font-weight: 600;
        color: #e4e4e7;
        cursor: pointer;
        list-style: none;
        min-height: 44px;
        user-select: none;
        -webkit-user-select: none;
      }
      .faq-q::-webkit-details-marker { display: none; }
      .faq-q::marker { content: ''; }
      .faq-q:focus-visible {
        outline: 2px solid #6366f1;
        outline-offset: -2px;
        border-radius: 8px;
      }
      .faq-chevron {
        width: 16px;
        height: 16px;
        color: #71717a;
        flex-shrink: 0;
        transition: transform 250ms ease;
      }
      .faq-item[open] .faq-chevron {
        transform: rotate(180deg);
      }
      @media (prefers-reduced-motion: reduce) {
        .faq-chevron { transition: none; }
      }
      .faq-a {
        padding: 0 20px 16px;
        font-size: 13px;
        line-height: 1.65;
        color: #a1a1aa;
      }

      /* === Responsive tweaks === */
      @media (max-width: 639px) {
        .plans-root { padding: 40px 16px 56px; }
        .title { font-size: 24px; }
        .subtitle { font-size: 14px; }
        .card { padding: 24px 20px 20px; }
        .card-price { font-size: 40px; }
        .faq-section { margin-top: 48px; }
      }
    `;
  }
}

customElements.define('sc-plans', ScPlans);
