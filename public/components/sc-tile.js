/**
 * @fileoverview GenUI Tile Renderer — <sc-tile> Web Component
 *
 * Renders any of the 33 GenUI component types as a self-contained tile.
 * Usage: <sc-tile type="gauge" data='{"label":"CPU","value":73,"max":100}'></sc-tile>
 *
 * @module components/sc-tile
 */

// ─── Shared stylesheet (loaded once, shared across all instances) ───────────

const _sheet = new CSSStyleSheet();
let _cssLoaded = false;

const _cssReady = (async () => {
  try {
    const base = import.meta.url;
    const url = new URL('../styles/tiles.css', base).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    _sheet.replaceSync(await res.text());
    _cssLoaded = true;
  } catch {
    try {
      const res = await fetch('/styles/tiles.css');
      if (!res.ok) throw new Error(res.status);
      _sheet.replaceSync(await res.text());
      _cssLoaded = true;
    } catch {
      _sheet.replaceSync(`:host{display:block;contain:content}
.tile{padding:16px;border-radius:8px;background:#111118;color:#e4e4e7;font-family:sans-serif;font-size:14px;line-height:1.5;overflow:hidden}
.tile__title{font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}`);
      _cssLoaded = true;
    }
  }
})();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** HTML-escape a string. */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal markdown → HTML (bold, italic, bullets, line breaks). */
function md(s) {
  if (!s) return '';
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- /gm, '• ')
    .replace(/\n/g, '<br>');
}

