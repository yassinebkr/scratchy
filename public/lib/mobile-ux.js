/**
 * Scratchy v2 — Mobile UX Manager
 * Responsive breakpoints, swipe gestures, bottom sheet,
 * virtual keyboard detection, and safe area handling.
 * @module mobile-ux
 */

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_MIN = 0.3; // px/ms
const BREAKPOINTS = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1024px)',
  desktop: '(min-width: 1025px)',
};

/** @type {MobileUXManager|null} */
let _instance = null;

/**
 * Manages mobile responsiveness: breakpoints, gestures,
 * keyboard detection, and bottom sheet components.
 */
class MobileUXManager extends EventTarget {
  /**
   * Get the singleton instance.
   * @returns {MobileUXManager}
   */
  static getInstance() {
    if (!_instance) _instance = new MobileUXManager();
    return _instance;
  }

  constructor() {
    super();
    if (_instance) return _instance;
    _instance = this;

    /** @type {'mobile'|'tablet'|'desktop'} */
    this.viewport = 'desktop';
    /** @type {boolean} */
    this.keyboardVisible = false;
    /** @type {number} */
    this._keyboardHeight = 0;

    // Touch state
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchStartTime = 0;
    this._tracking = false;

    // Media queries
    this._queries = {};
    this._bottomSheet = null;

    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  _init() {
    // Set up breakpoint listeners
    for (const [name, query] of Object.entries(BREAKPOINTS)) {
      const mql = window.matchMedia(query);
      this._queries[name] = mql;
      mql.addEventListener('change', () => this._onBreakpointChange());
    }
    this._onBreakpointChange();

    // Touch gestures
    document.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
    document.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });

