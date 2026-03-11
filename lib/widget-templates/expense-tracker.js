import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'expense-tracker',
  name: 'Expense Tracker',
  description: 'Track your monthly expenses by category.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', default: 'Monthly Expenses', description: 'Title of the expense tracker' },
      currency: { type: 'string', default: '$', description: 'Currency symbol' },
      categories: { type: 'array', items: { type: 'string' }, default: ['Food', 'Transport', 'Entertainment', 'Other'], description: 'List of expense categories' },
    },
  },
  defaults: {
    expenses: [
      { id: Date.now() + 1, name: 'Groceries', amount: 75.50, category: 'Food' },
      { id: Date.now() + 2, name: 'Bus Ticket', amount: 2.50, category: 'Transport' },
      { id: Date.now() + 3, name: 'Movie Night', amount: 30.00, category: 'Entertainment' },
    ],
    _inputName: '',
    _inputAmount: '',
    _inputCategory: 'Food',
  },
  html: `
    <div class="expense-tracker-container wt-card">
      <div class="total-display">
        <div class="total-label">Total</div>
        <div class="total-amount">{{currency}}{{totalExpenses}}</div>
      </div>

      <div class="category-bar-container">
        {{#each categoryBreakdown}}
          <div class="category-segment" style="width: {{percentage}}%; background-color: {{color}};"></div>
        {{/each}}
      </div>

      <h3 class="wt-header">Add New Expense</h3>
      <div class="add-expense-form">
        <input type="text" class="wt-input" placeholder="Expense Name" data-action="input-change" data-field="_inputName" value="{{_inputName}}">
        <input type="number" class="wt-input amount-input" placeholder="Amount" data-action="input-change" data-field="_inputAmount" value="{{_inputAmount}}">
        <select class="wt-input category-select" data-action="input-change" data-field="_inputCategory">
          {{#each config.categories}}
            <option value="{{this}}" {{#if (eq this ../_inputCategory)}}selected{{/if}}>{{this}}</option>
          {{/each}}
        </select>
        <button class="wt-btn primary add-btn" data-action="click" data-btn="add">Add</button>
      </div>

      <h3 class="wt-header">Expense List</h3>
      {{#if expenses.length}}
        <ul class="expense-list">
          {{#each expenses}}
            <li class="expense-item">
              <span class="expense-name">{{name}}</span>
              <span class="wt-badge category-badge">{{category}}</span>
              <span class="expense-amount">{{../currency}}{{amount}}</span>
              <button class="wt-btn ghost sm icon-only delete-btn" data-action="click" data-btn="delete" data-expense-id="{{id}}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
              </button>
            </li>
          {{/each}}
        </ul>
      {{else}}
        <div class="wt-empty">No expenses added yet.</div>
      {{/if}}
    </div>
  `,
  css: BASE_CSS + `
    .expense-tracker-container {
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
    .total-label {
      font-size: 0.9rem;
      color: var(--wt-text-muted);
    }
    .total-amount {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--wt-accent);
      font-family: var(--wt-mono);
    }

    .category-bar-container {
      display: flex;
      width: 100%;
      height: 6px;
      border-radius: var(--wt-radius-pill);
      overflow: hidden;
      background-color: var(--wt-surface-hover);
      margin-bottom: 15px;
    }
    .category-segment {
      height: 100%;
      transition: width var(--wt-transition);
    }
    /* Category colors - can be expanded or made dynamic via JS if needed */
    .category-badge[data-category="Food"] { background-color: #ef4444; color: var(--wt-bg); }
    .category-badge[data-category="Transport"] { background-color: #f59e0b; color: var(--wt-bg); }
    .category-badge[data-category="Entertainment"] { background-color: #3b82f6; color: var(--wt-bg); }
    .category-badge[data-category="Other"] { background-color: #8a7e6a; color: var(--wt-bg); }

    .add-expense-form {
      display: grid;
      grid-template-columns: 2fr 1fr 1.5fr auto;
      gap: 8px;
      align-items: stretch;
    }
    .add-expense-form .amount-input {
      max-width: 100px;
    }
    .add-expense-form .add-btn {
      white-space: nowrap;
      min-width: 60px;
    }
    @media (max-width: 400px) {
      .add-expense-form {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
      }
      .add-expense-form input:nth-child(1) { grid-column: 1 / 3; }
      .add-expense-form .amount-input { grid-column: 1 / 2; max-width: none; }
      .add-expense-form .category-select { grid-column: 2 / 3; }
      .add-expense-form .add-btn { grid-column: 1 / 3; }
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
      transition: background var(--wt-transition), border-color var(--wt-transition);
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
    .expense-item .category-badge {
      margin-right: 8px;
      flex-shrink: 0;
    }
    .delete-btn {
      opacity: 0;
      transition: opacity var(--wt-transition);
      margin-left: 4px;
      color: var(--wt-text-dim);
    }
    .expense-item:hover .delete-btn {
      opacity: 1;
    }
    .delete-btn:hover {
      color: var(--wt-error);
    }
  `,
  js: `
    const calculateTotal = (expenses) => expenses.reduce((sum, exp) => sum + exp.amount, 0);

    const calculateCategoryBreakdown = (expenses, categories) => {
      const totals = {};
      categories.forEach(cat => totals[cat] = 0);
      expenses.forEach(exp => {
        if (totals[exp.category] !== undefined) {
          totals[exp.category] += exp.amount;
        }
      });
      const total = calculateTotal(expenses);
      const breakdown = categories.map(cat => ({
        category: cat,
        amount: totals[cat],
        percentage: total > 0 ? (totals[cat] / total) * 100 : 0,
        color: getCategoryColor(cat), // Helper to get a color for the segment
      }));
      return breakdown;
    };

    const getCategoryColor = (category) => {
      switch (category) {
        case 'Food': return '#ef4444';
        case 'Transport': return '#f59e0b';
        case 'Entertainment': return '#3b82f6';
        case 'Other': return '#8a7e6a';
        default: return '#cccccc'; // Fallback color
      }
    };

    const updateAndRender = () => {
      const totalExpenses = calculateTotal(data.expenses).toFixed(2);
      const categoryBreakdown = calculateCategoryBreakdown(data.expenses, config.categories);
      render({ totalExpenses, categoryBreakdown, expenses: data.expenses });
    };

    switch (action) {
      case 'init':
        updateAndRender();
        break;
      case 'input-change':
        data[payload.field] = payload.value;
        updateAndRender();
        break;
      case 'click':
        if (payload.btn === 'add') {
          const name = data._inputName.trim();
          const amount = parseFloat(data._inputAmount);
          const category = data._inputCategory;

          if (name && !isNaN(amount) && amount > 0) {
            data.expenses.push({
              id: Date.now(),
              name,
              amount: parseFloat(amount.toFixed(2)),
              category,
            });
            data._inputName = '';
            data._inputAmount = '';
            // Keep category selected
            updateAndRender();
          }
        } else if (payload.btn === 'delete') {
          const expenseIdToDelete = parseInt(payload.expenseId);
          data.expenses = data.expenses.filter(exp => exp.id !== expenseIdToDelete);
          updateAndRender();
        }
        break;
    }
    return true;
  `,
  actions: [
    { name: 'click', type: 'dom' },
    { name: 'input-change', type: 'dom' },
  ],
};