/**
 * Scratchy v2 — Mobile Surface Stack
 * Stack-based navigation controller for mobile surfaces.
 * Chat is always the base layer (never pushed/popped).
 * Surfaces push on top as full-screen views with slide animations.
 * @module mobile-surface-stack
 */

const ANIMATION_DURATION = 300; // ms
const ANIMATION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

const BACK_ARROW_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 4 6 9 11 14"/></svg>`;

const SURFACE_ICONS = {
  terminal: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="13" y2="12"/></svg>`,
  explorer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>`,
  editor: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-8 8H3v-3z"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg>`,
  canvas: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="6" y1="6" x2="6" y2="14"/></svg>`,
};

/** @type {MobileSurfaceStack|null} */
let _instance = null;

/**
 * Stack-based navigation for mobile surfaces.
 * Chat sits at the bottom; surfaces slide in from the right.
 */
class MobileSurfaceStack {
  /**
   * Get the singleton instance.
   * @returns {MobileSurfaceStack}
   */
  static getInstance() {
    if (!_instance) _instance = new MobileSurfaceStack();
    return _instance;
  }

  constructor() {
    if (_instance) return _instance;
    _instance = this;

    /** @type {Array<{ type: string, el: HTMLElement }>} */
    this._stack = [];

    /** @type {HTMLElement|null} */
    this._backBtn = null;

    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {Set<string>} Active surface types (tracked externally or via push) */
    this._activeSurfaces = new Set();

    /** @type {{ el: HTMLElement, dismiss: Function }|null} */
    this._pickerSheet = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Initialize the stack — find the surface container and create the back button.
   * Called automatically on DOMContentLoaded for mobile viewports.
   */
  init() {
    this._container = document.querySelector('.surface-container');
    if (!this._container) {
      console.warn('[MobileSurfaceStack] .surface-container not found');
      return;
    }

    this._createBackButton();

    // Listen for surface-picker custom event
    window.addEventListener('show-surface-picker', () => {
      this.showSurfacePickerSheet();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Stack Operations                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Push a surface onto the stack. Animates in from the right.
   * @param {string} surfaceType — e.g. 'terminal', 'editor', 'explorer'
   * @returns {HTMLElement} The pushed surface wrapper element.
   */
  push(surfaceType) {
    if (!this._container) {
      console.warn('[MobileSurfaceStack] Not initialized');
      return null;
    }

    // Find the surface element by data attribute or create a wrapper
    let surfaceEl = this._container.querySelector(
      `[data-surface="${surfaceType}"], .surface-${surfaceType}`
    );

    // If no existing element, create a placeholder wrapper
    if (!surfaceEl) {
      surfaceEl = document.createElement('div');
      surfaceEl.className = `surface-${surfaceType}`;
      surfaceEl.dataset.surface = surfaceType;
      this._container.appendChild(surfaceEl);
    }

    // Apply mobile push classes
    surfaceEl.classList.add('mobile-surface-pushed');
    surfaceEl.classList.remove('mobile-surface-visible');

    // Force reflow before animating
    surfaceEl.offsetHeight; // eslint-disable-line no-unused-expressions

    // Animate in
    requestAnimationFrame(() => {
      surfaceEl.classList.add('mobile-surface-visible');
    });

    this._stack.push({ type: surfaceType, el: surfaceEl });
    this._activeSurfaces.add(surfaceType);
    this._updateBackButton();

    // Dispatch event
    window.dispatchEvent(new CustomEvent('surface-pushed', {
      detail: { surfaceType, depth: this.depth },
    }));

    return surfaceEl;
  }

  /**
   * Pop the top surface off the stack. Animates out to the right.
   * @returns {string|null} The popped surface type, or null if stack was empty.
   */
  pop() {
    if (this._stack.length === 0) return null;

    const entry = this._stack.pop();
    const { type, el } = entry;

    // Animate out
    el.classList.remove('mobile-surface-visible');

    // Clean up after transition
    const cleanup = () => {
      el.classList.remove('mobile-surface-pushed');
      this._activeSurfaces.delete(type);
    };

    el.addEventListener('transitionend', cleanup, { once: true });
    // Fallback in case transitionend doesn't fire
    setTimeout(cleanup, ANIMATION_DURATION + 50);

    this._updateBackButton();

    // Dispatch event
    window.dispatchEvent(new CustomEvent('surface-popped', {
      detail: { surfaceType: type, depth: this.depth },
    }));

    return type;
  }

  /**
   * Pop all surfaces, returning to chat.
   */
  popAll() {
    while (this._stack.length > 0) {
      this.pop();
    }
  }

  /**
   * Get the current (topmost) surface type.
   * @returns {string|null}
   */
  get current() {
    return this._stack.length > 0
      ? this._stack[this._stack.length - 1].type
      : null;
  }

  /**
   * Get the stack depth.
   * @returns {number}
   */
  get depth() {
    return this._stack.length;
  }

  /* ------------------------------------------------------------------ */
  /*  Back Button                                                       */
  /* ------------------------------------------------------------------ */

  /** @private */
  _createBackButton() {
    if (this._backBtn) return;

    const btn = document.createElement('button');
    btn.className = 'mobile-back-btn';
    btn.setAttribute('aria-label', 'Go back');
    btn.innerHTML = BACK_ARROW_SVG;
    btn.style.display = 'none';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pop();
    });

    // Insert into container so it overlays surfaces
    this._container.appendChild(btn);
    this._backBtn = btn;
  }

  /** @private */
  _updateBackButton() {
    if (!this._backBtn) return;
    this._backBtn.style.display = this._stack.length > 0 ? 'flex' : 'none';
  }

  /* ------------------------------------------------------------------ */
  /*  Surface Picker Bottom Sheet                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Show a bottom sheet allowing the user to pick a surface.
   * Each card shows an SVG icon, the surface name, and an "Active" badge
   * if the surface is currently in the stack.
   */
  showSurfacePickerSheet() {
    // Dismiss existing picker if open
    this.dismissSurfacePickerSheet();

    const surfaceTypes = Object.keys(SURFACE_ICONS);

    // --- Backdrop ---
    const backdrop = document.createElement('div');
    backdrop.className = 'sc-surface-picker-backdrop';

    // --- Sheet ---
    const sheet = document.createElement('div');
    sheet.className = 'sc-surface-picker-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Surface Picker');

    // Handle
    const handle = document.createElement('div');
    handle.className = 'sc-surface-picker-handle';
    sheet.appendChild(handle);

    // Title
    const title = document.createElement('div');
    title.className = 'sc-surface-picker-title';
    title.textContent = 'Surfaces';
    sheet.appendChild(title);

    // Cards grid
    const grid = document.createElement('div');
    grid.className = 'sc-surface-picker-grid';

    for (const surfaceType of surfaceTypes) {
      const card = document.createElement('button');
      card.className = 'sc-surface-picker-card';
      card.dataset.surface = surfaceType;

      const isActive = this._activeSurfaces.has(surfaceType);
      if (isActive) card.classList.add('active');

      // Icon
      const iconWrap = document.createElement('div');
      iconWrap.className = 'sc-surface-picker-icon';
      iconWrap.innerHTML = SURFACE_ICONS[surfaceType] || '';
      card.appendChild(iconWrap);

      // Name
      const name = document.createElement('span');
      name.className = 'sc-surface-picker-name';
      name.textContent = surfaceType.charAt(0).toUpperCase() + surfaceType.slice(1);
      card.appendChild(name);

      // Active badge
      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'sc-surface-picker-badge';
        badge.textContent = 'Active';
        card.appendChild(badge);
      }

      card.addEventListener('click', () => {
        this.push(surfaceType);
        dismiss();
      });

      grid.appendChild(card);
    }

    sheet.appendChild(grid);

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'sc-surface-picker-overlay';
    container.appendChild(backdrop);
    container.appendChild(sheet);
    document.body.appendChild(container);

    // Animate in
    requestAnimationFrame(() => {
      container.classList.add('open');
    });

    // Dismiss logic
    const dismiss = () => {
      container.classList.remove('open');
      const onEnd = () => {
        if (container.parentNode) container.remove();
      };
      sheet.addEventListener('transitionend', onEnd, { once: true });
      setTimeout(onEnd, ANIMATION_DURATION + 100);
      this._pickerSheet = null;
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
        sheet.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const dy = e.changedTouches[0].clientY - dragStartY;
      if (dy > 100) {
        dismiss();
      } else {
        sheet.style.transform = '';
      }
    }, { passive: true });

    // Escape key
    const onKey = (e) => {
      if (e.key === 'Escape') {
        dismiss();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);

    this._pickerSheet = { el: container, dismiss };
    return { dismiss };
  }

  /**
   * Dismiss the surface picker bottom sheet if open.
   */
  dismissSurfacePickerSheet() {
    if (this._pickerSheet) {
      this._pickerSheet.dismiss();
      this._pickerSheet = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Tear down the stack (for testing / HMR).
   */
  destroy() {
    this.popAll();
    this.dismissSurfacePickerSheet();
    if (this._backBtn) {
      this._backBtn.remove();
      this._backBtn = null;
    }
    this._container = null;
    _instance = null;
  }
}

/* -------------------------------------------------------------------- */
/*  Singleton & Auto-Init                                               */
/* -------------------------------------------------------------------- */

const mobileSurfaceStack = MobileSurfaceStack.getInstance();

if (typeof window !== 'undefined') {
  const initIfMobile = () => {
    if (window.innerWidth <= 767) {
      mobileSurfaceStack.init();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIfMobile);
  } else {
    initIfMobile();
  }
}

export { MobileSurfaceStack, mobileSurfaceStack, SURFACE_ICONS };
export default mobileSurfaceStack;
