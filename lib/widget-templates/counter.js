
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'counter',
  name: 'Simple Counter',
  description: 'A basic counter with increment, decrement, and reset functionality.',
  schema: {
    type: 'object',
    properties: {
      label: { type: 'string', title: 'Counter Label' },
      value: { type: 'number', title: 'Initial Value', default: 0 },
      min: { type: 'number', title: 'Minimum Value', default: 0 },
      max: { type: 'number', title: 'Maximum Value', default: 100 },
      step: { type: 'number', title: 'Step Increment/Decrement', default: 1 }
    },
    required: ['label']
  },
  defaults: {
    // No specific defaults, as `value` comes from config with a default
  },
  html: `
    <div class="counter-widget">
      <p class="counter-label wt-text-muted">{{label}}</p>
      <div class="counter-display">
        <button class="wt-btn icon-only" data-action="decrement">-</button>
        <span class="counter-value">{{value}}</span>
        <button class="wt-btn icon-only" data-action="increment">+</button>
      </div>
      <button class="wt-btn ghost reset-btn" data-action="reset">Reset</button>
    </div>
  `,
  css: BASE_CSS + '\n' + `
    .counter-widget {
      padding: 15px;
      background: var(--wt-surface);
      border-radius: var(--wt-radius);
      border: 1px solid var(--wt-border);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
    }
    .counter-label {
      font-size: 0.8rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .counter-display {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .counter-value {
      font-family: var(--wt-mono);
      font-size: 2rem;
      font-weight: 700;
      color: var(--wt-text);
      min-width: 60px; /* Ensure consistent width */
      text-align: center;
    }
    .counter-display .wt-btn {
      width: 36px;
      height: 36px;
      border-radius: var(--wt-radius-sm);
      font-size: 1.2rem;
      font-weight: 600;
      padding: 0;
    }
    .reset-btn {
      font-size: 0.8rem;
      padding: 4px 12px;
    }
  `,
  js: `
    // Store initial value from config to use for reset
    if (data._initialValue === undefined) {
      data._initialValue = data.value;
    }

    if (action === 'increment') {
      const newValue = data.value + data.step;
      if (newValue <= data.max) {
        data.value = newValue;
        render();
      }
      return true;
    }

    if (action === 'decrement') {
      const newValue = data.value - data.step;
      if (newValue >= data.min) {
        data.value = newValue;
        render();
      }
      return true;
    }

    if (action === 'reset') {
      data.value = data._initialValue;
      render();
      return true;
    }

    return false;
  `,
  actions: [
    { name: 'increment', emits: 'increment' },
    { name: 'decrement', emits: 'decrement' },
    { name: 'reset', emits: 'reset' },
  ],
};
