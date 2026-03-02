/**
 * Scratchy v2 — Email Widget Web Component
 * <sc-email> — Glassmorphism email panel with list, compose, detail views.
 *
 * Events:  email-close   (panel dismissed)
 * Attrs:   open          (show/hide)
 */

const EMAIL_CSS = /* css */ `
:host {
  --bg:#0d0b07; --surface:rgba(26,22,16,0.85); --surface-solid:#1a1610;
  --surface-hover:#252015; --border:rgba(249,166,2,0.10); --border-glass:rgba(249,166,2,0.08);
  --radius:8px; --radius-input:6px; --text:#f0ead6; --muted:#8a7e6a;
  --accent:#F9A602; --accent-hover:#DAA520; --accent-glow:rgba(249,166,2,0.30);
  --danger:#ef4444; --success:#22c55e; --focus-ring:0 0 0 2px rgba(249,166,2,0.3);
  --font:'Geist',system-ui,-apple-system,sans-serif;
  position:fixed; inset:0; z-index:5000; display:none; align-items:flex-start;
  justify-content:center; width:100%; height:100%; font-family:var(--font);
  font-size:14px; color:var(--text); overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
:host([open]) { display:flex; }
*,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }

.bg-mesh { position:fixed; inset:0; z-index:0; background:var(--bg); overflow:hidden; }
.bg-mesh::before,.bg-mesh::after {
  content:''; position:absolute; border-radius:50%; filter:blur(100px);
  opacity:0.35; animation:meshFloat 20s ease-in-out infinite alternate;
}
.bg-mesh::before { width:600px;height:600px;background:radial-gradient(circle,#F9A602 0%,transparent 70%);top:-15%;left:-10%; }
.bg-mesh::after { width:500px;height:500px;background:radial-gradient(circle,#DAA520 0%,transparent 70%);bottom:-20%;right:-10%;animation-delay:-10s;animation-direction:alternate-reverse; }
@keyframes meshFloat {
  0%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-30px) scale(1.08)}
  66%{transform:translate(-20px,20px) scale(0.95)} 100%{transform:translate(10px,-10px) scale(1.03)}
}

.panel {
  position:relative; z-index:1; width:100%; max-width:680px; height:100dvh;
  overflow-y:auto; overflow-x:hidden; padding:32px 20px 48px;
  scrollbar-width:thin; scrollbar-color:rgba(249,166,2,0.15) transparent;
  background:var(--surface); border:1px solid var(--border);
  border-radius:12px; margin:48px 0;
}
.panel::-webkit-scrollbar { width:6px; }
.panel::-webkit-scrollbar-track { background:transparent; }
.panel::-webkit-scrollbar-thumb { background:rgba(249,166,2,0.15); border-radius:3px; }

.header { display:flex; align-items:center; gap:12px; margin-bottom:24px; }
.icon-btn {
  display:flex; align-items:center; justify-content:center; width:40px; height:40px;
  background:rgba(255,255,255,0.04); border:1px solid var(--border-glass);
  border-radius:var(--radius); color:var(--muted); cursor:pointer;
  transition:background .2s,color .2s,border-color .2s; flex-shrink:0;
}
.icon-btn:hover { background:rgba(255,255,255,0.08); color:var(--text); border-color:rgba(255,255,255,0.14); }
.icon-btn:focus-visible { outline:none; box-shadow:var(--focus-ring); color:var(--text); }
.icon-btn svg { width:18px; height:18px; }
.header h1 {
  font-size:22px; font-weight:700; letter-spacing:-0.5px; flex:1;
  background:linear-gradient(135deg,#f0ead6 30%,#F9A602 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
.header-actions { display:flex; gap:8px; }

.section {
  background:var(--surface); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  border:1px solid var(--border-glass); border-radius:var(--radius);
  padding:24px 20px; margin-bottom:16px;
  box-shadow:0 0 0 1px rgba(255,255,255,0.03),0 8px 40px rgba(0,0,0,0.45),0 2px 12px rgba(0,0,0,0.25);
  animation:sIn .4s ease both;
}
@keyframes sIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

.empty { display:flex; flex-direction:column; align-items:center; padding:64px 24px; text-align:center; animation:sIn .4s ease both; }
.empty svg { width:56px; height:56px; color:var(--muted); margin-bottom:16px; opacity:.5; }
.empty h2 { font-size:17px; font-weight:600; margin-bottom:6px; }
.empty p { color:var(--muted); font-size:13px; margin-bottom:20px; }

.email-row {
  display:flex; align-items:center; gap:12px; padding:12px 16px;
  border-radius:var(--radius); cursor:pointer; transition:background .15s;
  border-bottom:1px solid var(--border-glass);
}
.email-row:last-child { border-bottom:none; }
.email-row:hover { background:var(--surface-hover); }
.email-row .col-main { flex:1; min-width:0; }
.email-row .to { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.email-row .subject { font-size:12px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
.email-row .meta { display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; }
.email-row .date { font-size:11px; color:var(--muted); white-space:nowrap; }

.badge { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; padding:2px 8px; border-radius:99px; }
.badge-draft  { background:rgba(249,166,2,0.15); color:#F9A602; }
.badge-sent   { background:rgba(34,197,94,0.15); color:#22c55e; }
.badge-failed { background:rgba(239,68,68,0.15); color:#ef4444; }

label.field { display:block; margin-bottom:14px; }
label.field .label-text { display:block; font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
input[type="text"],input[type="email"],textarea {
  width:100%; padding:10px 12px; background:rgba(255,255,255,0.04);
  border:1px solid var(--border-glass); border-radius:var(--radius-input);
  color:var(--text); font-family:var(--font); font-size:14px;
  transition:border-color .2s,box-shadow .2s; resize:vertical;
}
input:focus,textarea:focus { outline:none; border-color:var(--accent); box-shadow:var(--focus-ring); }
input.invalid { border-color:var(--danger); box-shadow:0 0 0 2px rgba(239,68,68,0.2); }
textarea { min-height:140px; line-height:1.5; }
.field-error { font-size:11px; color:var(--danger); margin-top:4px; display:none; }
.field-error.show { display:block; }

.btn {
  display:inline-flex; align-items:center; gap:6px; padding:10px 20px;
  border-radius:var(--radius); font-family:var(--font); font-size:13px;
  font-weight:600; cursor:pointer; border:1px solid transparent;
  transition:background .2s,border-color .2s,opacity .2s,transform .1s;
}
.btn:active { transform:scale(0.97); }
.btn:focus-visible { outline:none; box-shadow:var(--focus-ring); }
.btn:disabled { opacity:.5; cursor:not-allowed; pointer-events:none; }
.btn-primary { background:var(--accent); color:#0d0b07; }
.btn-primary:hover { background:var(--accent-hover); }
.btn-ghost { background:rgba(255,255,255,0.04); color:var(--text); border-color:var(--border-glass); }
.btn-ghost:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.14); }
.btn-danger { background:rgba(239,68,68,0.12); color:var(--danger); border-color:rgba(239,68,68,0.2); }
.btn-danger:hover { background:rgba(239,68,68,0.2); }
.btn-row { display:flex; gap:10px; margin-top:20px; }

.spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(13,11,7,0.3); border-top-color:#0d0b07; border-radius:50%; animation:spin .6s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }

.detail-field { margin-bottom:16px; }
.detail-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); margin-bottom:4px; }
.detail-value { font-size:14px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }

.loading-bar { height:2px; background:linear-gradient(90deg,transparent,var(--accent),transparent); background-size:200% 100%; animation:loadSlide 1.2s ease-in-out infinite; border-radius:1px; margin-bottom:16px; }
@keyframes loadSlide { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.toast {
  position:fixed; bottom:32px; left:50%; transform:translateX(-50%) translateY(20px);
  padding:10px 20px; border-radius:var(--radius); font-size:13px; font-weight:600;
  color:var(--text); background:var(--surface-solid); border:1px solid var(--border-glass);
  box-shadow:0 8px 32px rgba(0,0,0,0.5); opacity:0; pointer-events:none;
  transition:opacity .3s,transform .3s; z-index:9999;
}
.toast.visible { opacity:1; transform:translateX(-50%) translateY(0); }
.toast.toast-success { border-color:rgba(34,197,94,0.3); }
.toast.toast-error   { border-color:rgba(239,68,68,0.3); }

.recipient-warning { display:none; padding:8px 12px; margin-bottom:8px; background:rgba(243,156,18,0.1); border:1px solid rgba(243,156,18,0.3); border-radius:6px; color:#f39c12; font-size:12px; }
.recipient-warning.show { display:block; }
`;

