/**
 * Typing indicator behavioral tests.
 *
 * NullClaw philosophy: test every behavior, every edge case.
 * Each test answers: "When X happens, what should the user see?"
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDOM, createEventBus, countElements, isVisible, wait } from './helpers/dom-mock.js';

// ── Wire up the typing handler (extracted from app.js logic) ──
// We test the BEHAVIOR, not the module — so we re-implement the wiring
// using the same logic as app.js, against our mock DOM + event bus.

function wireTypingHandler(bus, $messages, $statusText, $thinkingIndicator) {
  let _typingSafetyTimer = null;

  function clearAllTypingIndicators() {
    if (!$messages) return;
    $messages.querySelectorAll('.typing-indicator').forEach(el => el.remove());
  }

  bus.on('typing', (msg) => {
    if ($statusText) {
      if (msg.status === 'start') {
        $statusText.textContent = 'Thinking…';
      } else {
        $statusText.textContent = 'Connected';
      }
    }
    if ($messages) {
      if (msg.status === 'start') {
        clearAllTypingIndicators();
        const el = $messages.ownerDocument.createElement('div');
        el.className = 'typing-indicator';
        el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
        $messages.appendChild(el);
        clearTimeout(_typingSafetyTimer);
        _typingSafetyTimer = setTimeout(clearAllTypingIndicators, 120000);
      } else {
        clearAllTypingIndicators();
        clearTimeout(_typingSafetyTimer);
      }
    }
  });

  bus.on('team-message-end', () => {
    clearAllTypingIndicators();
    clearTimeout(_typingSafetyTimer);
    if ($statusText) $statusText.textContent = 'Connected';
  });

  bus.on('team-error', () => {
    clearAllTypingIndicators();
    clearTimeout(_typingSafetyTimer);
    if ($statusText) $statusText.textContent = 'Connected';
  });

  bus.on('chat-stream', () => {
    $messages.querySelectorAll('.typing-indicator').forEach(el => el.remove());
  });

  return { clearAllTypingIndicators };
}

// ── Wire up activity monitor (thinking indicator) ──
function wireActivityMonitor(bus, $thinkingIndicator) {
  let _state = 'idle';

  function setState(s) {
    _state = s;
    if ($thinkingIndicator) {
      $thinkingIndicator.style.display = s === 'thinking' ? '' : 'none';
    }
  }

  bus.on('typing', (msg) => {
    if (msg.status === 'start') setState('thinking');
    else if (msg.status === 'stop') setState('idle');
  });

  bus.on('chat-stream', () => setState('idle'));
  bus.on('chat-stream-end', () => setState('idle'));
  bus.on('team-message-end', () => setState('idle'));
  bus.on('team-error', () => setState('idle'));

  return { getState: () => _state };
}

// ── Tests ──

describe('Typing Indicators — Chat Area (.typing-indicator)', () => {
  let env, bus, $messages, $statusText;

  beforeEach(() => {
    env = createDOM();
    bus = createEventBus();
    $messages = env.document.getElementById('messages');
    $statusText = env.document.getElementById('status-text');
    const $thinking = env.document.getElementById('thinking-indicator');
    wireTypingHandler(bus, $messages, $statusText, $thinking);
  });

  afterEach(() => {
    bus.removeAll();
    env.cleanup();
  });

  it('typing start creates exactly one indicator', () => {
    bus.emit('typing', { status: 'start' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);
  });

  it('typing stop removes the indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'stop' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
  });

  it('two rapid typing starts produce only one indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'start' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);
  });

  it('three rapid typing starts still produce only one indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'start' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);
  });

  it('start-stop-start cycle leaves exactly one indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'stop' });
    bus.emit('typing', { status: 'start' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);
  });

  it('typing stop with no indicator is a no-op', () => {
    bus.emit('typing', { status: 'stop' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
  });

  it('status text updates on start and stop', () => {
    bus.emit('typing', { status: 'start' });
    assert.equal($statusText.textContent, 'Thinking…');
    bus.emit('typing', { status: 'stop' });
    assert.equal($statusText.textContent, 'Connected');
  });

  it('chat-stream clears typing indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('chat-stream', { delta: 'Hello' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
  });

  it('team-message-end clears typing indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-message-end', { teamId: 't1' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
  });

  it('team-message-end resets status text', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-message-end', {});
    assert.equal($statusText.textContent, 'Connected');
  });

  it('team-error clears typing indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-error', { error: 'busy' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
  });

  it('team-error resets status text', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-error', { error: 'busy' });
    assert.equal($statusText.textContent, 'Connected');
  });

  it('indicator does not leak into other DOM elements', () => {
    bus.emit('typing', { status: 'start' });
    const outside = env.document.querySelectorAll('body > .typing-indicator');
    assert.equal(outside.length, 0, 'indicator should only exist inside #messages');
  });

  it('indicator contains exactly 3 dots', () => {
    bus.emit('typing', { status: 'start' });
    const indicator = $messages.querySelector('.typing-indicator');
    assert.equal(indicator.querySelectorAll('.typing-dot').length, 3);
  });
});

describe('Typing Indicators — Thinking Indicator (#thinking-indicator)', () => {
  let env, bus, $thinking, monitor;

  beforeEach(() => {
    env = createDOM();
    bus = createEventBus();
    $thinking = env.document.getElementById('thinking-indicator');
    monitor = wireActivityMonitor(bus, $thinking);
  });

  afterEach(() => {
    bus.removeAll();
    env.cleanup();
  });

  it('starts hidden', () => {
    assert.equal(isVisible($thinking), false);
    assert.equal(monitor.getState(), 'idle');
  });

  it('typing start shows thinking indicator', () => {
    bus.emit('typing', { status: 'start' });
    assert.equal(isVisible($thinking), true);
    assert.equal(monitor.getState(), 'thinking');
  });

  it('typing stop hides thinking indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'stop' });
    assert.equal(isVisible($thinking), false);
    assert.equal(monitor.getState(), 'idle');
  });

  it('chat-stream hides thinking indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('chat-stream', { delta: 'hi' });
    assert.equal(isVisible($thinking), false);
  });

  it('chat-stream-end hides thinking indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('chat-stream-end', {});
    assert.equal(isVisible($thinking), false);
  });

  it('team-message-end hides thinking indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-message-end', {});
    assert.equal(isVisible($thinking), false);
    assert.equal(monitor.getState(), 'idle');
  });

  it('team-error hides thinking indicator', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-error', { error: 'fail' });
    assert.equal(isVisible($thinking), false);
  });

  it('multiple typing starts keep indicator visible (no flicker)', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'start' });
    assert.equal(isVisible($thinking), true);
  });
});

describe('Typing Indicators — Combined (both systems)', () => {
  let env, bus, $messages, $thinking;

  beforeEach(() => {
    env = createDOM();
    bus = createEventBus();
    $messages = env.document.getElementById('messages');
    $thinking = env.document.getElementById('thinking-indicator');
    const $statusText = env.document.getElementById('status-text');
    wireTypingHandler(bus, $messages, $statusText, $thinking);
    wireActivityMonitor(bus, $thinking);
  });

  afterEach(() => {
    bus.removeAll();
    env.cleanup();
  });

  it('typing start activates both indicators', () => {
    bus.emit('typing', { status: 'start' });
    assert.equal(countElements($messages, '.typing-indicator'), 1, 'chat dots');
    assert.equal(isVisible($thinking), true, 'thinking indicator');
  });

  it('typing stop clears both indicators', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('typing', { status: 'stop' });
    assert.equal(countElements($messages, '.typing-indicator'), 0, 'chat dots cleared');
    assert.equal(isVisible($thinking), false, 'thinking indicator hidden');
  });

  it('team-message-end clears both indicators', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-message-end', {});
    assert.equal(countElements($messages, '.typing-indicator'), 0, 'chat dots cleared');
    assert.equal(isVisible($thinking), false, 'thinking indicator hidden');
  });

  it('full team lifecycle: start → stop → no stale indicators', () => {
    // Simulate full team routing cycle
    bus.emit('typing', { status: 'start', agentId: 'orch-1' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);

    // Workers execute (typing stays)
    bus.emit('team-delegation', { status: 'start', agentName: 'Worker1' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);

    // Synthesis phase
    bus.emit('typing', { status: 'start', agentId: 'orch-1', turn: 'synthesis' });
    assert.equal(countElements($messages, '.typing-indicator'), 1);

    // Complete
    bus.emit('typing', { status: 'stop', agentId: 'orch-1' });
    bus.emit('team-message-end', { teamId: 't1' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
    assert.equal(isVisible($thinking), false);
  });

  it('error during team routing clears everything', () => {
    bus.emit('typing', { status: 'start' });
    bus.emit('team-error', { error: 'timeout' });
    assert.equal(countElements($messages, '.typing-indicator'), 0);
    assert.equal(isVisible($thinking), false);
  });
});

describe('Send Debounce', () => {
  let env, bus, sentMessages;

  function wireSendHandler(bus, $msgInput) {
    let _sendGuard = false;
    sentMessages = [];

    return function sendMessage() {
      const text = $msgInput.value.trim();
      if (!text || _sendGuard) return;
      _sendGuard = true;
      setTimeout(() => { _sendGuard = false; }, 500);
      sentMessages.push(text);
      $msgInput.value = '';
    };
  }

  beforeEach(() => {
    env = createDOM();
    bus = createEventBus();
  });

  afterEach(() => {
    bus.removeAll();
    env.cleanup();
  });

  it('single send goes through', () => {
    const $input = env.document.getElementById('msg-input');
    const send = wireSendHandler(bus, $input);
    $input.value = 'hello';
    send();
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0], 'hello');
  });

  it('empty input is rejected', () => {
    const $input = env.document.getElementById('msg-input');
    const send = wireSendHandler(bus, $input);
    $input.value = '   ';
    send();
    assert.equal(sentMessages.length, 0);
  });

  it('double-send within 500ms sends only once', () => {
    const $input = env.document.getElementById('msg-input');
    const send = wireSendHandler(bus, $input);
    $input.value = 'hello';
    send();
    $input.value = 'hello'; // re-type (simulating no clear yet)
    send();
    assert.equal(sentMessages.length, 1);
  });

  it('rapid triple-send sends only once', () => {
    const $input = env.document.getElementById('msg-input');
    const send = wireSendHandler(bus, $input);
    $input.value = 'test';
    send();
    $input.value = 'test';
    send();
    $input.value = 'test';
    send();
    assert.equal(sentMessages.length, 1);
  });

  it('send clears input', () => {
    const $input = env.document.getElementById('msg-input');
    const send = wireSendHandler(bus, $input);
    $input.value = 'hello';
    send();
    assert.equal($input.value, '');
  });

  it('guard resets after timeout', async () => {
    const $input = env.document.getElementById('msg-input');
    const send = wireSendHandler(bus, $input);
    $input.value = 'first';
    send();
    await wait(600); // Wait for guard to reset
    $input.value = 'second';
    send();
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[1], 'second');
  });
});
