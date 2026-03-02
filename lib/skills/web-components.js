/**
 * @skill web-components
 * Shadow DOM, custom elements, event system, reactive state.
 * Inspired by: pi-interview-tool (interactive form patterns)
 * Agents: Component
 */
export default {
  id: 'web-components',
  name: 'Web Components',
  description: 'Custom elements, shadow DOM, event delegation, reactive state, form patterns',
  category: 'frontend',
  source: 'custom',
  version: '1.0.0',
  prompt: `## Skill: Web Components

### Component Skeleton
\`\`\`js
class ScWidgetName extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._state = {};
  }

  static get observedAttributes() { return ['open', 'mode']; }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  disconnectedCallback() {
    this._cleanup();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal) this.render();
  }

  // State management — trigger re-render on state change
  _setState(patch) {
    Object.assign(this._state, patch);
    this.render();
  }

  // Event binding — store references for cleanup
  _bindEvents() {
    this._onClick = (e) => { /* handle */ };
    this.shadowRoot.addEventListener('click', this._onClick);
  }

  _cleanup() {
    if (this._onClick) this.shadowRoot.removeEventListener('click', this._onClick);
  }

  render() {
    this.shadowRoot.innerHTML = \\\`
      <style>/* Shadow DOM styles using --sc-* tokens */</style>
      <div class="container">...</div>
    \\\`;
    // Re-bind events after innerHTML replace
    this._bindEvents();
  }
}

customElements.define('sc-widget-name', ScWidgetName);
export default ScWidgetName;
\`\`\`

### Shadow DOM Rules
- ALL styles inside shadow DOM \`<style>\` tag — no global CSS leakage
- Use CSS custom properties (--sc-*) for theming — they pierce shadow DOM
- Slots for content projection: \`<slot name="header"></slot>\`
- \`::slotted()\` for styling projected content
- Never use \`!important\` — shadow DOM specificity is already isolated

### Event System
- Outbound events (component → parent): \`CustomEvent\` with \`{ bubbles: true, composed: true }\`
- Inbound events (parent → component): attributes, properties, or method calls
- Event naming: lowercase hyphenated: \`widget-action\`, \`state-change\`
- Always include \`detail\` object with relevant data
- composed: true required for events to cross shadow DOM boundary

\`\`\`js
this.dispatchEvent(new CustomEvent('widget-action', {
  bubbles: true,
  composed: true,
  detail: { action: 'save', data: formData }
}));
\`\`\`

### Form Patterns (from pi-interview-tool research)
- Keyboard navigation: Tab between fields, Enter to submit, Escape to cancel
- Form validation: validate on blur (not on every keystroke), show errors inline
- Auto-focus: first empty required field on render
- Submit state: disable button + show spinner, re-enable on response
- Field types: text, email, number, textarea, select, toggle, date, file, password, richtext
- Always use \`<label>\` with \`for\` attribute or wrap input in label

### Performance
- Avoid innerHTML for frequent updates — use targeted DOM manipulation
- Use document fragments for batch DOM inserts
- Debounce render calls (requestAnimationFrame)
- Clean up all event listeners in disconnectedCallback
- Cancel pending fetches/timers in disconnectedCallback`,
};
