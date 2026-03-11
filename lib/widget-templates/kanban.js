
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'kanban',
  name: 'Kanban Board',
  description: 'Drag-and-drop project board with customizable columns and cards',
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
            color: { type: 'string' }
          },
          required: ['id', 'name']
        }
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
            priority: { type: 'string', enum: ['low', 'medium', 'high'] }
          },
          required: ['id', 'column', 'title', 'priority']
        }
      }
    }
  },
  defaults: {
    title: 'My Project Board',
    columns: [
      { id: 'todo', name: 'To Do', color: '#F9A602' },
      { id: 'progress', name: 'In Progress', color: '#3B82F6' },
      { id: 'done', name: 'Done', color: '#22C55E' }
    ],
    cards: [
      { id: 'c1', column: 'todo', title: 'Design landing page', description: 'Create mockups for V2', priority: 'high' },
      { id: 'c2', column: 'todo', title: 'Write blog post', description: 'Draft content for new feature launch', priority: 'medium' },
      { id: 'c3', column: 'progress', title: 'Develop user auth', description: 'Implement JWT authentication flow', priority: 'high' },
      { id: 'c4', column: 'done', title: 'Set up database', description: 'Configure PostgreSQL instance', priority: 'low' }
    ]
  },
  html: `
    <div class="kanban-board {{#if _temp.draggingCardId}}dragging-active{{/if}}">
      {{#each _columns}}
        <div class="kanban-column" style="border-top: 2px solid {{color}};" data-column="{{id}}" data-action="drop">
          <div class="kanban-column-header">
            <span class="column-name">{{name}}</span>
            <span class="card-count wt-badge" style="background-color: {{color}};">{{cards.length}}</span>
          </div>
          <div class="kanban-column-cards">
            {{#if cards.length}}
              {{#each cards}}
                <div class="kanban-card {{#if _temp.draggingCardId}}{{#ifEquals id ../../_temp.draggingCardId}}dragging{{/ifEquals}}{{/if}}" data-card-id="{{id}}" data-action="dragstart" draggable="true">
                  <div class="card-title-row">
                    <span class="card-title">{{title}}</span>
                    <span class="card-priority wt-badge priority-{{priority}}" data-action="click" data-card-id="{{id}}">{{priority}}</span>
                  </div>
                  {{#if description}}<p class="card-description">{{description}}</p>{{/if}}
                </div>
              {{/each}}
            {{else}}
              <div class="wt-empty">No cards</div>
            {{/if}}
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
      max-height: auto; /* grow with content */
      display: flex;
      flex-direction: column;
      transition: all var(--wt-transition);
    }

    /* DnD visual: drop zone gets accent border on dragover (via drag-over class) */
    /* This class is assumed to be applied by the widget system on dragover */
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
      gap: 10px; /* To prevent name and count from overlapping */
    }

    .kanban-column-header .column-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--wt-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-grow: 1;
    }

    .kanban-column-header .card-count {
      background: var(--wt-text-dim);
      color: var(--wt-bg);
      font-size: 0.65rem;
      padding: 2px 7px;
    }

    .kanban-column-cards {
      display: flex;
      flex-direction: column;
      gap: 6px; /* Card gap */
      flex-grow: 1; /* Allow cards container to grow */
    }

    .kanban-card {
      background: var(--wt-bg);
      border: 1px solid var(--wt-border);
      border-radius: var(--wt-radius-sm);
      padding: 8px 10px; /* Card padding (compact) */
      transition: all var(--wt-transition);
      cursor: grab;
      user-select: none;
    }

    .kanban-card:hover {
      border-color: var(--wt-accent);
      transform: translateY(-1px);
      box-shadow: var(--wt-shadow);
    }

    /* Card dragging visual */
    .kanban-card.dragging {
      opacity: 0.4;
      transform: translateY(-1px) rotate(2deg);
    }

    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      gap: 8px; /* Gap between title and priority badge */
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
      -webkit-line-clamp: 2; /* max 2 lines */
      -webkit-box-orient: vertical;
      line-height: 1.3;
    }

    .card-priority {
      font-size: 0.65rem;
      padding: 2px 6px;
      cursor: pointer;
      min-width: 48px; /* Ensure badge has consistent width */
      text-align: center;
    }
    .card-priority.priority-high { background-color: var(--wt-priority-high); color: var(--wt-bg); }
    .card-priority.priority-medium { background-color: var(--wt-priority-medium); color: var(--wt-bg); }
    .card-priority.priority-low { background-color: var(--wt-priority-low); color: var(--wt-bg); }

    .wt-empty {
      padding: 15px 10px; /* Adjusted padding for better fit */
      color: var(--wt-text-dim);
      font-style: italic;
      text-align: center;
      font-size: 0.78rem;
    }
  `,
  js: `
    // Initialize columns on first render or data change
    if (!data._columns || action === 'render') {
      const columnsMap = new Map(data.columns.map(col => [col.id, { ...col, cards: [] }]));
      data.cards.forEach(card => {
        if (columnsMap.has(card.column)) {
          columnsMap.get(card.column).cards.push(card);
        }
      });
      data._columns = Array.from(columnsMap.values());
    }

    // --- Action Handlers ---
    if (action === 'card-drag') {
      data._temp = data._temp || {};
      data._temp.draggingCardId = payload.cardId;
      render(); // Re-render to apply 'dragging-active' class to board and 'dragging' to card
      return true;
    }

    if (action === 'card-drop') {
      const draggingCardId = data._temp?.draggingCardId;
      const targetColumnId = payload.column;

      if (!draggingCardId || !targetColumnId) {
        // If a drag was active, clear it even if drop target is invalid
        if (data._temp?.draggingCardId) {
          delete data._temp.draggingCardId;
          render();
        }
        return false;
      }

      let cardToMove;
      let sourceColumn;

      // Find the card and its source column
      for (const column of data._columns) {
        const cardIndex = column.cards.findIndex(card => card.id === draggingCardId);
        if (cardIndex !== -1) {
          cardToMove = column.cards[cardIndex];
          sourceColumn = column;
          // Remove from source column
          column.cards.splice(cardIndex, 1);
          break;
        }
      }

      if (cardToMove && sourceColumn) {
        // Update card's column and add to target column
        cardToMove.column = targetColumnId;
        const targetColumn = data._columns.find(col => col.id === targetColumnId);
        if (targetColumn) {
          targetColumn.cards.push(cardToMove);
        }
      }

      // Clean up dragging state
      delete data._temp.draggingCardId;
      
      render();
      return true;
    }

    if (action === 'card-click') {
      const cardId = payload.cardId;
      if (!cardId) return false;

      const priorityOrder = ['low', 'medium', 'high'];

      for (const column of data._columns) {
        const card = column.cards.find(c => c.id === cardId);
        if (card) {
          const currentIndex = priorityOrder.indexOf(card.priority);
          card.priority = priorityOrder[(currentIndex + 1) % priorityOrder.length];
          render();
          return true;
        }
      }
      return false;
    }

    return false; // Default: unhandled action, pass to LLM
  `,
  actions: [
    { name: 'dragstart', emits: 'card-drag' },
    { name: 'drop', emits: 'card-drop' },
    { name: 'click', emits: 'card-click' },
  ],
};
