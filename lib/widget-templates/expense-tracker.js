import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'expense-tracker',
  name: 'Expense Tracker',
  description: 'Track expenses by category with totals and distribution bar.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', default: 'Monthly Expenses', description: 'Tracker title' },
      currency: { type: 'string', default: '$', description: 'Currency symbol' },
      categories: { type: 'array', items: { type: 'string' }, default: ['Food', 'Transport', 'Entertainment', 'Other'], description: 'Expense categories' },
    },
  },
  defaults: {
    title: 'Monthly Expenses',
    currency: '$',
    categories: ['Food', 'Transport', 'Entertainment', 'Other'],
    expenses: [
      { id: 1, name: 'Groceries', amount: 75.50, category: 'Food' },
      { id: 2, name: 'Bus Ticket', amount: 2.50, category: 'Transport' },
      { id: 3, name: 'Movie Night', amount: 30.00, category: 'Entertainment' },
    ],
    _totalDisplay: '108.00',
    _segments: [],
    _categoryOptions: [],
    _nextId: 4,
  },
  html: `
    <div class="expense-tracker wt-card">
      <div class="total-display">
        <div class="total-label">Total</div>
        <div class="total-amount">{{currency}}{{_totalDisplay}}</div>
      </div>

      <div class="category-bar">
        {{#each _segments}}
          <div class="category-segment" style="width: {{pct}}%; background-color: {{color}};"></div>
        {{/each}}
      </div>

      <h3 class="wt-header">Add Expense</h3>
      <div class="add-form">
        <input type="text" class="wt-input" placeholder="Name" data-action="field-input" data-field="name">
        <input type="number" class="wt-input amount-input" placeholder="Amount" data-action="field-input" data-field="amount">
        <select class="wt-input category-select" data-action="field-input" data-field="category">
          {{#each _categoryOptions}}
            <option value="{{value}}">{{value}}</option>
          {{/each}}
        </select>
        <button class="wt-btn primary add-btn" data-action="click" data-btn="add">Add</button>
      </div>

      <h3 class="wt-header">Expenses</h3>
      {{#if expenses}}
        <ul class="expense-list">
          {{#each expenses}}
            <li class="expense-item">
              <span class="expense-name">{{name}}</span>
              <span class="wt-badge category-badge">{{category}}</span>
              <span class="expense-amount">{{_amountDisplay}}</span>
              <button class="wt-btn ghost sm icon-only delete-btn" data-action="click" data-btn="delete" data-expense-id="{{id}}">✕</button>
            </li>
          {{/each}}
        </ul>
      {{/if}}
      {{#unless expenses}}
        <div class="wt-empty">No expenses yet.</div>
      {{/unless}}
    </div>
  `,
  css: BASE_CSS + `
    .expense-tracker {
      display: flex;
      flex-direction: column;
      gap: 15px;
      padding: 15px;
      min-width: 300px;
    }
    .total-display {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--wt-border);
    }
    .total-label { font-size: 0.9rem; color: var(--wt-text-muted); }
    .total-amount {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--wt-accent);
      font-family: var(--wt-mono);
    }
    .category-bar {
      display: flex;
      width: 100%;
      height: 6px;
      border-radius: var(--wt-radius-pill);
      overflow: hidden;
      background-color: var(--wt-surface-hover);
    }
    .category-segment { height: 100%; transition: width 0.3s ease; }
    .add-form {
      display: grid;
      grid-template-columns: 2fr 1fr 1.5fr auto;
      gap: 8px;
      align-items: stretch;
    }
    .amount-input { max-width: 100px; }
    .add-btn { white-space: nowrap; min-width: 60px; }
    @media (max-width: 400px) {
      .add-form {
        grid-template-columns: 1fr 1fr;
      }
      .add-form input:first-child { grid-column: 1 / 3; }
      .amount-input { max-width: none; }
      .add-btn { grid-column: 1 / 3; }
    }
    .expense-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .expense-item {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      background: var(--wt-surface);
      border-radius: var(--wt-radius-sm);
      border: 1px solid var(--wt-border);
      transition: background 0.15s, border-color 0.15s;
    }
    .expense-item:hover {
      background: var(--wt-surface-hover);
      border-color: var(--wt-border-strong);
    }
    .expense-name {
      flex: 1;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 8px;
    }
    .expense-amount {
      font-family: var(--wt-mono);
      font-weight: 500;
      margin-left: auto;
      margin-right: 8px;
      font-size: 0.9rem;
    }
    .expense-item .category-badge { margin-right: 8px; flex-shrink: 0; }
    .delete-btn {
      opacity: 0;
      transition: opacity 0.15s;
      margin-left: 4px;
      color: var(--wt-text-dim);
    }
    .expense-item:hover .delete-btn { opacity: 1; }
    .delete-btn:hover { color: var(--wt-error); }
  `,
  js: `
    const COLORS = { Food: '#ef4444', Transport: '#f59e0b', Entertainment: '#3b82f6', Other: '#8a7e6a' };

    const recompute = () => {
      // Total
      const total = data.expenses.reduce((s, e) => s + e.amount, 0);
      data._totalDisplay = total.toFixed(2);

      // Amount display per expense (with currency)
      data.expenses.forEach(e => { e._amountDisplay = data.currency + e.amount.toFixed(2); });

      // Category bar segments
      const catTotals = {};
      data.categories.forEach(c => catTotals[c] = 0);
      data.expenses.forEach(e => { if (catTotals[e.category] !== undefined) catTotals[e.category] += e.amount; });
      data._segments = data.categories.map(c => ({
        category: c,
        pct: total > 0 ? ((catTotals[c] / total) * 100).toFixed(1) : '0',
        color: COLORS[c] || '#cccccc',
      }));

      // Category options for select
      data._categoryOptions = data.categories.map(c => ({ value: c }));
    };

    if (!data._formState) data._formState = { name: '', amount: '', category: data.categories[0] };

    switch (action) {
      case 'init':
        recompute();
        render();
        return true;

      case 'field-input':
        data._formState[payload.field] = payload.value;
        return true; // Don't re-render on every keystroke

      case 'click':
        if (payload.btn === 'add') {
          const name = (data._formState.name || '').trim();
          const amount = parseFloat(data._formState.amount);
          if (name && !isNaN(amount) && amount > 0) {
            data.expenses.push({
              id: data._nextId++,
              name,
              amount: parseFloat(amount.toFixed(2)),
              category: data._formState.category || data.categories[0],
            });
            data._formState = { name: '', amount: '', category: data.categories[0] };
            recompute();
            render();
          }
        } else if (payload.btn === 'delete') {
          const id = parseInt(payload.expenseId);
          data.expenses = data.expenses.filter(e => e.id !== id);
          recompute();
          render();
        }
        return true;
    }
    return false;
  `,
  actions: [
    { name: 'click', emits: 'click' },
    { name: 'field-input', emits: 'field-input' },
  ],
};