    // Virtual keyboard detection via visualViewport
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._onViewportResize());
    }

    // Orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._onBreakpointChange(), 100);
    });

    // Safe area CSS vars
    this._applySafeAreaVars();
  }

  /* ------------------------------------------------------------------ */
  /*  Breakpoints                                                       */
  /* ------------------------------------------------------------------ */

  /** @private */
  _onBreakpointChange() {
    let newViewport = 'desktop';
    if (this._queries.mobile?.matches) newViewport = 'mobile';
    else if (this._queries.tablet?.matches) newViewport = 'tablet';

    if (newViewport !== this.viewport) {
      const prev = this.viewport;
      this.viewport = newViewport;
      document.documentElement.dataset.viewport = newViewport;

      this._emit('viewport-change', { viewport: newViewport, previous: prev });
    }
  }

  /**
   * Check if current viewport matches a breakpoint.
   * @param {'mobile'|'tablet'|'desktop'} bp
   * @returns {boolean}
   */
  is(bp) {
    return this.viewport === bp;
  }

  /* ------------------------------------------------------------------ */
  /*  Swipe Gestures                                                    */
  /* ------------------------------------------------------------------ */

  /** @private */
  _onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
    this._touchStartTime = Date.now();
    this._tracking = true;
  }

  /** @private */
  _onTouchMove(e) {
    if (!this._tracking) return;
    // Allow vertical scroll, only track horizontal for gesture
    const dx = Math.abs(e.touches[0].clientX - this._touchStartX);
    const dy = Math.abs(e.touches[0].clientY - this._touchStartY);
    // If moving more horizontally than vertically, prevent scroll
    if (dx > dy && dx > 10) {
      e.preventDefault();
    }
  }

  /** @private */
  _onTouchEnd(e) {
    if (!this._tracking) return;
    this._tracking = false;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;
    const dt = Date.now() - this._touchStartTime;

    // Must be primarily horizontal
    if (Math.abs(dy) > Math.abs(dx)) return;

    const absDx = Math.abs(dx);
    const velocity = absDx / dt;

    if (absDx >= SWIPE_THRESHOLD && velocity >= SWIPE_VELOCITY_MIN) {
      const direction = dx > 0 ? 'right' : 'left';
      this._emit('gesture-swipe', { direction, distance: absDx, velocity });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Virtual Keyboard Detection                                        */
  /* ------------------------------------------------------------------ */

  /** @private */
  _onViewportResize() {
    const vv = window.visualViewport;
    if (!vv) return;

    const windowHeight = window.innerHeight;
    const viewportHeight = vv.height;
    const diff = windowHeight - viewportHeight;

    // Keyboard is likely visible if viewport shrinks by > 150px
    const wasVisible = this.keyboardVisible;
    this.keyboardVisible = diff > 150;
    this._keyboardHeight = this.keyboardVisible ? diff : 0;

    document.documentElement.style.setProperty(
      '--sc-keyboard-height',
      `${this._keyboardHeight}px`
    );

    if (this.keyboardVisible && !wasVisible) {
      this._emit('keyboard-show', { height: this._keyboardHeight });
    } else if (!this.keyboardVisible && wasVisible) {
      this._emit('keyboard-hide', { height: 0 });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Safe Area                                                         */
  /* ------------------------------------------------------------------ */

  /** @private */
  _applySafeAreaVars() {
    const root = document.documentElement;
    root.style.setProperty('--sc-safe-top', 'env(safe-area-inset-top, 0px)');
    root.style.setProperty('--sc-safe-right', 'env(safe-area-inset-right, 0px)');
    root.style.setProperty('--sc-safe-bottom', 'env(safe-area-inset-bottom, 0px)');
    root.style.setProperty('--sc-safe-left', 'env(safe-area-inset-left, 0px)');
  }

  /* ------------------------------------------------------------------ */
  /*  Bottom Sheet                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Show a bottom sheet with the given content.
   * @param {Object} opts
   * @param {string} opts.title — sheet title
   * @param {HTMLElement|string} opts.content — content element or HTML string
   * @param {Function} [opts.onDismiss] — callback when dismissed
   * @returns {{ dismiss: Function }} handle
   */
  showBottomSheet({ title, content, onDismiss }) {
    this.dismissBottomSheet();

    const sheet = document.createElement('div');
    sheet.className = 'sc-bottom-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', title || 'Menu');

    const backdrop = document.createElement('div');
    backdrop.className = 'sc-bottom-sheet-backdrop';

    const panel = document.createElement('div');
    panel.className = 'sc-bottom-sheet-panel';

    const handle = document.createElement('div');
    handle.className = 'sc-bottom-sheet-handle';
    handle.setAttribute('aria-hidden', 'true');

    const titleEl = document.createElement('div');
    titleEl.className = 'sc-bottom-sheet-title';
    titleEl.textContent = title || '';

    const body = document.createElement('div');
    body.className = 'sc-bottom-sheet-body';
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      body.appendChild(content);
    }

    panel.appendChild(handle);
    if (title) panel.appendChild(titleEl);
    panel.appendChild(body);

    sheet.appendChild(backdrop);
    sheet.appendChild(panel);
    document.body.appendChild(sheet);

    // Animate in
    requestAnimationFrame(() => {
      sheet.classList.add('open');
    });

    // Dismiss handlers
    const dismiss = () => {
      sheet.classList.remove('open');
      sheet.addEventListener('transitionend', () => sheet.remove(), { once: true });
      // Fallback removal
      setTimeout(() => { if (sheet.parentNode) sheet.remove(); }, 400);
      this._bottomSheet = null;
      onDismiss?.();
    };

    backdrop.addEventListener('click', dismiss);

    // Drag-to-dismiss on handle
    let dragStartY = 0;
    let dragging = false;

    handle.addEventListener('touchstart', (e) => {
      dragStartY = e.touches[0].clientY;
      dragging = true;
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const dy = e.touches[0].clientY - dragStartY;
      if (dy > 0) {
        panel.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const dy = e.changedTouches[0].clientY - dragStartY;
      if (dy > 100) {
        dismiss();
      } else {
        panel.style.transform = '';
      }
    }, { passive: true });

    // Escape key
    const onKey = (e) => {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    this._bottomSheet = { el: sheet, dismiss };
    return { dismiss };
  }

  /**
   * Dismiss the currently open bottom sheet, if any.
   */
  dismissBottomSheet() {
    this._bottomSheet?.dismiss();
    this._bottomSheet = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * @private
   * @param {string} name
   * @param {Object} detail
   */
  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Clean up all listeners (for testing).
   */
  destroy() {
    for (const mql of Object.values(this._queries)) {
      // matchMedia listeners auto-GC, but clear ref
    }
    this._queries = {};
    this.dismissBottomSheet();
    _instance = null;
  }
}

export { MobileUXManager };
export default MobileUXManager;
