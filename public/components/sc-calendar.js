/**
 * Scratchy v2 — Calendar Widget Web Component
 * <sc-calendar> — Dark glassmorphism monthly calendar with event management.
 *
 * Attributes: open
 * Events:     calendar-close
 */

const CAL_COLORS = [
  { name: 'blue',   hex: '#3b82f6' },
  { name: 'green',  hex: '#22c55e' },
  { name: 'red',    hex: '#ef4444' },
  { name: 'amber',  hex: '#f59e0b' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'pink',   hex: '#ec4899' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const CAL_STYLES = /* css */ `
:host {
  --bg:            #0d0b07;
  --surface:       rgba(26,22,16,0.85);
  --surface-solid: #1a1610;
  --surface-hover: #252015;
  --border:        rgba(249,166,2,0.10);
  --border-glass:  rgba(249,166,2,0.08);
  --radius:        8px;
  --text:          #f0ead6;
  --muted:         #8a7e6a;
  --accent:        #F9A602;
  --accent-hover:  #DAA520;
  --accent-glow:   rgba(249,166,2,0.30);
  --danger:        #ef4444;
  --success:       #22c55e;
  --focus-ring:    0 0 0 2px rgba(249,166,2,0.3);
  --font:          'Geist', system-ui, -apple-system, sans-serif;

  position: fixed;
  inset: 0;
  z-index: 5000;
  display: none;
  align-items: center;
  justify-content: center;
  font-family: var(--font);
  font-size: 14px;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
:host([open]) { display: flex; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ─── backdrop ─────────────────────────────────────────── */
.backdrop {
  position: fixed; inset: 0; z-index: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ─── main panel ───────────────────────────────────────── */
.panel {
  position: relative; z-index: 1;
  width: 95%; max-width: 520px;
  max-height: 90dvh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(249,166,2,0.05);
  animation: calSlideUp 0.25s ease-out;
}
@keyframes calSlideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ─── header ───────────────────────────────────────────── */
.cal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}
.cal-header h2 { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.cal-nav { display: flex; align-items: center; gap: 4px; }
.nav-btn, .close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  color: var(--muted); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.nav-btn:hover, .close-btn:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text);
}
.nav-btn:focus-visible, .close-btn:focus-visible {
  outline: none; box-shadow: var(--focus-ring);
}
.month-label {
  min-width: 140px; text-align: center;
  font-size: 15px; font-weight: 600; color: var(--text);
  user-select: none;
}
.today-chip {
  font-size: 11px; padding: 3px 8px;
  background: rgba(249,166,2,0.12); color: var(--accent);
  border-radius: 12px; cursor: pointer;
  border: 1px solid rgba(249,166,2,0.15);
  transition: background 0.15s;
}
.today-chip:hover { background: rgba(249,166,2,0.2); }

/* ─── grid ─────────────────────────────────────────────── */
.cal-body { flex: 1; overflow-y: auto; padding: 8px 16px 16px; }
.cal-body::-webkit-scrollbar { width: 5px; }
.cal-body::-webkit-scrollbar-thumb { background: rgba(249,166,2,0.12); border-radius: 3px; }

.day-names {
  display: grid; grid-template-columns: repeat(7, 1fr);
  gap: 2px; margin-bottom: 4px;
}
.day-names span {
  text-align: center; font-size: 11px; font-weight: 600;
  color: var(--muted); padding: 4px 0; text-transform: uppercase;
  letter-spacing: 0.05em;
}
.month-grid {
  display: grid; grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.day-cell {
  aspect-ratio: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start;
  padding: 6px 2px 4px;
  border-radius: 6px; cursor: pointer;
  transition: background 0.12s;
  position: relative;
  min-height: 44px;
}
.day-cell:hover { background: rgba(255,255,255,0.05); }
.day-cell.outside { opacity: 0.25; pointer-events: none; }
.day-cell .day-num {
  font-size: 13px; font-weight: 500; line-height: 1;
  color: var(--text);
}
.day-cell.today .day-num {
  background: var(--accent); color: var(--bg);
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 12px;
}
.day-cell.selected {
  background: rgba(249,166,2,0.08);
  outline: 1.5px solid rgba(249,166,2,0.3);
}
.dots {
  display: flex; gap: 3px; margin-top: auto;
  flex-wrap: wrap; justify-content: center; max-width: 100%;
}
.dots .dot {
  width: 5px; height: 5px; border-radius: 50%;
}

/* ─── day detail panel ─────────────────────────────────── */
.day-detail {
  border-top: 1px solid var(--border);
  padding: 14px 20px 16px;
  animation: calFadeIn 0.15s ease-out;
}
@keyframes calFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.detail-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.detail-header h3 {
  font-size: 14px; font-weight: 600; color: var(--text);
}
.add-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  background: rgba(249,166,2,0.12); color: var(--accent);
  border: 1px solid rgba(249,166,2,0.18);
  border-radius: 6px; cursor: pointer;
  font-size: 16px; font-weight: 700;
  transition: background 0.15s;
}
.add-btn:hover { background: rgba(249,166,2,0.22); }

.event-list { display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto; }
.event-list::-webkit-scrollbar { width: 4px; }
.event-list::-webkit-scrollbar-thumb { background: rgba(249,166,2,0.1); border-radius: 2px; }
.event-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 6px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  transition: background 0.12s;
}
.event-item:hover { background: rgba(255,255,255,0.06); }
.event-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.event-time {
  font-size: 12px; color: var(--muted); min-width: 44px;
  font-variant-numeric: tabular-nums;
}
.event-title { font-size: 13px; color: var(--text); flex: 1; }
.event-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.12s; }
.event-item:hover .event-actions { opacity: 1; }
.evt-btn {
  width: 24px; height: 24px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--muted);
  cursor: pointer; font-size: 12px;
  transition: background 0.12s, color 0.12s;
}
.evt-btn:hover { background: rgba(255,255,255,0.08); color: var(--text); }
.evt-btn.del:hover { color: var(--danger); }

.empty-state {
  text-align: center; padding: 16px 0;
  color: var(--muted); font-size: 13px;
}
.empty-state button {
  margin-top: 8px; padding: 6px 14px;
  background: rgba(249,166,2,0.12); color: var(--accent);
  border: 1px solid rgba(249,166,2,0.18); border-radius: 6px;
  cursor: pointer; font-size: 12px; font-family: var(--font);
  transition: background 0.15s;
}
.empty-state button:hover { background: rgba(249,166,2,0.22); }

/* ─── event form ───────────────────────────────────────── */
.form-overlay {
  position: absolute; inset: 0; z-index: 10;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  animation: calFadeIn 0.15s ease-out;
}
.event-form {
  width: 90%; max-width: 340px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
}
.event-form h3 {
  font-size: 15px; font-weight: 600; margin-bottom: 14px;
  color: var(--text);
}
.form-group { margin-bottom: 12px; }
.form-group label {
  display: block; font-size: 11px; font-weight: 600;
  color: var(--muted); margin-bottom: 5px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.form-group input[type="text"],
.form-group input[type="time"] {
  width: 100%; padding: 8px 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 6px; color: var(--text);
  font-family: var(--font); font-size: 13px;
  outline: none; transition: border-color 0.15s;
}
.form-group input:focus {
  border-color: rgba(249,166,2,0.35);
  box-shadow: var(--focus-ring);
}
.time-row { display: flex; gap: 8px; }
.time-row .form-group { flex: 1; }

.allday-row {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 14px;
}
.allday-row label {
  font-size: 12px; color: var(--muted); cursor: pointer;
}
.toggle-track {
  width: 36px; height: 20px; border-radius: 10px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
  position: relative; cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-track.on {
  background: rgba(249,166,2,0.3);
  border-color: rgba(249,166,2,0.4);
}
.toggle-track::after {
  content: ''; position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--muted);
  transition: transform 0.2s, background 0.2s;
}
.toggle-track.on::after {
  transform: translateX(16px);
  background: var(--accent);
}

.color-picks {
  display: flex; gap: 6px; margin-bottom: 16px;
}
.color-picks label { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
.color-row { display: flex; gap: 6px; }
.cpick {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
}
.cpick:hover { transform: scale(1.12); }
.cpick.active { border-color: var(--text); transform: scale(1.12); }

.form-actions {
  display: flex; gap: 8px; justify-content: flex-end;
}
.btn-cancel, .btn-save {
  padding: 7px 16px; border-radius: 6px;
  font-family: var(--font); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background 0.15s;
  border: none;
}
.btn-cancel {
  background: rgba(255,255,255,0.06); color: var(--muted);
}
.btn-cancel:hover { background: rgba(255,255,255,0.1); color: var(--text); }
.btn-save {
  background: var(--accent); color: var(--bg); font-weight: 600;
}
.btn-save:hover { background: var(--accent-hover); }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
`;

class ScCalendar extends HTMLElement {
  static get observedAttributes() { return ['open']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    const now = new Date();
    this._year = now.getFullYear();
    this._month = now.getMonth();
    this._selectedDate = null;
    this._events = [];
    this._formOpen = false;
    this._editId = null;
  }

  connectedCallback() {
    this._render();
    this._fetchEvents();
    this.shadowRoot.addEventListener('keydown', e => this._onKey(e));
  }

  attributeChangedCallback(name) {
    if (name === 'open' && this.hasAttribute('open')) {
      this._fetchEvents();
    }
  }

  /* ── API helpers ─────────────────────────────────────── */

  async _fetchEvents() {
    const start = new Date(this._year, this._month, 1);
    const end = new Date(this._year, this._month + 1, 0, 23, 59, 59);
    try {
      const r = await fetch(
        `/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`,
        { credentials: 'same-origin' }
      );
      if (r.ok) this._events = await r.json();
    } catch { /* offline / no backend */ }
    this._renderGrid();
    this._renderDetail();
  }

  async _createEvent(data) {
    try {
      const r = await fetch('/api/calendar', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (r.ok) { this._formOpen = false; this._editId = null; await this._fetchEvents(); }
    } catch { /* */ }
  }

  async _updateEvent(id, data) {
    try {
      const r = await fetch(`/api/calendar/${id}`, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (r.ok) { this._formOpen = false; this._editId = null; await this._fetchEvents(); }
    } catch { /* */ }
  }

  async _deleteEvent(id) {
    try {
      await fetch(`/api/calendar/${id}`, {
        method: 'DELETE', credentials: 'same-origin',
      });
      await this._fetchEvents();
    } catch { /* */ }
  }

  /* ── keyboard ────────────────────────────────────────── */

  _onKey(e) {
    if (e.key === 'Escape') {
      if (this._formOpen) { this._formOpen = false; this._editId = null; this._renderForm(); return; }
      this._close();
    }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); this._prevMonth(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this._nextMonth(); }
  }

  /* ── navigation ──────────────────────────────────────── */

  _prevMonth() {
    this._month--;
    if (this._month < 0) { this._month = 11; this._year--; }
    this._selectedDate = null;
    this._fetchEvents();
  }

  _nextMonth() {
    this._month++;
    if (this._month > 11) { this._month = 0; this._year++; }
    this._selectedDate = null;
    this._fetchEvents();
  }

  _goToday() {
    const now = new Date();
    this._year = now.getFullYear();
    this._month = now.getMonth();
    this._selectedDate = this._dateKey(now);
    this._fetchEvents();
  }

  _close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('calendar-close', { bubbles: true }));
  }

  /* ── helpers ─────────────────────────────────────────── */

  _dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  _eventsForDate(key) {
    return this._events.filter(ev => {
      const s = new Date(ev.startTime);
      return this._dateKey(s) === key;
    });
  }

  _fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  _fmtDateLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /* ── main render ─────────────────────────────────────── */

  _render() {
    const s = this.shadowRoot;
    s.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = CAL_STYLES;
    s.appendChild(style);

    // backdrop
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.addEventListener('click', () => this._close());
    s.appendChild(bd);

    // panel
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('tabindex', '-1');

    // header
    panel.innerHTML = `
      <div class="cal-header">
        <div class="cal-nav">
          <button class="nav-btn" data-dir="prev" aria-label="Previous month">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2L4 7l5 5"/></svg>
          </button>
          <span class="month-label"></span>
          <button class="nav-btn" data-dir="next" aria-label="Next month">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 2l5 5-5 5"/></svg>
          </button>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="today-chip">Today</button>
          <button class="close-btn" aria-label="Close">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l8 8M11 3l-8 8"/></svg>
          </button>
        </div>
      </div>
      <div class="cal-body">
        <div class="day-names"></div>
        <div class="month-grid"></div>
      </div>
      <div class="day-detail" style="display:none"></div>
    `;

    // wire header buttons
    panel.querySelector('[data-dir="prev"]').addEventListener('click', () => this._prevMonth());
    panel.querySelector('[data-dir="next"]').addEventListener('click', () => this._nextMonth());
    panel.querySelector('.today-chip').addEventListener('click', () => this._goToday());
    panel.querySelector('.close-btn').addEventListener('click', () => this._close());

    // day names
    const dn = panel.querySelector('.day-names');
    DAYS.forEach(d => { const sp = document.createElement('span'); sp.textContent = d; dn.appendChild(sp); });

    s.appendChild(panel);
    this._panel = panel;

    // focus for key events
    setTimeout(() => panel.focus(), 50);
  }

  /* ── grid render ─────────────────────────────────────── */

  _renderGrid() {
    if (!this._panel) return;
    this._panel.querySelector('.month-label').textContent = `${MONTHS[this._month]} ${this._year}`;

    const grid = this._panel.querySelector('.month-grid');
    grid.innerHTML = '';

    const first = new Date(this._year, this._month, 1);
    const last = new Date(this._year, this._month + 1, 0);
    // Monday=0 offset
    let startDay = (first.getDay() + 6) % 7;

    const today = this._dateKey(new Date());
    const cells = [];

    // previous month fill
    const prevLast = new Date(this._year, this._month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({ day: prevLast.getDate() - i, outside: true, key: null });
    }
    // current month
    for (let d = 1; d <= last.getDate(); d++) {
      const key = this._dateKey(new Date(this._year, this._month, d));
      cells.push({ day: d, outside: false, key });
    }
    // next month fill
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        cells.push({ day: i, outside: true, key: null });
      }
    }

    cells.forEach(c => {
      const el = document.createElement('div');
      el.className = 'day-cell';
      if (c.outside) el.classList.add('outside');
      if (c.key === today) el.classList.add('today');
      if (c.key === this._selectedDate) el.classList.add('selected');

      const num = document.createElement('span');
      num.className = 'day-num';
      num.textContent = c.day;
      el.appendChild(num);

      // event dots
      if (c.key) {
        const evts = this._eventsForDate(c.key);
        if (evts.length) {
          const dots = document.createElement('div');
          dots.className = 'dots';
          // max 4 dots
          evts.slice(0, 4).forEach(ev => {
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = ev.color || '#f59e0b';
            dots.appendChild(dot);
          });
          el.appendChild(dots);
        }
        el.addEventListener('click', () => this._selectDate(c.key));
      }
      grid.appendChild(el);
    });
  }

  _selectDate(key) {
    this._selectedDate = key;
    this._renderGrid();
    this._renderDetail();
  }

  /* ── day detail render ───────────────────────────────── */

  _renderDetail() {
    const container = this._panel.querySelector('.day-detail');
    if (!this._selectedDate) { container.style.display = 'none'; return; }
    container.style.display = '';
    const evts = this._eventsForDate(this._selectedDate);

    let html = `
      <div class="detail-header">
        <h3>${this._fmtDateLabel(this._selectedDate)}</h3>
        <button class="add-btn" aria-label="Add event">+</button>
      </div>
    `;

    if (evts.length) {
      html += '<div class="event-list">';
      evts.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).forEach(ev => {
        const time = ev.allDay ? 'All day' : this._fmtTime(ev.startTime);
        html += `
          <div class="event-item">
            <span class="event-dot" style="background:${ev.color || '#f59e0b'}"></span>
            <span class="event-time">${time}</span>
            <span class="event-title">${this._esc(ev.title)}</span>
            <div class="event-actions">
              <button class="evt-btn edit" data-id="${ev.id}" aria-label="Edit">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 2l3 3-6 6H1V8z"/></svg>
              </button>
              <button class="evt-btn del" data-id="${ev.id}" aria-label="Delete">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4h8M4 4V2h4v2M5 6v3M7 6v3"/></svg>
              </button>
            </div>
          </div>
        `;
      });
      html += '</div>';
    } else {
      html += `
        <div class="empty-state">
          <div>No events this day</div>
          <button class="create-empty">+ Create event</button>
        </div>
      `;
    }

    container.innerHTML = html;

    // wire buttons
    container.querySelector('.add-btn')?.addEventListener('click', () => this._openForm());
    container.querySelector('.create-empty')?.addEventListener('click', () => this._openForm());
    container.querySelectorAll('.evt-btn.edit').forEach(b =>
      b.addEventListener('click', () => this._openForm(b.dataset.id))
    );
    container.querySelectorAll('.evt-btn.del').forEach(b =>
      b.addEventListener('click', () => this._deleteEvent(b.dataset.id))
    );
  }

  _esc(s) {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  /* ── event form ──────────────────────────────────────── */

  _openForm(editId) {
    this._formOpen = true;
    this._editId = editId || null;
    this._renderForm();
  }

  _renderForm() {
    // remove existing overlay
    this._panel.querySelector('.form-overlay')?.remove();
    if (!this._formOpen) return;

    const existing = this._editId ? this._events.find(e => e.id === this._editId) : null;
    const overlay = document.createElement('div');
    overlay.className = 'form-overlay';

    const defaultColor = existing?.color || CAL_COLORS[3].hex; // amber default
    const allDay = existing?.allDay || false;

    overlay.innerHTML = `
      <div class="event-form">
        <h3>${existing ? 'Edit Event' : 'New Event'}</h3>
        <div class="form-group">
          <label>Title</label>
          <input type="text" class="f-title" placeholder="Event title…" value="${this._esc(existing?.title || '')}" />
        </div>
        <div class="allday-row">
          <div class="toggle-track ${allDay ? 'on' : ''}" data-field="allday"></div>
          <label>All day</label>
        </div>
        <div class="time-row" style="${allDay ? 'display:none' : ''}">
          <div class="form-group">
            <label>Start</label>
            <input type="time" class="f-start" value="${existing ? this._fmtTime(existing.startTime) : '09:00'}" />
          </div>
          <div class="form-group">
            <label>End</label>
            <input type="time" class="f-end" value="${existing?.endTime ? this._fmtTime(existing.endTime) : '10:00'}" />
          </div>
        </div>
        <div class="color-picks">
          <div>
            <label>Color</label>
            <div class="color-row">
              ${CAL_COLORS.map(c => `<div class="cpick ${c.hex === defaultColor ? 'active' : ''}" data-color="${c.hex}" style="background:${c.hex}"></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-save">Save</button>
        </div>
      </div>
    `;

    // events
    let selectedColor = defaultColor;
    let isAllDay = allDay;

    const toggle = overlay.querySelector('.toggle-track');
    const timeRow = overlay.querySelector('.time-row');
    toggle.addEventListener('click', () => {
      isAllDay = !isAllDay;
      toggle.classList.toggle('on', isAllDay);
      timeRow.style.display = isAllDay ? 'none' : '';
    });

    overlay.querySelectorAll('.cpick').forEach(cp => {
      cp.addEventListener('click', () => {
        overlay.querySelectorAll('.cpick').forEach(x => x.classList.remove('active'));
        cp.classList.add('active');
        selectedColor = cp.dataset.color;
      });
    });

    overlay.querySelector('.btn-cancel').addEventListener('click', () => {
      this._formOpen = false; this._editId = null; this._renderForm();
    });

    overlay.querySelector('.btn-save').addEventListener('click', () => {
      const title = overlay.querySelector('.f-title').value.trim();
      if (!title) { overlay.querySelector('.f-title').focus(); return; }

      const [sy, sm, sd] = this._selectedDate.split('-').map(Number);
      const startVal = overlay.querySelector('.f-start').value || '09:00';
      const endVal = overlay.querySelector('.f-end').value || '10:00';

      const [sh, smn] = startVal.split(':').map(Number);
      const [eh, emn] = endVal.split(':').map(Number);

      const startTime = new Date(sy, sm - 1, sd, isAllDay ? 0 : sh, isAllDay ? 0 : smn).toISOString();
      const endTime = isAllDay ? undefined : new Date(sy, sm - 1, sd, eh, emn).toISOString();

      const payload = { title, startTime, allDay: isAllDay, color: selectedColor };
      if (endTime) payload.endTime = endTime;

      if (this._editId) {
        this._updateEvent(this._editId, payload);
      } else {
        this._createEvent(payload);
      }
    });

    // close on backdrop click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { this._formOpen = false; this._editId = null; this._renderForm(); }
    });

    this._panel.appendChild(overlay);
    setTimeout(() => overlay.querySelector('.f-title').focus(), 50);
  }
}

customElements.define('sc-calendar', ScCalendar);
