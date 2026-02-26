/**
 * Scratchy v2 — Virtual Scroller
 * Custom element <sc-virtual-list> with shadow DOM.
 * Renders only visible items + buffer (max 50 DOM nodes).
 * Dynamic row heights, scroll anchoring, recycle pool.
 * @module virtual-scroller
 */

const MAX_DOM_NODES = 50;
const BUFFER_COUNT = 8;
const RECYCLE_POOL_MAX = 20;
const SCROLL_BOTTOM_THRESHOLD = 60;

const STYLES = `
:host {
  display: block;
  position: relative;
  overflow: hidden;
  contain: strict;
}
.vl-viewport {
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--sc-border, #444) transparent;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: auto;
}
.vl-viewport::-webkit-scrollbar { width: 6px; }
.vl-viewport::-webkit-scrollbar-track { background: transparent; }
.vl-viewport::-webkit-scrollbar-thumb {
  background: var(--sc-border, #444);
  border-radius: 3px;
}
.vl-content {
  position: relative;
  width: 100%;
  min-height: 100%;
}
.vl-item {
  position: absolute;
  left: 0;
  width: 100%;
  contain: layout style;
  will-change: transform;
}
.vl-sentinel {
  height: 1px;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.vl-badge {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--sc-accent, #6c63ff);
  color: #fff;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s ease, transform .2s ease;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0,0,0,.3);
  user-select: none;
}
.vl-badge.visible {
  opacity: 1;
  pointer-events: auto;
}
`;

/**
 * @typedef {Object} VirtualItem
 * @property {string} id
 * @property {HTMLElement} element
 * @property {number} height
 * @property {number} top
 */

class ScVirtualList extends HTMLElement {
  constructor() {
    super();

    /** @type {VirtualItem[]} */
    this._items = [];
    /** @type {Map<string, VirtualItem>} */
    this._itemMap = new Map();
    /** @type {Set<HTMLElement>} */
    this._rendered = new Set();
    /** @type {HTMLElement[]} */
    this._recyclePool = [];
    /** @type {number} */
    this._totalHeight = 0;
    /** @type {boolean} */
    this._isAtBottom = true;
    /** @type {number} */
    this._pendingNewMessages = 0;
    /** @type {boolean} */
    this._anchoring = false;

    this._resizeObserver = new ResizeObserver((entries) => this._onItemResize(entries));
    this._raf = null;

    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;

    this._viewport = document.createElement('div');
    this._viewport.className = 'vl-viewport';
    this._viewport.setAttribute('role', 'log');
    this._viewport.setAttribute('aria-live', 'polite');

    this._content = document.createElement('div');
    this._content.className = 'vl-content';

    this._sentinel = document.createElement('div');
    this._sentinel.className = 'vl-sentinel';

    this._badge = document.createElement('div');
    this._badge.className = 'vl-badge';
    this._badge.textContent = 'New messages ↓';
    this._badge.addEventListener('click', () => this.scrollToBottom(true));

    this._content.appendChild(this._sentinel);
    this._viewport.appendChild(this._content);

    shadow.appendChild(style);
    shadow.appendChild(this._viewport);
    shadow.appendChild(this._badge);
  }