const IC = {
  back:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
  compose: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  mail:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  send:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-11 11"/></svg>',
};

class ScEmail extends HTMLElement {
  static get observedAttributes() { return ['open']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._emails = [];
    this._view = 'list';       // list | compose | detail
    this._selected = null;
    this._sending = false;
    this._loading = false;
    this._composeState = null;
    this._toastTimer = null;
  }

  connectedCallback() {
    this._render();
    this._attachGlobalKeys();
  }

  disconnectedCallback() { this._detachGlobalKeys(); }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'open' && newVal !== null && oldVal === null) {
      this._view = 'list';
      this._selected = null;
      this._composeState = null;
      this._fetchEmails();
    }
  }

  /* ── data ──────────────────────────────────────────── */

  async _fetchEmails() {
    this._loading = true;
    this._render();
    try {
      const r = await fetch('/api/emails', { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      this._emails = await r.json();
    } catch {
      this._toast('Failed to load emails', 'error');
      this._emails = [];
    }
    this._loading = false;
    this._render();
  }

  async _createDraft(to, subject, body) {
    const r = await fetch('/api/emails', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    });
    if (!r.ok) throw new Error('Failed to create draft');
    return r.json();
  }

  async _sendEmail(id) {
    const r = await fetch(`/api/emails/${id}/send`, { method: 'POST', credentials: 'same-origin' });
    if (!r.ok) throw new Error('Failed to send');
    return r.json();
  }

  async _deleteEmail(id) {
    const r = await fetch(`/api/emails/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!r.ok) throw new Error('Failed to delete');
  }

  /* ── validation ────────────────────────────────────── */

  _validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim()); }

  /* ── keyboard ──────────────────────────────────────── */

  _onKey = (e) => {
    if (!this.hasAttribute('open')) return;
    if (e.key === 'Escape') {
      if (this._view !== 'list') {
        this._view = 'list';
        this._selected = null;
        this._composeState = null;
        this._render();
      } else {
        this._close();
      }
    }
  };
  _attachGlobalKeys() { document.addEventListener('keydown', this._onKey); }
  _detachGlobalKeys() { document.removeEventListener('keydown', this._onKey); }

  _close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('email-close', { bubbles: true }));
  }

  /* ── toast ─────────────────────────────────────────── */

  _toast(msg, type = 'success') {
    clearTimeout(this._toastTimer);
    const t = this.shadowRoot.querySelector('.toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast toast-${type} visible`;
    this._toastTimer = setTimeout(() => t.classList.remove('visible'), 3000);
  }

  /* ── helpers ───────────────────────────────────────── */

  _fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso), n = new Date();
    if (n - d < 86400000 && d.getDate() === n.getDate())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _saveCompose() {
    const r = this.shadowRoot;
    const to = r.querySelector('#email-to');
    const sub = r.querySelector('#email-subject');
    const body = r.querySelector('#email-body');
    if (to) this._composeState = { to: to.value, subject: sub?.value || '', body: body?.value || '' };
  }

  /* ── compose actions ───────────────────────────────── */

  async _handleSend() {
    const root = this.shadowRoot;
    const toInput = root.querySelector('#email-to');
    const toErr = root.querySelector('#to-error');
    const to = toInput?.value.trim() || '';
    const subject = root.querySelector('#email-subject')?.value.trim() || '';
    const body = root.querySelector('#email-body')?.value.trim() || '';

    toInput?.classList.remove('invalid');
    toErr?.classList.remove('show');
    if (!this._validEmail(to)) {
      toInput?.classList.add('invalid');
      toErr?.classList.add('show');
      toInput?.focus();
      return;
    }
    const verified = ['yabbo000666@gmail.com'];
    if (!verified.includes(to.toLowerCase())) {
      this._toast('Test mode — can only send to verified emails', 'error');
      this._sending = false;
      this._render();
      return;
    }
    this._composeState = { to, subject, body };
    this._sending = true;
    this._render();
    try {
      const draft = await this._createDraft(to, subject, body);
      await this._sendEmail(draft.id);
      this._toast('Email sent successfully');
      this._composeState = null;
      this._view = 'list';
      await this._fetchEmails();
    } catch (e) {
      this._toast(e.message || 'Send failed', 'error');
    }
    this._sending = false;
    this._render();
  }

  async _handleSaveDraft() {
    const root = this.shadowRoot;
    const toInput = root.querySelector('#email-to');
    const toErr = root.querySelector('#to-error');
    const to = toInput?.value.trim() || '';
    const subject = root.querySelector('#email-subject')?.value.trim() || '';
    const body = root.querySelector('#email-body')?.value.trim() || '';

    toInput?.classList.remove('invalid');
    toErr?.classList.remove('show');
    if (!this._validEmail(to)) {
      toInput?.classList.add('invalid');
      toErr?.classList.add('show');
      toInput?.focus();
      return;
    }
    try {
      await this._createDraft(to, subject, body);
      this._toast('Draft saved');
      this._composeState = null;
      this._view = 'list';
      await this._fetchEmails();
    } catch (e) {
      this._toast(e.message || 'Failed to save draft', 'error');
    }
  }

  async _handleDelete(id) {
    try {
      await this._deleteEmail(id);
      this._toast('Email deleted');
      this._view = 'list';
      this._selected = null;
      await this._fetchEmails();
    } catch (e) {
      this._toast(e.message || 'Delete failed', 'error');
    }
  }

  async _handleResend(em) {
    this._sending = true;
    this._render();
    try {
      await this._sendEmail(em.id);
      this._toast('Email sent successfully');
      await this._fetchEmails();
      this._selected = this._emails.find(e => e.id === em.id) || null;
      if (!this._selected) this._view = 'list';
    } catch (e) {
      this._toast(e.message || 'Send failed', 'error');
    }
    this._sending = false;
    this._render();
  }

  /* ── render ────────────────────────────────────────── */

  _render() {
    let body = '';
    if (this._view === 'list') body = this._listHTML();
    else if (this._view === 'compose') body = this._composeHTML();
    else if (this._view === 'detail') body = this._detailHTML();

    this.shadowRoot.innerHTML = `<style>${EMAIL_CSS}</style>
      <div class="bg-mesh"></div><div class="panel">${body}</div><div class="toast"></div>`;
    this._bind();
  }

  _listHTML() {
    const hdr = `<div class="header">
      <button class="icon-btn" data-action="close" title="Close">${IC.back}</button>
      <h1>Email</h1>
      <div class="header-actions"><button class="btn btn-primary" data-action="compose">${IC.compose} Compose</button></div>
    </div>`;

    if (this._loading) return hdr + '<div class="loading-bar"></div>';

    if (!this._emails.length) return hdr + `<div class="empty">
      ${IC.mail}<h2>No emails yet</h2><p>Compose your first email to get started.</p>
      <button class="btn btn-primary" data-action="compose">${IC.compose} Compose</button></div>`;

    const rows = this._emails.map((em, i) => `<div class="email-row" data-action="view" data-index="${i}">
      <div class="col-main">
        <div class="to">${this._esc(em.to)}</div>
        <div class="subject">${this._esc(em.subject || '(no subject)')}</div>
      </div>
      <div class="meta">
        <span class="badge badge-${em.status}">${em.status}</span>
        <span class="date">${this._fmtDate(em.sentAt || em.createdAt)}</span>
      </div>
    </div>`).join('');

    return hdr + `<div class="section">${rows}</div>`;
  }

  _composeHTML() {
    const d = this._sending ? 'disabled' : '';
    const cs = this._composeState || {};
    return `<div class="header">
      <button class="icon-btn" data-action="back" title="Back">${IC.back}</button><h1>Compose</h1>
    </div>
    ${this._sending ? '<div class="loading-bar"></div>' : ''}
    <div class="section">
      <label class="field"><span class="label-text">To</span>
        <input type="email" id="email-to" placeholder="recipient@example.com" ${d} value="${this._esc(cs.to || '')}">
        <div class="field-error" id="to-error">Please enter a valid email address</div>
        <div class="recipient-warning" id="recipient-warn"></div>
      </label>
      <label class="field"><span class="label-text">Subject</span>
        <input type="text" id="email-subject" placeholder="Subject (optional)" ${d} value="${this._esc(cs.subject || '')}">
      </label>
      <label class="field"><span class="label-text">Body</span>
        <textarea id="email-body" placeholder="Write your message…" ${d}>${this._esc(cs.body || '')}</textarea>
      </label>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="send" ${d}>
          ${this._sending ? '<span class="spinner"></span> Sending…' : IC.send + ' Send'}</button>
        <button class="btn btn-ghost" data-action="save-draft" ${d}>Save Draft</button>
      </div>
    </div>`;
  }

  _detailHTML() {
    const em = this._selected;
    if (!em) return '';
    const canResend = em.status === 'draft' || em.status === 'failed';
    const d = this._sending ? 'disabled' : '';
    return `<div class="header">
      <button class="icon-btn" data-action="back" title="Back">${IC.back}</button><h1>Email Detail</h1>
    </div>
    ${this._sending ? '<div class="loading-bar"></div>' : ''}
    <div class="section">
      <div class="detail-field"><div class="detail-label">To</div><div class="detail-value">${this._esc(em.to)}</div></div>
      <div class="detail-field"><div class="detail-label">Subject</div><div class="detail-value">${this._esc(em.subject || '(no subject)')}</div></div>
      <div class="detail-field"><div class="detail-label">Status</div><div class="detail-value"><span class="badge badge-${em.status}">${em.status}</span></div></div>
      <div class="detail-field"><div class="detail-label">${em.sentAt ? 'Sent' : 'Created'}</div><div class="detail-value">${new Date(em.sentAt || em.createdAt).toLocaleString()}</div></div>
      <div class="detail-field"><div class="detail-label">Body</div><div class="detail-value">${this._esc(em.body || '(empty)')}</div></div>
      <div class="btn-row">
        ${canResend ? `<button class="btn btn-primary" data-action="resend" ${d}>${this._sending ? '<span class="spinner"></span> Sending…' : IC.send + ' Send'}</button>` : ''}
        <button class="btn btn-danger" data-action="delete" ${d}>${IC.trash} Delete</button>
      </div>
    </div>`;
  }

  /* ── event binding ─────────────────────────────────── */

  _bind() {
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'close') return this._close();
      if (a === 'back') { this._view = 'list'; this._selected = null; this._composeState = null; return this._render(); }
      if (a === 'compose') {
        this._composeState = { to: '', subject: '', body: '' };
        this._view = 'compose';
        this._render();
        setTimeout(() => this.shadowRoot.querySelector('#email-to')?.focus(), 50);
        return;
      }
      if (a === 'send') { this._saveCompose(); return this._handleSend(); }
      if (a === 'save-draft') { this._saveCompose(); return this._handleSaveDraft(); }
      if (a === 'view') {
        const idx = parseInt(btn.dataset.index, 10);
        this._selected = this._emails[idx];
        if (this._selected) { this._view = 'detail'; this._render(); }
        return;
      }
      if (a === 'resend' && this._selected) return this._handleResend(this._selected);
      if (a === 'delete' && this._selected) return this._handleDelete(this._selected.id);
    });

    // Blur handler on To input — warn about unverified recipients
    if (this._view === 'compose') {
      const toInput = root.querySelector('#email-to');
      const warn = root.querySelector('#recipient-warn');
      if (toInput && warn) {
        toInput.addEventListener('blur', () => {
          const val = toInput.value.trim().toLowerCase();
          const verified = ['yabbo000666@gmail.com'];
          if (val && this._validEmail(val) && !verified.includes(val)) {
            warn.textContent = 'Test mode — only yabbo000666@gmail.com is verified';
            warn.classList.add('show');
          } else {
            warn.classList.remove('show');
          }
        });
      }
    }

    // Ctrl+Enter sends in compose
    if (this._view === 'compose') {
      root.querySelector('#email-body')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this._saveCompose();
          this._handleSend();
        }
      });
    }
  }
}

customElements.define('sc-email', ScEmail);