/** Clamp a number between min and max. */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Describe an SVG arc path from startDeg to endDeg around (cx,cy) with radius r. */
function arcPath(cx, cy, r, startDeg, endDeg) {
  const toRad = d => d * Math.PI / 180;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy + r * Math.sin(toRad(endDeg));
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

/** Default palette for chart datasets. */
const PALETTE = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#a855f7','#ec4899','#14b8a6'];

/** Alert severity → icon. */
const SEV_ICON = { info: '\u2139\uFE0F', warning: '\u26A0\uFE0F', error: '\u274C', success: '\u2705' };

// ─── Component ──────────────────────────────────────────────────────────────

class ScTile extends HTMLElement {
  static get observedAttributes() { return ['type', 'data']; }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [_sheet];
    this._root = document.createElement('div');
    shadow.appendChild(this._root);
    this._type = '';
    this._data = {};

    // Event delegation (set up once)
    shadow.addEventListener('click', this._handleClick.bind(this));
    shadow.addEventListener('input', this._handleInput.bind(this));
  }

  connectedCallback() {
    if (!_cssLoaded) _cssReady.then(() => this.render());
    else this.render();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'type') this._type = newVal || '';
    if (name === 'data') {
      try { this._data = JSON.parse(newVal); } catch { this._data = {}; }
    }
    if (this.isConnected) this.render();
  }

  /** Merge new data into existing data and re-render. */
  update(data) {
    Object.assign(this._data, data);
    this.render();
  }

  /** Full re-render based on current type + data. */
  render() {
    const t = this._type;
    const d = this._data || {};
    const key = '_r_' + t.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const fn = this[key];
    const html = fn ? fn.call(this, d) : this._r_unknown(d);
    const sev = (t === 'alert' && d.severity) ? ` alert--${esc(d.severity)}` : '';
    const extra = (t === 'hero' && d.gradient !== false)
      ? ` style="background:linear-gradient(135deg, ${esc(d.color || d.gradient || 'var(--accent)')}22, transparent)"`
      : '';
    this._root.className = `tile tile--${esc(t)}${sev}`;
    if (extra) this._root.setAttribute('style', `background:linear-gradient(135deg, ${esc(d.color || d.gradient || 'var(--accent)')}22, transparent)`);
    else this._root.removeAttribute('style');
    this._root.innerHTML = html;
  }

  // ── Event delegation ──────────────────────────────────────────────────

  _emit(action, extra = {}) {
    this.dispatchEvent(new CustomEvent('tile-action', {
      bubbles: true, composed: true,
      detail: { action, tileId: this.id || this.dataset.id, ...extra }
    }));
  }

  _handleClick(e) {
    // Buttons / actions
    const btn = e.target.closest('[data-action]');
    if (btn && !btn.closest('.tile-form')) {
      e.preventDefault();
      this._emit(btn.dataset.action, { value: btn.dataset.value });
      return;
    }

    // Form submit buttons
    const formBtn = e.target.closest('.tile-form [data-action]');
    if (formBtn) {
      e.preventDefault();
      const form = formBtn.closest('.tile-form');
      const fields = {};
      form.querySelectorAll('[name]').forEach(el => {
        fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      // Also collect toggle states
      form.querySelectorAll('.toggle__sw[data-name]').forEach(sw => {
        fields[sw.dataset.name] = sw.classList.contains('toggle__sw--on');
      });
      this._emit(formBtn.dataset.action, { formId: form.dataset.formId, fields });
      return;
    }

    // Chip toggle
    const chip = e.target.closest('.chip');
    if (chip) {
      chip.classList.toggle('chip--on');
      this._emit('chip-toggle', { value: chip.dataset.value, checked: chip.classList.contains('chip--on') });
      return;
    }

    // Checklist toggle
    const cli = e.target.closest('.checklist__item');
    if (cli) {
      const box = cli.querySelector('.checklist__box');
      const txt = cli.querySelector('.checklist__txt');
      const on = !box.classList.contains('checklist__box--on');
      box.classList.toggle('checklist__box--on');
      txt?.classList.toggle('checklist__txt--on');
      box.textContent = on ? '\u2713' : '';
      this._emit('check-toggle', { index: +cli.dataset.index, checked: on });
      return;
    }

    // Toggle switch
    const sw = e.target.closest('.toggle__sw');
    if (sw) {
      sw.classList.toggle('toggle__sw--on');
      this._emit('toggle', { checked: sw.classList.contains('toggle__sw--on'), name: sw.dataset.name });
      return;
    }

    // Rating star
    const star = e.target.closest('.rating__star');
    if (star) {
      const val = +star.dataset.value;
      star.closest('.rating__stars').querySelectorAll('.rating__star').forEach(s => {
        s.classList.toggle('rating__star--on', +s.dataset.value <= val);
      });
      this._emit('rate', { value: val });
      return;
    }

    // Tab switch
    const tab = e.target.closest('.tabs__tab');
    if (tab) {
      const idx = +tab.dataset.index;
      tab.closest('.tabs__hdr').querySelectorAll('.tabs__tab').forEach(t => t.classList.remove('tabs__tab--on'));
      tab.classList.add('tabs__tab--on');
      this._root.querySelectorAll('.tabs__panel').forEach((p, i) => p.style.display = i === idx ? '' : 'none');
      this._emit('tab-switch', { index: idx, label: tab.textContent });
      return;
    }

    // Link card
    const lcard = e.target.closest('[data-url]');
    if (lcard) {
      this._emit('link', { url: lcard.dataset.url });
      return;
    }
  }

  _handleInput(e) {
    const slider = e.target.closest('.slider__range');
    if (slider) {
      const display = this._root.querySelector('.slider__val');
      if (display) display.textContent = slider.value;
      this._emit('slider', { value: +slider.value });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER METHODS — one per GenUI type
  // Method naming: _r_{camelCaseType}
  // ════════════════════════════════════════════════════════════════════════

  // ── hero ──
  _r_hero(d) {
    return `${d.badge ? `<div class="hero__badge">${esc(d.badge)}</div>` : ''}
${d.icon ? `<div class="hero__icon">${esc(d.icon)}</div>` : ''}
<div class="hero__title">${esc(d.title)}</div>
${d.subtitle ? `<div class="hero__subtitle">${esc(d.subtitle)}</div>` : ''}`;
  }

  // ── card ──
  _r_card(d) {
    return `${d.icon ? `<div class="card__icon">${esc(d.icon)}</div>` : ''}
${d.title ? `<div class="card__title">${esc(d.title)}</div>` : ''}
${d.text ? `<div class="card__text">${md(d.text)}</div>` : ''}`;
  }

  // ── alert ──
  _r_alert(d) {
    const icon = d.icon || SEV_ICON[d.severity] || SEV_ICON.info;
    return `<div class="alert__icon">${esc(icon)}</div>
<div>
  ${d.title ? `<div class="alert__title">${esc(d.title)}</div>` : ''}
  ${d.message ? `<div class="alert__message">${esc(d.message)}</div>` : ''}
</div>`;
  }

  // ── stats ──
  _r_stats(d) {
    const items = d.items || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="stats__grid">
${items.map(i => `<div class="stats__item"><span class="stats__value">${esc(i.value)}</span><span class="stats__label">${esc(i.label)}</span></div>`).join('')}
</div>`;
  }

  // ── gauge ──
  _r_gauge(d) {
    const val = Number(d.value) || 0;
    const max = Number(d.max) || 100;
    const pct = clamp(val / max, 0, 1);
    const color = d.color || 'var(--accent,#6366f1)';
    const unit = d.unit || '';
    const label = d.label || '';
    // 270° arc from 135° to 405°
    const bgArc = arcPath(60, 60, 46, 135, 405);
    const valEnd = 135 + 270 * pct;
    const valArc = pct > 0.003 ? arcPath(60, 60, 46, 135, valEnd) : '';
    return `<div class="gauge">
<svg viewBox="0 0 120 120" class="gauge__svg">
  <path d="${bgArc}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10" stroke-linecap="round"/>
  ${valArc ? `<path d="${valArc}" fill="none" stroke="${esc(color)}" stroke-width="10" stroke-linecap="round"/>` : ''}
  <text x="60" y="58" text-anchor="middle" dominant-baseline="middle" class="gauge__val">${esc(String(val))}${esc(unit)}</text>
  <text x="60" y="78" text-anchor="middle" class="gauge__lbl">${esc(label)}</text>
</svg>
</div>`;
  }

  // ── progress ──
  _r_progress(d) {
    const val = Number(d.value) || 0;
    const max = Number(d.max) || 100;
    const pct = clamp(val / max * 100, 0, 100);
    const color = d.color || 'var(--accent,#6366f1)';
    return `<div class="progress__header">
  <span class="progress__header-left">${d.icon ? esc(d.icon) + ' ' : ''}${esc(d.label || '')}</span>
  <span class="progress__header-right">${esc(String(val))} / ${esc(String(max))}</span>
</div>
<div class="progress__track"><div class="progress__fill" style="width:${pct}%;background:${esc(color)}"></div></div>`;
  }

  // ── sparkline ──
  _r_sparkline(d) {
    const vals = d.values || [];
    if (!vals.length) return `<div class="sparkline__label">${esc(d.label || 'No data')}</div>`;
    const w = 200, h = 50;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const range = mx - mn || 1;
    const pts = vals.map((v, i) => {
      const x = vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w;
      const y = h - 2 - ((v - mn) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = d.color || 'var(--accent,#6366f1)';
    // Area fill
    const first = `0,${h}`;
    const last = `${w},${h}`;
    const areaPoints = `${first} ${pts} ${last}`;
    return `${d.label ? `<div class="sparkline__label">${esc(d.label)}</div>` : ''}
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="sparkline__svg">
  <polygon points="${areaPoints}" fill="${esc(color)}" opacity="0.1"/>
  <polyline points="${pts}" fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
  }

  // ── chart-bar ──
  _r_chartBar(d) {
    const labels = d.labels || [];
    const datasets = d.datasets || [];
    if (!labels.length || !datasets.length) return this._chartEmpty(d.title);
    const W = 300, H = 180;
    const pad = { t: 10, r: 10, b: 26, l: 36 };
    const pW = W - pad.l - pad.r, pH = H - pad.t - pad.b;
    let mx = 0;
    for (const ds of datasets) for (const v of (ds.data || [])) mx = Math.max(mx, v);
    if (!mx) mx = 1;
    const nG = labels.length, nB = datasets.length;
    const gW = pW / nG, bW = (gW * 0.7) / nB, gap = gW * 0.15;
    let bars = '', axis = '';
    for (let g = 0; g < nG; g++) {
      for (let b = 0; b < nB; b++) {
        const v = (datasets[b].data || [])[g] || 0;
        const bH = (v / mx) * pH;
        const x = pad.l + g * gW + gap + b * bW;
        const y = pad.t + pH - bH;
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${datasets[b].color || PALETTE[b % PALETTE.length]}" rx="2"/>`;
      }
      axis += `<text x="${(pad.l + g * gW + gW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart__axis">${esc(labels[g])}</text>`;
    }
    // Grid lines
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (pH / 4) * i;
      grid += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" class="chart__grid"/>`;
    }
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<svg viewBox="0 0 ${W} ${H}" class="chart__svg">${grid}${bars}${axis}</svg>
${this._chartLegend(datasets)}`;
  }

  // ── chart-line ──
  _r_chartLine(d) {
    const labels = d.labels || [];
    const datasets = d.datasets || [];
    if (!labels.length || !datasets.length) return this._chartEmpty(d.title);
    const W = 300, H = 180;
    const pad = { t: 10, r: 10, b: 26, l: 36 };
    const pW = W - pad.l - pad.r, pH = H - pad.t - pad.b;
    let mn = Infinity, mx = -Infinity;
    for (const ds of datasets) for (const v of (ds.data || [])) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (mn === mx) { mn -= 1; mx += 1; }
    let lines = '', axis = '';
    for (const ds of datasets) {
      const pts = (ds.data || []).map((v, i) => {
        const x = pad.l + (labels.length === 1 ? pW / 2 : (i / (labels.length - 1)) * pW);
        const y = pad.t + pH - ((v - mn) / (mx - mn)) * pH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const c = ds.color || PALETTE[datasets.indexOf(ds) % PALETTE.length];
      lines += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    for (let i = 0; i < labels.length; i++) {
      const x = pad.l + (labels.length === 1 ? pW / 2 : (i / (labels.length - 1)) * pW);
      axis += `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart__axis">${esc(labels[i])}</text>`;
    }
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (pH / 4) * i;
      grid += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" class="chart__grid"/>`;
    }
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<svg viewBox="0 0 ${W} ${H}" class="chart__svg">${grid}${lines}${axis}</svg>
${this._chartLegend(datasets)}`;
  }

  // ── chart-pie ──
  _r_chartPie(d) {
    const slices = d.slices || [];
    const total = slices.reduce((s, sl) => s + (Number(sl.value) || 0), 0);
    if (!total) return this._chartEmpty(d.title);
    const cx = 75, cy = 75, r = 70;
    let angle = -Math.PI / 2;
    let paths = '';
    for (let i = 0; i < slices.length; i++) {
      const sl = slices[i];
      const sliceAngle = (sl.value / total) * 2 * Math.PI;
      if (sliceAngle < 0.001) { angle += sliceAngle; continue; }
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + sliceAngle);
      const y2 = cy + r * Math.sin(angle + sliceAngle);
      const large = sliceAngle > Math.PI ? 1 : 0;
      const c = sl.color || PALETTE[i % PALETTE.length];
      paths += `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${c}"/>`;
      angle += sliceAngle;
    }
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="pie__wrap">
  <svg viewBox="0 0 150 150" class="pie__svg">${paths}</svg>
  <div class="pie__legend">
    ${slices.map((sl, i) => `<div class="pie__legend-item"><span class="pie__dot" style="background:${sl.color || PALETTE[i % PALETTE.length]}"></span>${esc(sl.label)}</div>`).join('')}
  </div>
</div>`;
  }

  // ── stacked-bar ──
  _r_stackedBar(d) {
    const items = d.items || [];
    const total = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
    if (!total) return this._chartEmpty(d.title);
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="stacked__track">
  ${items.map((it, i) => {
    const pct = ((it.value || 0) / total * 100).toFixed(1);
    return `<div class="stacked__seg" style="width:${pct}%;background:${it.color || PALETTE[i % PALETTE.length]}"></div>`;
  }).join('')}
</div>
<div class="stacked__legend">
  ${items.map((it, i) => `<div class="stacked__legend-item"><span class="pie__dot" style="background:${it.color || PALETTE[i % PALETTE.length]}"></span>${esc(it.label)} (${esc(String(it.value))})</div>`).join('')}
</div>`;
  }

  // ── table ──
  _r_table(d) {
    const headers = d.headers || [];
    const rows = d.rows || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<table class="tile-table">
${headers.length ? `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}
<tbody>${rows.map(r => `<tr>${(Array.isArray(r) ? r : []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
</table>`;
  }

  // ── checklist ──
  _r_checklist(d) {
    const items = d.items || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
${items.map((it, i) => {
  const on = it.checked;
  return `<div class="checklist__item" data-index="${i}">
  <div class="checklist__box${on ? ' checklist__box--on' : ''}">${on ? '\u2713' : ''}</div>
  <span class="checklist__txt${on ? ' checklist__txt--on' : ''}">${esc(it.text)}</span>
</div>`;
}).join('')}`;
  }

  // ── timeline ──
  _r_timeline(d) {
    const items = d.items || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="timeline__list">
${items.map(it => `<div class="timeline__item">
  <div class="timeline__dot">${it.icon ? esc(it.icon) : ''}</div>
  <div class="tl__title">${esc(it.title)}</div>
  ${it.text ? `<div class="tl__text">${esc(it.text)}</div>` : ''}
  ${(it.date || it.time) ? `<div class="tl__date">${esc(it.date || it.time)}</div>` : ''}
</div>`).join('')}
</div>`;
  }

  // ── kv ──
  _r_kv(d) {
    const items = d.items || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
${items.map(it => `<div class="kv__row"><span class="kv__key">${esc(it.key)}</span><span class="kv__val">${esc(it.value)}</span></div>`).join('')}`;
  }

  // ── tags ──
  _r_tags(d) {
    const items = d.items || [];
    return `${d.label ? `<div class="tags__label">${esc(d.label)}</div>` : ''}
<div class="tags__wrap">
${items.map(it => {
  const bg = it.color ? `background:${esc(it.color)}22;color:${esc(it.color)}` : '';
  return `<span class="tag"${bg ? ` style="${bg}"` : ''}>${esc(it.text)}</span>`;
}).join('')}
</div>`;
  }

  // ── accordion ──
  _r_accordion(d) {
    const sections = d.sections || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
${sections.map(s => `<details class="acc__section">
  <summary class="acc__summary">${esc(s.title)}</summary>
  <div class="acc__body">${md(s.content || s.text || '')}</div>
</details>`).join('')}`;
  }

  // ── buttons ──
  _r_buttons(d) {
    const btns = d.buttons || [];
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="btn-group">
${btns.map(b => `<button class="tile-btn${b.style ? ` tile-btn--${esc(b.style)}` : ''}" data-action="${esc(b.action || '')}" data-value="${esc(b.value || '')}">${esc(b.label)}</button>`).join('')}
</div>`;
  }

  // ── chips ──
  _r_chips(d) {
    const chips = d.chips || [];
    return `${(d.title || d.label) ? `<div class="tile__title">${esc(d.title || d.label)}</div>` : ''}
<div class="chips__wrap">
${chips.map(c => `<button class="chip${c.checked ? ' chip--on' : ''}" data-value="${esc(c.value || c.text)}">${esc(c.text)}</button>`).join('')}
</div>`;
  }

  // ── toggle ──
  _r_toggle(d) {
    const on = d.checked || d.value;
    return `<div class="toggle__wrap">
  <span class="toggle__label">${esc(d.label || d.title || '')}</span>
  <div class="toggle__sw${on ? ' toggle__sw--on' : ''}"><div class="toggle__knob"></div></div>
</div>`;
  }

  // ── input ──
  _r_input(d) {
    return `${d.label ? `<label class="tile-lbl">${esc(d.label)}</label>` : ''}
<input class="tile-input" type="${esc(d.type || 'text')}" value="${esc(d.value || '')}" placeholder="${esc(d.placeholder || '')}" name="${esc(d.name || d.label || '')}"/>`;
  }

  // ── slider ──
  _r_slider(d) {
    const val = d.value ?? 50;
    const min = d.min ?? 0;
    const max = d.max ?? 100;
    return `<div class="slider__header">
  <span>${esc(d.label || d.title || '')}</span>
  <span class="slider__val">${esc(String(val))}</span>
</div>
<input class="slider__range" type="range" min="${esc(String(min))}" max="${esc(String(max))}" value="${esc(String(val))}"/>`;
  }

  // ── rating ──
  _r_rating(d) {
    const val = Number(d.value) || 0;
    const max = Number(d.max) || 5;
    let stars = '';
    for (let i = 1; i <= max; i++) {
      stars += `<span class="rating__star${i <= val ? ' rating__star--on' : ''}" data-value="${i}">\u2605</span>`;
    }
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="rating__stars">${stars}</div>`;
  }

  // ── tabs ──
  _r_tabs(d) {
    const tabs = d.tabs || [];
    const active = d.active ?? 0;
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="tabs__hdr">
${tabs.map((t, i) => `<button class="tabs__tab${i === active ? ' tabs__tab--on' : ''}" data-index="${i}">${esc(t.label)}</button>`).join('')}
</div>
${tabs.map((t, i) => `<div class="tabs__panel" style="${i === active ? '' : 'display:none'}">${md(t.content || '')}</div>`).join('')}`;
  }

  // ── streak ──
  _r_streak(d) {
    const days = d.days || [];
    const active = new Set(d.active || []);
    // If days is empty, generate a default grid
    const cells = days.length
      ? days.map(day => `<div class="streak__cell${active.has(day) ? ' streak__cell--on' : ''}" title="${esc(String(day))}"></div>`).join('')
      : Array.from({ length: 30 }, (_, i) => `<div class="streak__cell${active.has(i) ? ' streak__cell--on' : ''}"></div>`).join('');
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="streak__grid">${cells}</div>`;
  }

  // ── form-strip ──
  _r_formStrip(d) {
    const fields = (d.fields || []).map(f =>
      `<input class="tile-input" type="${esc(f.type || 'text')}" name="${esc(f.name || '')}" placeholder="${esc(f.placeholder || f.label || '')}" value="${esc(f.value || '')}"/>`
    ).join('');
    return `<div class="fstrip tile-form" data-form-id="${esc(d.id || '')}">
  ${d.icon ? `<div class="fstrip__icon">${esc(d.icon)}</div>` : ''}
  <div class="fstrip__body">
    ${d.title ? `<div class="fstrip__title">${esc(d.title)}</div>` : ''}
    ${d.desc || d.description ? `<div class="fstrip__desc">${esc(d.desc || d.description)}</div>` : ''}
    <div class="fstrip__fields">
      ${fields}
      <button class="tile-btn tile-btn--primary" data-action="${esc(d.action || 'submit')}">${esc(d.label || 'Submit')}</button>
    </div>
  </div>
</div>`;
  }

  // ── link-card ──
  _r_linkCard(d) {
    const url = d.url || '';
    const borderColor = d.color ? `border-left:3px solid ${esc(d.color)};` : '';
    return `<div class="lcard" data-url="${esc(url)}"${borderColor ? ` style="${borderColor}"` : ''}>
  ${d.icon ? `<div class="lcard__icon">${esc(d.icon)}</div>` : ''}
  <div>
    ${d.title ? `<div class="lcard__title">${esc(d.title)}</div>` : ''}
    ${(d.desc || d.description) ? `<div class="lcard__desc">${esc(d.desc || d.description)}</div>` : ''}
    ${url ? `<div class="lcard__url">${esc(url)}</div>` : ''}
  </div>
</div>`;
  }

  // ── status ──
  _r_status(d) {
    const color = d.color || 'var(--accent,#6366f1)';
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="status__wrap">
  <div class="status__dot" style="background:${esc(color)}"></div>
  <div class="status__text">${esc(d.text || '')}</div>
</div>`;
  }

  // ── weather ──
  _r_weather(d) {
    return `<div class="weather">
  <div class="weather__icon">${esc(d.icon || '\u2601\uFE0F')}</div>
  <div class="weather__info">
    ${d.city ? `<div class="weather__city">${esc(d.city)}</div>` : ''}
    <div class="weather__temp">${esc(d.temp != null ? String(d.temp) : '--')}</div>
    ${d.condition ? `<div class="weather__cond">${esc(d.condition)}</div>` : ''}
  </div>
</div>`;
  }

  // ── code ──
  _r_code(d) {
    return `<div class="code__hdr">
  ${d.title ? `<span>${esc(d.title)}</span>` : '<span></span>'}
  ${d.language ? `<span class="code__lang">${esc(d.language)}</span>` : ''}
</div>
<pre class="code__block">${esc(d.code || '')}</pre>`;
  }

  // ── video ──
  _r_video(d) {
    const src = d.src || d.url || '';
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
${src ? `<video class="tile-video" controls src="${esc(src)}"></video>` : '<div>No video source</div>'}
${d.caption ? `<div class="tile-caption">${esc(d.caption)}</div>` : ''}`;
  }

  // ── image ──
  _r_image(d) {
    const src = d.src || d.url || '';
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
${src ? `<img class="tile-img" src="${esc(src)}" alt="${esc(d.alt || d.title || '')}"/>` : '<div>No image source</div>'}
${d.caption ? `<div class="tile-caption">${esc(d.caption)}</div>` : ''}`;
  }

  // ── form ──
  _r_form(d) {
    const fields = (d.fields || []).map(f => this._formField(f)).join('');
    const actions = (d.actions || []).map(a =>
      `<button class="tile-btn${a.style ? ` tile-btn--${esc(a.style)}` : ' tile-btn--primary'}" data-action="${esc(a.action || 'submit')}">${esc(a.label || 'Submit')}</button>`
    ).join('');
    return `${d.title ? `<div class="tile__title">${esc(d.title)}</div>` : ''}
<div class="tile-form" data-form-id="${esc(d.id || '')}">
  ${fields}
  ${actions ? `<div class="tile-form__actions">${actions}</div>` : ''}
</div>`;
  }

  // ── unknown ──
  _r_unknown(d) {
    const type = this._type || 'unknown';
    return `<div class="tile__title">${esc(type)}</div>
<pre style="font-size:11px;color:var(--text-muted);white-space:pre-wrap;word-break:break-word">${esc(JSON.stringify(d, null, 2))}</pre>`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ════════════════════════════════════════════════════════════════════════

  _chartEmpty(title) {
    return `${title ? `<div class="tile__title">${esc(title)}</div>` : ''}<div style="color:var(--text-muted);font-size:13px">No data</div>`;
  }

  _chartLegend(datasets) {
    if (datasets.length <= 1) return '';
    return `<div class="stacked__legend" style="margin-top:8px">
${datasets.map((ds, i) => `<div class="stacked__legend-item"><span class="pie__dot" style="background:${ds.color || PALETTE[i % PALETTE.length]}"></span>${esc(ds.label || '')}</div>`).join('')}
</div>`;
  }

  _formField(f) {
    const label = f.label ? `<label class="tile-lbl">${esc(f.label)}</label>` : '';
    const name = esc(f.name || f.label || '');
    switch (f.type) {
      case 'textarea':
      case 'richtext':
        return `<div class="tile-form__field">${label}<textarea class="tile-textarea" name="${name}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea></div>`;
      case 'select': {
        const opts = (f.options || []).map(o => {
          const val = typeof o === 'string' ? o : (o.value ?? o);
          const text = typeof o === 'string' ? o : (o.label || o.value || o);
          return `<option value="${esc(val)}"${String(val) === String(f.value) ? ' selected' : ''}>${esc(text)}</option>`;
        }).join('');
        return `<div class="tile-form__field">${label}<select class="tile-select" name="${name}">${opts}</select></div>`;
      }
      case 'toggle': {
        const on = f.value || f.checked;
        return `<div class="tile-form__field"><div class="toggle__wrap">${label}<div class="toggle__sw${on ? ' toggle__sw--on' : ''}" data-name="${name}"><div class="toggle__knob"></div></div></div></div>`;
      }
      default:
        return `<div class="tile-form__field">${label}<input class="tile-input" type="${esc(f.type || 'text')}" name="${name}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}"/></div>`;
    }
  }
}

// Guard against double registration (URL mismatch between <script> tag with ?v= and bare import)
if (!customElements.get('sc-tile')) {
  customElements.define('sc-tile', ScTile);
}

export default ScTile;