  connectedCallback() {
    this._viewport.addEventListener('scroll', this._onScroll.bind(this), { passive: true });

    this._intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.dispatchEvent(new CustomEvent('load-more', { bubbles: true, composed: true }));
          }
        }
      },
      { root: this._viewport, rootMargin: '200px 0px 0px 0px' }
    );
    this._intersectionObserver.observe(this._sentinel);

    this._scheduleLayout();
  }

  disconnectedCallback() {
    this._intersectionObserver?.disconnect();
    this._resizeObserver?.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Append a single item to the end of the list.
   * @param {HTMLElement} el — element to append
   * @param {string} [id] — optional unique id (defaults to el.id or auto)
   */
  appendItem(el, id) {
    const itemId = id || el.id || `vl-${this._items.length}`;
    el.dataset.vlId = itemId;

    const item = { id: itemId, element: el, height: 0, top: 0 };
    this._items.push(item);
    this._itemMap.set(itemId, item);

    if (!this._isAtBottom) {
      this._pendingNewMessages++;
      this._updateBadge();
    }

    this._scheduleLayout();
  }

  /**
   * Prepend multiple items at the top (e.g. loading older messages).
   * Maintains scroll anchor so viewport doesn't jump.
   * @param {HTMLElement[]} els — elements to prepend (in display order)
   */
  prependItems(els) {
    if (!els.length) return;

    this._anchoring = true;
    const prevScrollTop = this._viewport.scrollTop;
    const prevTotalHeight = this._totalHeight;

    const newItems = els.map((el, i) => {
      const itemId = el.id || `vl-pre-${Date.now()}-${i}`;
      el.dataset.vlId = itemId;
      const item = { id: itemId, element: el, height: 0, top: 0 };
      this._itemMap.set(itemId, item);
      return item;
    });

    this._items.unshift(...newItems);
    this._recalcPositions();
    this._render();

    // Restore scroll position after layout
    requestAnimationFrame(() => {
      const heightDelta = this._totalHeight - prevTotalHeight;
      this._viewport.scrollTop = prevScrollTop + heightDelta;
      this._anchoring = false;
    });
  }

  /**
   * Smoothly scroll to the bottom of the list.
   * @param {boolean} [smooth=true] — use smooth scrolling
   */
  scrollToBottom(smooth = true) {
    this._pendingNewMessages = 0;
    this._updateBadge();

    if (smooth) {
      this._viewport.scrollTo({ top: this._totalHeight, behavior: 'smooth' });
    } else {
      this._viewport.scrollTop = this._totalHeight;
    }
    this._isAtBottom = true;
  }

  /**
   * Scroll to a specific item by id.
   * @param {string} id — item id
   * @returns {boolean} true if item was found
   */
  scrollToId(id) {
    const item = this._itemMap.get(id);
    if (!item) return false;

    this._viewport.scrollTo({ top: item.top, behavior: 'smooth' });
    return true;
  }

  /**
   * @returns {number} total number of items
   */
  get itemCount() {
    return this._items.length;
  }

  /* ------------------------------------------------------------------ */
  /*  Internal — layout & rendering                                     */
  /* ------------------------------------------------------------------ */

  /** Schedule a layout pass on the next animation frame. */
  _scheduleLayout() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._recalcPositions();
      this._render();
      if (this._isAtBottom) this.scrollToBottom(false);
    });
  }

  /** Recalculate item positions from scratch. */
  _recalcPositions() {
    let y = 0;
    for (const item of this._items) {
      item.top = y;
      if (item.height === 0) item.height = 48; // default estimate
      y += item.height;
    }
    this._totalHeight = y;
    this._content.style.height = `${y}px`;
  }

  /** Render only the visible items + buffer into the DOM. */
  _render() {
    const scrollTop = this._viewport.scrollTop;
    const viewHeight = this._viewport.clientHeight;
    const top = scrollTop;
    const bottom = scrollTop + viewHeight;

    // Find visible range via binary search
    let startIdx = this._bsearch(top) - BUFFER_COUNT;
    let endIdx = this._bsearch(bottom) + BUFFER_COUNT;
    startIdx = Math.max(0, startIdx);
    endIdx = Math.min(this._items.length - 1, endIdx);

    // Enforce max DOM nodes
    const visibleCount = endIdx - startIdx + 1;
    if (visibleCount > MAX_DOM_NODES) {
      const excess = visibleCount - MAX_DOM_NODES;
      startIdx += Math.floor(excess / 2);
      endIdx = startIdx + MAX_DOM_NODES - 1;
    }

    const needed = new Set();
    for (let i = startIdx; i <= endIdx; i++) {
      needed.add(this._items[i].id);
    }

    // Remove items no longer visible → recycle pool
    for (const el of this._rendered) {
      const id = el.dataset.vlId;
      if (!needed.has(id)) {
        this._resizeObserver.unobserve(el);
        el.remove();
        this._rendered.delete(el);
        this._recycle(el);
      }
    }

    // Add newly visible items
    for (let i = startIdx; i <= endIdx; i++) {
      const item = this._items[i];
      if (this._rendered.has(item.element)) {
        // Update position
        item.element.style.transform = `translateY(${item.top}px)`;
        continue;
      }

      const el = item.element;
      el.classList.add('vl-item');
      el.style.transform = `translateY(${item.top}px)`;

      this._content.appendChild(el);
      this._rendered.add(el);
      this._resizeObserver.observe(el);
    }
  }

  /**
   * Binary search for the item index at a given scroll offset.
   * @param {number} offset
   * @returns {number}
   */
  _bsearch(offset) {
    let lo = 0, hi = this._items.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const item = this._items[mid];
      if (item.top + item.height < offset) lo = mid + 1;
      else if (item.top > offset) hi = mid - 1;
      else return mid;
    }
    return lo;
  }

  /** Handle item resize via ResizeObserver. */
  _onItemResize(entries) {
    let changed = false;
    for (const entry of entries) {
      const el = entry.target;
      const id = el.dataset.vlId;
      const item = this._itemMap.get(id);
      if (!item) continue;

      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Math.abs(item.height - h) > 0.5) {
        item.height = h;
        changed = true;
      }
    }
    if (changed) this._scheduleLayout();
  }

  /** Handle scroll events. */
  _onScroll() {
    if (this._anchoring) return;

    const { scrollTop, scrollHeight, clientHeight } = this._viewport;
    this._isAtBottom = (scrollHeight - scrollTop - clientHeight) < SCROLL_BOTTOM_THRESHOLD;

    if (this._isAtBottom) {
      this._pendingNewMessages = 0;
      this._updateBadge();
    }

    this._scheduleLayout();
  }

  /** Update the "new messages" badge. */
  _updateBadge() {
    if (this._pendingNewMessages > 0) {
      this._badge.textContent = this._pendingNewMessages === 1
        ? '1 new message ↓'
        : `${this._pendingNewMessages} new messages ↓`;
      this._badge.classList.add('visible');
    } else {
      this._badge.classList.remove('visible');
    }
  }

  /**
   * Return an element to the recycle pool.
   * @param {HTMLElement} el
   */
  _recycle(el) {
    if (this._recyclePool.length < RECYCLE_POOL_MAX) {
      this._recyclePool.push(el);
    }
  }

  /**
   * Get a recycled element from the pool, or null.
   * @returns {HTMLElement|null}
   */
  getRecycled() {
    return this._recyclePool.pop() || null;
  }
}

customElements.define('sc-virtual-list', ScVirtualList);

export { ScVirtualList };
