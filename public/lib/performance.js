/**
 * Scratchy v2 — Performance Monitor
 * Web Vitals collection, custom metrics, DOM batching,
 * tile lazy loading, and memory pressure detection.
 * @module performance
 */

/** @type {PerfMonitor|null} */
let _instance = null;

/**
 * @typedef {Object} MetricSnapshot
 * @property {number|null} fcp — First Contentful Paint (ms)
 * @property {number|null} lcp — Largest Contentful Paint (ms)
 * @property {number|null} cls — Cumulative Layout Shift
 * @property {number|null} inp — Interaction to Next Paint (ms)
 * @property {Object<string, number>} tileRenders — id → duration ms
 * @property {number[]} wsLatencies — recent WS round-trip times
 * @property {number|null} memoryUsageMB — JS heap used (MB)
 * @property {number|null} deviceMemoryGB — navigator.deviceMemory
 */

class PerfMonitor {
  /**
   * Get the singleton instance.
   * @returns {PerfMonitor}
   */
  static getInstance() {
    if (!_instance) _instance = new PerfMonitor();
    return _instance;
  }

  constructor() {
    if (_instance) return _instance;
    _instance = this;

    /** @type {number|null} */ this._fcp = null;
    /** @type {number|null} */ this._lcp = null;
    /** @type {number}      */ this._cls = 0;
    /** @type {number|null} */ this._inp = null;

    /** @type {Map<string, number>} */
    this._tileRenders = new Map();

    /** @type {number[]} */
    this._wsLatencies = [];

    /** @type {number|null} */
    this._memoryUsageMB = null;

    /** @type {Map<string, number[]>} */
    this._customMetrics = new Map();

    /** @type {Array<{ metric: string, value: number, cb: Function }>} */
    this._thresholds = [];

    /** @type {IntersectionObserver|null} */
    this._tileObserver = null;

    /** @type {IntersectionObserver|null} */
    this._imageObserver = null;

    /** @type {boolean} */
    this._lowMemory = false;

    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  /** @private */
  _init() {
    this._observeWebVitals();
    this._detectMemoryPressure();

    // Tile lazy-load observer — toggles .sc-tile-visible
    if (typeof IntersectionObserver !== 'undefined') {
      this._tileObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const el = entry.target;
            if (entry.isIntersecting) {
              el.classList.add('sc-tile-visible');
              el.dispatchEvent(new CustomEvent('tile-visible', { bubbles: true }));
              el.dataset.scVisible = 'true';
              this._tileObserver.unobserve(el);
            }
          }
        },
        { rootMargin: '100px' }
      );

