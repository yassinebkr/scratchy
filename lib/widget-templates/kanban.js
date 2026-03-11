import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'kanban',
  name: 'Kanban Board',
  description: 'Drag-and-drop project board with columns, cards, and priority cycling.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Board Title' },
      columns: {
        type: 'array',
        title: 'Columns',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            color: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      },
      cards: {
        type: 'array',
        title: 'Cards',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            column: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['id', 'column', 'title', 'priority'],
        },
      },
    },
  },
  defaults: {
    title: 'My Project Board',
    columns: [
      { id: 'todo', name: 'To Do', color: '#F9A602' },
      { id: 'progress', name: 'In Progress', color: '#3B82F6' },
      { id: 'done', name: 'Done', color: '#22C55E' },
    ],
    cards: [
      { id: 'c1', column: 'todo', title: 'Design landing page', description: 'Create mockups for V2', priority: 'high' },
      { id: 'c2', column: 'todo', title: 'Write blog post', description: 'Draft content for launch', priority: 'medium' },
      { id: 'c3', column: 'progress', title: 'Develop user auth', description: 'Implement JWT flow', priority: 'high' },
      { id: 'c4', column: 'done', title: 'Set up database', description: 'Configure PostgreSQL', priority: 'low' },
    ],
    _isDragging: false,
    _columns: [],
  },
  html: `
    <div class="kanban-board {{#if _isDragging}}dragging-active{{/if}}">
      {{#each _columns}}
        <div class="kanban-column" style="border-top: 2px solid {{color}};" data-column="{{id}}" data-action="drop">
          <div class="kanban-column-header">
            <span class="column-name">{{name}}</span>
            <span class="card-count wt-badge" style="background-color: {{color}};">{{cardCount}}</span>
          </div>
          <div class="kanban-column-cards">
            {{#if hasCards}}
              {{#each cards}}
                <div class="kanban-card {{#if isDragging}}dragging{{/if}}" data-card-id="{{id}}" data-action="dragstart">
                  <div class="card-title-row">
                    <span class="card-title">{{title}}</span>
                    <span class="card-priority wt-badge priority-{{priority}}" data-action="click" data-card-id="{{id}}">{{priority}}</span>
                  </div>
                  {{#if description}}<p class="card-description">{{description}}</p>{{/if}}
                </div>
              {{/each}}
            {{/if}}
            {{#unless hasCards}}
              <div class="wt-empty">No cards</div>
            {{/unless}}
          </div>
        </div>
      {{/each}}
    </div>
  `,
  css: BASE_CSS + `
    .kanban-board {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      padding: 10px;
    }
    .kanban-column {
      background: var(--wt-surface);
      border: 1px solid var(--wt-border);
      border-radius: var(--wt-radius);
      padding: 10px;
      display: flex;
      flex-direction: column;
      transition: all 0.15s;
    }
    .kanban-column.drag-over {
      outline: 1px dashed var(--wt-accent);
      outline-offset: -3px;
      background-color: var(--wt-surface-hover);
    }
    .kanban-column-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      gap: 10px;
    }
    .column-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--wt-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-grow: 1;
    }
    .card-count {
      font-size: 0.65rem;
      padding: 2px 7px;
    }
    .kanban-column-cards {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-grow: 1;
    }
    .kanban-card {
      background: var(--wt-bg);
      border: 1px solid var(--wt-border);
      border-radius: var(--wt-radius-sm);
      padding: 8px 10px;
      transition: all 0.15s;
      cursor: grab;
      user-select: none;
    }
    .kanban-card:hover {
      border-color: var(--wt-accent);
      transform: translateY(-1px);
      box-shadow: var(--wt-shadow);
    }
    .kanban-card.dragging {
      opacity: 0.4;
      transform: translateY(-1px) rotate(2deg);
    }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      gap: 8px;
    }
    .card-title {
      font-size: 0.82rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-grow: 1;
    }
    .card-description {
      font-size: 0.75rem;
      color: var(--wt-text-muted);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.3;
    }
    .card-priority {
      font-size: 0.65rem;
      padding: 2px 6px;
      cursor: pointer;
      min-width: 48px;
      text-align: center;
    }
    .priority-high { background-color: var(--wt-priority-high, #ef4444); color: var(--wt-bg); }
    .priority-medium { background-color: var(--wt-priority-medium, #f59e0b); color: var(--wt-bg); }
    .priority-low { background-color: var(--wt-priority-low, #22c55e); color: var(--wt-bg); }
    .wt-empty {
      padding: 15px 10px;
      color: var(--wt-text-dim);
      font-style: italic;
      text-align: center;
      font-size: 0.78rem;
    }
  `,
  js: `
    const draggingId = data._draggingCardId || null;

    const buildColumns = () => {
      const colMap = new Map(data.columns.map(col => [col.id, { ...col, cards: [], hasCards: false, cardCount: 0 }]));
      data.cards.forEach(card => {
        const col = colMap.get(card.column);
        if (col) {
          col.cards.push({ ...card, isDragging: card.id === draggingId });
          col.cardCount = col.cards.length;
          col.hasCards = true;
        }
      });
      data._columns = Array.from(colMap.values());
      data._isDragging = !!draggingId;
    };

    if (action === 'card-drag') {
      data._draggingCardId = payload.cardId;
      buildColumns();
      render();
      return true;
    }

    if (action === 'card-drop') {
      const dragId = data._draggingCardId || payload.dragId;
      const targetCol = payload.column;
      if (dragId && targetCol) {
        const card = data.cards.find(c => c.id === dragId);
        if (card) card.column = targetCol;
      }
      data._draggingCardId = null;
      buildColumns();
      render();
      return true;
    }

    if (action === 'card-click') {
      const cardId = payload.cardId;
      if (cardId) {
        const card = data.cards.find(c => c.id === cardId);
        if (card) {
          const order = ['low', 'medium', 'high'];
          card.priority = order[(order.indexOf(card.priority) + 1) % order.length];
          buildColumns();
          render();
        }
      }
      return true;
    }

    // Init
    buildColumns();
    return false;
  `,
  actions: [
    { name: 'dragstart', emits: 'card-drag' },
    { name: 'drop', emits: 'card-drop' },
    { name: 'click', emits: 'card-click' },
  ],
};
