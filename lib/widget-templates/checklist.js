import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'checklist',
  name: 'Todo Checklist',
  description: 'Checklist with progress bar, add/delete/toggle items.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Checklist Title' },
      items: {
        type: 'array',
        title: 'Items',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            checked: { type: 'boolean' },
          },
          required: ['id', 'text', 'checked'],
        },
      },
    },
    required: ['title', 'items'],
  },
  defaults: {
    title: 'My Tasks',
    items: [
      { id: '1', text: 'First task', checked: false },
      { id: '2', text: 'Second task', checked: true },
      { id: '3', text: 'Third task', checked: false },
    ],
    _progress: 33,
    _checkedCount: 1,
    _hasItems: true,
  },
  html: `
    <div class="checklist-widget">
      <h3 class="checklist-title">{{title}}</h3>

      {{#if _hasItems}}
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: {{_progress}}%;"></div>
          <span class="progress-text wt-text-muted">{{_checkedCount}}/{{_itemCount}} done ({{_progress}}%)</span>
        </div>
      {{/if}}

      <div class="checklist-items">
        {{#each _itemRows}}
          <div class="checklist-item-row {{#if checked}}checked{{/if}}">
            <div class="checkbox-box {{#if checked}}checked{{/if}}" data-action="click" data-btn="toggle" data-item-id="{{id}}">
              {{#if checked}}✓{{/if}}
            </div>
            <span class="item-text">{{text}}</span>
            <button class="wt-btn icon-only ghost delete-btn" data-action="click" data-btn="delete" data-item-id="{{id}}">✕</button>
          </div>
        {{/each}}
      </div>
      {{#unless _hasItems}}
        <div class="wt-empty">No items yet.</div>
      {{/unless}}

      <div class="add-item-form">
        <input type="text" class="wt-input" placeholder="Add a new item" data-action="new-item-input" data-field="_newText" data-enter-action="add-item">
        <button class="wt-btn primary" data-action="click" data-btn="add">Add</button>
      </div>
    </div>
  `,
  css: BASE_CSS + `
    .checklist-widget {
      padding: 10px;
      background: var(--wt-surface);
      border-radius: var(--wt-radius);
      border: 1px solid var(--wt-border);
    }
    .checklist-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--wt-text);
      margin-bottom: 12px;
    }
    .progress-bar-container {
      position: relative;
      height: 4px;
      background: var(--wt-border);
      border-radius: 2px;
      margin-bottom: 15px;
    }
    .progress-bar {
      height: 100%;
      background: var(--wt-accent);
      border-radius: 2px;
      transition: width 0.3s ease-out;
    }
    .progress-text {
      position: absolute;
      top: -20px;
      right: 0;
      font-size: 0.7rem;
    }
    .checklist-items {
      margin-bottom: 15px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .checklist-item-row {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      background: var(--wt-bg);
      border: 1px solid var(--wt-border);
      border-radius: var(--wt-radius-sm);
      transition: all 0.15s;
    }
    .checklist-item-row:hover { background: var(--wt-surface-hover); }
    .checkbox-box {
      width: 18px;
      height: 18px;
      border: 2px solid var(--wt-border-strong);
      border-radius: 3px;
      margin-right: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s;
    }
    .checkbox-box.checked {
      background: var(--wt-accent);
      border-color: var(--wt-accent);
      color: var(--wt-bg);
    }
    .item-text {
      flex-grow: 1;
      color: var(--wt-text);
      font-size: 0.9rem;
      line-height: 1.2;
    }
    .checklist-item-row.checked .item-text {
      text-decoration: line-through;
      color: var(--wt-text-muted);
    }
    .delete-btn {
      margin-left: 10px;
      visibility: hidden;
      opacity: 0;
      transition: opacity 0.2s ease;
      width: 28px;
      height: 28px;
    }
    .checklist-item-row:hover .delete-btn {
      visibility: visible;
      opacity: 1;
    }
    .add-item-form {
      display: flex;
      gap: 8px;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid var(--wt-border);
    }
    .add-item-form .wt-input { flex-grow: 1; }
    .add-item-form .wt-btn { padding: 6px 16px; }
  `,
  js: `
    if (!data._newText) data._newText = '';

    const updateProgress = () => {
      const checked = data.items.filter(i => i.checked).length;
      data._checkedCount = checked;
      data._itemCount = data.items.length;
      data._progress = data.items.length === 0 ? 0 : Math.round((checked / data.items.length) * 100);
      data._hasItems = data.items.length > 0;
      data._itemRows = data.items.map(i => ({ ...i }));
    };

    if (action === 'click') {
      if (payload.btn === 'toggle') {
        const item = data.items.find(i => i.id === payload.itemId);
        if (item) item.checked = !item.checked;
        updateProgress();
        render();
        return true;
      }
      if (payload.btn === 'delete') {
        data.items = data.items.filter(i => i.id !== payload.itemId);
        updateProgress();
        render();
        return true;
      }
      if (payload.btn === 'add') {
        const text = data._newText.trim();
        if (text) {
          data.items.push({ id: Date.now().toString(), text, checked: false });
          data._newText = '';
          updateProgress();
          render();
        }
        return true;
      }
    }

    if (action === 'new-item-input') {
      data._newText = payload.value || '';
      return true; // Don't re-render on every keystroke
    }

    if (action === 'add-item') {
      // Enter key handler
      const text = data._newText.trim();
      if (text) {
        data.items.push({ id: Date.now().toString(), text, checked: false });
        data._newText = '';
        updateProgress();
        render();
      }
      return true;
    }

    // Init
    updateProgress();
    render();
    return true;
  `,
  actions: [
    { name: 'click', emits: 'click' },
    { name: 'new-item-input', emits: 'new-item-input' },
    { name: 'add-item', emits: 'add-item' },
  ],
};
