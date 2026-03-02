/**
 * DOM + WS event mock for client-side behavioral tests.
 * 
 * Provides a minimal jsdom environment and a fake WS event bus
 * that mirrors ws-client.js's on/emit interface. Tests simulate
 * server events by calling emit() and assert DOM state.
 *
 * Philosophy (NullClaw-style): test BEHAVIORS, not implementation.
 * "When X happens, Y should be true" — not "function Z was called."
 */

import { JSDOM } from 'jsdom';

/**
 * Create a fresh DOM environment with Scratchy's base HTML structure.
 * Returns { document, window, cleanup }.
 */
export function createDOM(extraHTML = '') {
  const dom = new JSDOM(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <div id="status-text">Connected</div>
  <div id="messages" class="messages"></div>
  <div class="msg-thinking" id="thinking-indicator" style="display:none">
    <div class="dot"></div><div class="dot"></div><div class="dot"></div>
  </div>
  <textarea id="msg-input"></textarea>
  <button id="send-btn">Send</button>
  <div id="team-banner" class="hidden"></div>
  <div id="team-banner-name"></div>
  <div id="team-banner-agents"></div>
  <button id="team-exit-btn"></button>
  ${extraHTML}
</body>
</html>`, {
    url: 'https://scratchy.test',
    pretendToBeVisual: true,
  });

  return {
    document: dom.window.document,
    window: dom.window,
    dom,
    cleanup: () => dom.window.close(),
  };
}

/**
 * Create a fake WS event bus (mirrors ws-client.js on/emit).
 * Tests call bus.emit('typing', { status: 'start' }) to simulate server events.
 * Production code calls bus.on('typing', handler) to register.
 */
export function createEventBus() {
  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event, data) {
    const fns = listeners.get(event);
    if (fns) fns.forEach(fn => fn(data));
  }

  function removeAll() {
    listeners.clear();
  }

  return { on, emit, removeAll };
}

/**
 * Count elements matching a selector in a container.
 */
export function countElements(container, selector) {
  return container.querySelectorAll(selector).length;
}

/**
 * Check if an element is visible (not display:none).
 */
export function isVisible(el) {
  if (!el) return false;
  return el.style.display !== 'none';
}

/**
 * Flush pending timers (setTimeout/setInterval) up to N ms.
 * Uses a simple approach: advance fake timers.
 * NOTE: For real timer control, tests should use node:timers/promises or sinon.
 */
export function wait(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
