/**
 * @skill accessibility
 * Keyboard navigation, ARIA patterns, focus management, state machines.
 * Inspired by: pi-interview-tool (keyboard nav, a11y patterns)
 * Agents: Interact
 */
export default {
  id: 'accessibility',
  name: 'Accessibility & Interaction',
  description: 'Keyboard navigation, ARIA roles/states, focus management, interaction state machines',
  category: 'frontend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Accessibility & Interaction

### Keyboard Navigation Patterns

**Focus trap (modals, dialogs, overlays)**
\`\`\`js
_trapFocus(e) {
  if (e.key !== 'Tab') return;
  const focusable = this.shadowRoot.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
\`\`\`

**Arrow key navigation (lists, grids, tabs)**
\`\`\`js
_handleArrowNav(e) {
  const items = [...this.shadowRoot.querySelectorAll('[role="option"]')];
  const current = items.indexOf(document.activeElement);
  let next = current;

  switch (e.key) {
    case 'ArrowDown': next = Math.min(current + 1, items.length - 1); break;
    case 'ArrowUp': next = Math.max(current - 1, 0); break;
    case 'Home': next = 0; break;
    case 'End': next = items.length - 1; break;
    default: return;
  }

  e.preventDefault();
  items[next].focus();
}
\`\`\`

**Escape always dismisses** — modals, dropdowns, popovers, tooltips, panels.

### ARIA Patterns

**Tabs**
\`\`\`html
<div role="tablist" aria-label="Settings">
  <button role="tab" aria-selected="true" aria-controls="panel-1" id="tab-1">General</button>
  <button role="tab" aria-selected="false" aria-controls="panel-2" id="tab-2" tabindex="-1">Advanced</button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">...</div>
<div role="tabpanel" id="panel-2" aria-labelledby="tab-2" hidden>...</div>
\`\`\`

**Listbox**
\`\`\`html
<ul role="listbox" aria-label="Select agent">
  <li role="option" aria-selected="true" tabindex="0">Atlas</li>
  <li role="option" aria-selected="false" tabindex="-1">Iris</li>
</ul>
\`\`\`

**Dialog**
\`\`\`html
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm Delete</h2>
  <p>This action cannot be undone.</p>
  <button autofocus>Cancel</button>
  <button>Delete</button>
</div>
\`\`\`

**Live regions (status updates)**
\`\`\`html
<div role="status" aria-live="polite" aria-atomic="true">3 items loaded</div>
<div role="alert" aria-live="assertive">Error: connection lost</div>
\`\`\`

### State Machine Pattern
\`\`\`js
// Component states with transitions
const STATES = {
  idle: { submit: 'loading', reset: 'idle' },
  loading: { success: 'success', error: 'error', cancel: 'idle' },
  success: { reset: 'idle', submit: 'loading' },
  error: { retry: 'loading', reset: 'idle' },
};

_transition(event) {
  const nextState = STATES[this._state.current]?.[event];
  if (!nextState) return; // invalid transition — ignore
  this._state.current = nextState;
  this.setAttribute('data-state', nextState);
  this.render();
}
\`\`\`

**CSS for states:**
\`\`\`css
:host([data-state="loading"]) .spinner { display: block; }
:host([data-state="loading"]) .submit-btn { opacity: 0.5; pointer-events: none; }
:host([data-state="error"]) .error-msg { display: block; }
:host([data-state="success"]) .success-msg { display: block; }
\`\`\`

### Interaction Rules
- Focus visible: always show focus indicator (outline or custom using --sc-accent)
- Color is never the only signal — add icons, text, or patterns
- Touch targets: minimum 44x44px on mobile
- Loading states: skeleton or spinner, never blank
- Error states: explain what happened + what user can do
- Reduced motion: respect \`prefers-reduced-motion: reduce\`
- Auto-focus: first actionable element when panel/modal opens
- Screen readers: test with VoiceOver (macOS) or NVDA (Windows)`,
};
