import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'counter',
  name: 'Simple Counter',
  description: 'Increment/decrement counter with configurable step, min, and max.',
  schema: {
    type: 'object',
    properties: {
      label: { type: 'string', title: 'Counter Label' },
      value: { type: 'number', title: 'Initial Value', default: 0 },
      min: { type: 'number', title: 'Minimum Value', default: 0 },
      max: { type: 'number', title: 'Maximum Value', default: 100 },
      step: { type: 'number', title: 'Step Size', default: 1 },
    },
    required: ['label'],
  },
  defaults: {
    label: 'Counter',
    value: 0,
    min: 0,
    max: 100,
    step: 1,
    _initialValue: 0,
  },
  html: `
    <div class="counter-widget">
      <p class="counter-label wt-text-muted">{{label}}</p>
      <div class="counter-display">
        <button class="wt-btn icon-only" data-action="click" data-btn="dec">−</button>
        <span class="counter-value">{{value}}</span>
        <button class="wt-btn icon-only" data-action="click" data-btn="inc">+</button>
      </div>
      <button class="wt-btn ghost reset-btn" data-action="click" data-btn="reset">Reset</button>
    </div>
  `,
  css: BASE_CSS + `
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
      min-width: 60px;
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
    if (data._initialValue === undefined) data._initialValue = data.value;

    if (action === 'click') {
      if (payload.btn === 'inc') {
        const nv = data.value + data.step;
        if (nv <= data.max) data.value = nv;
      } else if (payload.btn === 'dec') {
        const nv = data.value - data.step;
        if (nv >= data.min) data.value = nv;
      } else if (payload.btn === 'reset') {
        data.value = data._initialValue;
      }
      render();
      return true;
    }
    return false;
  `,
  actions: [
    { name: 'click', emits: 'click' },
  ],
};
