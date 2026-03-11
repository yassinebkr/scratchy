
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'checklist',
  name: 'Todo Checklist',
  description: 'A simple checklist with progress, add, delete, and toggle items.',
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
            checked: { type: 'boolean' }
          },
          required: ['id', 'text', 'checked']
        }
      }
    },
    required: ['title', 'items']
  },
  defaults: {
    _newText: "", // Input for new item
  },
  html: `
    <div class="checklist-widget">
      <h3 class="checklist-title">{{title}}</h3>

      {{#if items.length}}
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: {{_progress}}%;"></div>
          <span class="progress-text wt-text-muted">{{_checked_count}}/{{items.length}} done ({{_progress}}%)</span>
        </div>
      {{/if}}

      <div class="checklist-items">
        {{#each items}}
          <div class="checklist-item-row {{#if checked}}checked{{/if}}">
            <input type="checkbox" id="item-{{id}}" data-action="toggle" data-item-id="{{id}}" {{#if checked}}checked{{/if}}>
            <label for="item-{{id}}" class="item-text">{{text}}</label>
            <button class="wt-btn icon-only ghost delete-btn" data-action="delete" data-item-id="{{id}}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12M6 6l12 12"/></svg>
            </button>
          </div>
        {{else}}
          <div class="wt-empty">No items in your checklist.</div>
        {{/each}}
      </div>

      <div class="add-item-form">
        <input type="text" class="wt-input" placeholder="Add a new item" value="{{_newText}}" data-action="input" data-field="_newText" data-enter-action="add-item">
        <button class="wt-btn primary" data-action="add-item" {{#if _newText_empty}}disabled{{/if}}>Add</button>
      </div>
    </div>
  `,
  css: BASE_CSS + '\n' + `
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
      width: 0%;
      transition: width 0.3s ease-out;
    }
    .progress-text {
      position: absolute;
      top: -20px;
      right: 0;
      font-size: 0.7rem;
      color: var(--wt-text-muted);
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
      transition: all var(--wt-transition);
    }
    .checklist-item-row:hover {
      background: var(--wt-surface-hover);
    }
    .checklist-item-row input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-right: 10px;
      cursor: pointer;
      accent-color: var(--wt-accent);
    }
    .checklist-item-row .item-text {
      flex-grow: 1;
      color: var(--wt-text);
      font-size: 0.9rem;
      line-height: 1.2;
      cursor: pointer;
    }
    .checklist-item-row.checked .item-text {
      text-decoration: line-through;
      color: var(--wt-text-muted);
    }
    .checklist-item-row .delete-btn {
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
    .add-item-form .wt-input {
      flex-grow: 1;
    }
    .add-item-form .wt-btn {
      padding: 6px 16px;
    }
  `,
  js: `
    // Helper to calculate progress
    function updateProgress(data) {
      const checkedItems = data.items.filter(item => item.checked).length;
      data._checked_count = checkedItems;
      data._progress = data.items.length === 0 ? 0 : Math.round((checkedItems / data.items.length) * 100);
      data._newText_empty = !data._newText.trim();
    }

    // Initial setup or re-render after data change
    if (!data._progress_initialized || action === 'render') {
      updateProgress(data);
      data._progress_initialized = true;
    }

    if (action === 'toggle') {
      const itemId = payload.itemId;
      const item = data.items.find(i => i.id === itemId);
      if (item) {
        item.checked = !item.checked;
        updateProgress(data);
        render();
        return true;
      }
    }

    if (action === 'delete') {
      const itemId = payload.itemId;
      data.items = data.items.filter(i => i.id !== itemId);
      updateProgress(data);
      render();
      return true;
    }

    if (action === 'input') {
      data[payload.field] = payload.value;
      data._newText_empty = !data._newText.trim(); // Update disable state for button
      render(); // Re-render to update input value
      return true;
    }

    if (action === 'add-item') {
      const newText = data._newText.trim();
      if (newText) {
        const newItem = {
          id: Date.now().toString(), // Simple unique ID
          text: newText,
          checked: false,
        };
        data.items.push(newItem);
        data._newText = ""; // Clear input
        updateProgress(data);
        render();
        return true;
      }
    }

    return false;
  `,
  actions: [
    { name: 'toggle', emits: 'toggle' },
    { name: 'delete', emits: 'delete' },
    { name: 'input', emits: 'input' },
    { name: 'add-item', emits: 'add-item' },
  ],
};