      // Image lazy-load observer — swaps data-src to src
      this._imageObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const img = /** @type {HTMLImageElement} */ (entry.target);
              const src = img.dataset.src;
              if (src) {
                img.src = src;
                delete img.dataset.src;
              }
              this._imageObserver.unobserve(img);
            }
          }
        },
        { rootMargin: '200px' }
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Web Vitals                                                        */
  /* ------------------------------------------------------------------ */

  /** @private */
  _observeWebVitals() {
    if (typeof PerformanceObserver === 'undefined') return;

    // FCP
    try {
      const fcpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this._fcp = Math.round(entry.startTime);
            this._checkThresholds('fcp', this._fcp);
            fcpObs.disconnect();
          }
        }
      });
      fcpObs.observe({ type: 'paint', buffered: true });
    } catch (_) { /* unsupported */ }

    // LCP
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) {
          this._lcp = Math.round(entries[entries.length - 1].startTime);
          this._checkThresholds('lcp', this._lcp);
        }
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) { /* unsupported */ }

    // CLS
    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            this._cls += entry.value;
            this._checkThresholds('cls', this._cls);
          }
        }
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });
    } catch (_) { /* unsupported */ }

    // INP (Interaction to Next Paint)
    try {
      const inpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = entry.duration;
          if (this._inp === null || duration > this._inp) {
            this._inp = Math.round(duration);
            this._checkThresholds('inp', this._inp);
          }
        }
      });
      inpObs.observe({ type: 'event', buffered: true });
    } catch (_) { /* unsupported */ }
  }

  /* ------------------------------------------------------------------ */
  /*  Custom Metrics                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Record a custom metric value.
   * @param {string} name — metric name
   * @param {number} value — metric value
   */
  record(name, value) {
    if (!this._customMetrics.has(name)) {
      this._customMetrics.set(name, []);
    }
    const arr = this._customMetrics.get(name);
    arr.push(value);
    // Keep last 100 per metric
    if (arr.length > 100) arr.splice(0, arr.length - 100);
    this._checkThresholds(name, value);
  }

  /**
   * Record a tile render duration.
   * @param {string} id — tile identifier
   * @param {number} ms — render duration in milliseconds
   */
  markTileRender(id, ms) {
    this._tileRenders.set(id, Math.round(ms));
    this._checkThresholds('tileRender', ms);
  }

  /**
   * Record a WebSocket round-trip latency.
   * @param {number} ms — latency in milliseconds
   */
  markWsLatency(ms) {
    this._wsLatencies.push(Math.round(ms));
    // Keep last 100
    if (this._wsLatencies.length > 100) {
      this._wsLatencies = this._wsLatencies.slice(-100);
    }
    this._checkThresholds('wsLatency', ms);
  }

  /**
   * Sample current memory usage (if available).
   */
  markMemoryUsage() {
    // @ts-ignore — performance.memory is Chrome-only
    const mem = performance.memory;
    if (mem) {
      this._memoryUsageMB = Math.round(mem.usedJSHeapSize / 1048576);
      this._checkThresholds('memory', this._memoryUsageMB);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  DOM Batching                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Batch DOM updates within a single animation frame with microtask flush.
   * Prevents layout thrashing by deferring reads/writes.
   * @param {Function} fn — function containing DOM mutations
   * @returns {Promise<void>}
   */
  batchDomUpdate(fn) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        fn();
        // Flush via microtask
        queueMicrotask(() => resolve());
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Tile Lazy Loading                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Observe a tile element for visibility-based lazy loading.
   * Toggles `.sc-tile-visible` class and fires `tile-visible` event.
   * @param {HTMLElement} element
   */
  observeTile(element) {
    if (this._tileObserver) {
      this._tileObserver.observe(element);
    } else {
      // Fallback: immediately mark as visible
      element.classList.add('sc-tile-visible');
      element.dataset.scVisible = 'true';
      element.dispatchEvent(new CustomEvent('tile-visible', { bubbles: true }));
    }
  }

  /**
   * Observe an image element for lazy loading.
   * Swaps `data-src` attribute to `src` when the image enters the viewport.
   * @param {HTMLImageElement} img
   */
  observeImage(img) {
    if (this._imageObserver) {
      this._imageObserver.observe(img);
    } else {
      // Fallback: immediately swap
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        delete img.dataset.src;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Memory Pressure                                                   */
  /* ------------------------------------------------------------------ */

  /** @private */
  _detectMemoryPressure() {
    // @ts-ignore
    const deviceMem = navigator.deviceMemory; // GB, Chrome only
    if (deviceMem && deviceMem <= 2) {
      this._lowMemory = true;
    }

    // @ts-ignore
    const mem = performance.memory;
    if (mem && mem.jsHeapSizeLimit) {
      const usageRatio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
      if (usageRatio > 0.85) this._lowMemory = true;
    }
  }

  /**
   * Whether the device is under memory pressure.
   * Use this to reduce pool sizes, disable animations, etc.
   * @returns {boolean}
   */
  get isLowMemory() {
    return this._lowMemory;
  }

  /**
   * Suggested pool size based on memory pressure.
   * @param {number} defaultSize — normal pool size
   * @returns {number}
   */
  suggestPoolSize(defaultSize) {
    return this._lowMemory ? Math.max(5, Math.floor(defaultSize / 2)) : defaultSize;
  }

  /* ------------------------------------------------------------------ */
  /*  Threshold Alerts                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Register a callback that fires when a metric exceeds a threshold.
   * @param {string} metric — metric name (fcp, lcp, cls, inp, wsLatency, memory, tileRender)
   * @param {number} value — threshold value
   * @param {Function} cb — callback(currentValue)
   */
  onThreshold(metric, value, cb) {
    this._thresholds.push({ metric, value, cb });
  }

  /** @private */
  _checkThresholds(metric, currentValue) {
    for (const t of this._thresholds) {
      if (t.metric === metric && currentValue > t.value) {
        try { t.cb(currentValue); } catch (_) { /* ignore */ }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Reporting                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Get a snapshot of all collected metrics.
   * @returns {MetricSnapshot}
   */
  getMetrics() {
    this.markMemoryUsage(); // refresh

    /** @type {Object<string, number[]>} */
    const custom = {};
    for (const [k, v] of this._customMetrics) {
      custom[k] = [...v];
    }

    return {
      fcp: this._fcp,
      lcp: this._lcp,
      cls: Math.round(this._cls * 1000) / 1000,
      inp: this._inp,
      tileRenders: Object.fromEntries(this._tileRenders),
      wsLatencies: [...this._wsLatencies],
      customMetrics: custom,
      memoryUsageMB: this._memoryUsageMB,
      deviceMemoryGB: typeof navigator !== 'undefined' ? (navigator.deviceMemory ?? null) : null,
    };
  }

  /**
   * Get a formatted performance report suitable for an analytics widget.
   * @returns {string}
   */
  getReport() {
    const m = this.getMetrics();
    const lines = ['── Performance Report ──'];

    // Web Vitals
    lines.push('');
    lines.push('Web Vitals:');
    lines.push(`  FCP: ${m.fcp !== null ? m.fcp + ' ms' : 'n/a'}`);
    lines.push(`  LCP: ${m.lcp !== null ? m.lcp + ' ms' : 'n/a'}`);
    lines.push(`  CLS: ${m.cls}`);
    lines.push(`  INP: ${m.inp !== null ? m.inp + ' ms' : 'n/a'}`);

    // WS Latency
    if (m.wsLatencies.length) {
      const avg = Math.round(
        m.wsLatencies.reduce((a, b) => a + b, 0) / m.wsLatencies.length
      );
      const max = Math.max(...m.wsLatencies);
      const min = Math.min(...m.wsLatencies);
      lines.push('');
      lines.push('WebSocket Latency:');
      lines.push(`  Avg: ${avg} ms | Min: ${min} ms | Max: ${max} ms`);
      lines.push(`  Samples: ${m.wsLatencies.length}`);
    }

    // Tile renders
    const tileCount = Object.keys(m.tileRenders).length;
    if (tileCount) {
      const vals = Object.values(m.tileRenders);
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      lines.push('');
      lines.push('Tile Renders:');
      lines.push(`  Count: ${tileCount} | Avg: ${avg} ms`);
    }

    // Custom metrics
    const customKeys = Object.keys(m.customMetrics);
    if (customKeys.length) {
      lines.push('');
      lines.push('Custom Metrics:');
      for (const key of customKeys) {
        const vals = m.customMetrics[key];
        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        lines.push(`  ${key}: avg=${avg} (${vals.length} samples)`);
      }
    }

    // Memory
    lines.push('');
    lines.push('Memory:');
    lines.push(`  JS Heap: ${m.memoryUsageMB !== null ? m.memoryUsageMB + ' MB' : 'n/a'}`);
    lines.push(`  Device: ${m.deviceMemoryGB !== null ? m.deviceMemoryGB + ' GB' : 'n/a'}`);
    lines.push(`  Pressure: ${this._lowMemory ? '⚠ LOW' : 'OK'}`);

    return lines.join('\n');
  }

  /**
   * Reset all collected metrics.
   */
  clear() {
    this._fcp = null;
    this._lcp = null;
    this._cls = 0;
    this._inp = null;
    this._tileRenders.clear();
    this._wsLatencies = [];
    this._customMetrics.clear();
    this._memoryUsageMB = null;
    this._thresholds = [];
  }
}

export { PerfMonitor };
export default PerfMonitor;
