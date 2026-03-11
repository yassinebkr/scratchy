import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'poll',
  name: 'Simple Poll',
  description: 'Quick poll with animated result bars and vote tracking.',
  schema: {
    type: 'object',
    properties: {
      question: { type: 'string', title: 'Poll Question' },
      options: { type: 'array', title: 'Options', items: { type: 'string' } },
      multiSelect: { type: 'boolean', title: 'Allow Multiple Selections', default: false },
    },
    required: ['question', 'options'],
  },
  defaults: {
    question: 'What do you prefer?',
    options: ['Option A', 'Option B', 'Option C'],
    _votes: [],
    _voted: false,
    _selected: -1,
    _optionRows: [],
  },
  html: `
    <div class="poll-widget">
      <h3 class="poll-question">{{question}}</h3>
      <div class="poll-options">
        {{#each _optionRows}}
          <div class="poll-option-row {{#if isSelected}}selected{{/if}} {{#if isVoted}}voted{{/if}}"
               data-action="click" data-option="{{index}}">
            <span class="option-text">{{text}}</span>
            {{#if isVoted}}
              <div class="poll-result-bar" style="width: {{pct}}%; background-color: var(--wt-accent-dim);"></div>
              <span class="poll-percentage">{{pct}}%</span>
            {{/if}}
          </div>
        {{/each}}
      </div>
      {{#if _voted}}
        <div class="poll-footer wt-text-muted">You have voted.</div>
      {{/if}}
    </div>
  `,
  css: BASE_CSS + `
    .poll-widget {
      padding: 10px;
      background: var(--wt-surface);
      border-radius: var(--wt-radius);
      border: 1px solid var(--wt-border);
    }
    .poll-question {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--wt-text);
      margin-bottom: 12px;
    }
    .poll-option-row {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      margin-bottom: 6px;
      border-radius: var(--wt-radius-sm);
      cursor: pointer;
      background: var(--wt-bg);
      border: 1px solid var(--wt-border);
      height: 36px;
      position: relative;
      overflow: hidden;
      transition: all 0.15s;
    }
    .poll-option-row:hover:not(.voted) {
      background: var(--wt-surface-hover);
      border-color: var(--wt-border-strong);
    }
    .poll-option-row.voted { cursor: default; }
    .poll-option-row.voted.selected {
      border-left: 4px solid var(--wt-accent);
      padding-left: 6px;
    }
    .option-text { flex-grow: 1; z-index: 1; position: relative; }
    .poll-result-bar {
      position: absolute;
      top: 0; left: 0;
      height: 100%;
      transition: width 0.5s ease-out;
    }
    .poll-percentage {
      font-size: 0.75rem;
      color: var(--wt-text-muted);
      margin-left: 8px;
      z-index: 1;
      position: relative;
    }
    .poll-footer {
      font-size: 0.75rem;
      text-align: right;
      margin-top: 10px;
    }
  `,
  js: `
    // Init votes array
    if (!data._votes || data._votes.length !== data.options.length) {
      data._votes = new Array(data.options.length).fill(0);
    }

    // Build option rows with pre-computed flags
    const buildRows = () => {
      const totalVotes = data._votes.reduce((s, c) => s + c, 0);
      data._optionRows = data.options.map((text, i) => ({
        text,
        index: i,
        isSelected: i === data._selected,
        isVoted: data._voted,
        pct: totalVotes > 0 ? Math.round((data._votes[i] / totalVotes) * 100) : 0,
      }));
    };

    if (action === 'click') {
      if (data._voted && !data.multiSelect) return true;

      const idx = parseInt(payload.option, 10);
      if (isNaN(idx) || idx < 0 || idx >= data.options.length) return false;

      data._votes[idx]++;
      data._voted = true;
      data._selected = idx;

      buildRows();
      render();
      return true;
    }

    // Init render
    buildRows();
    render();
    return true;
  `,
  actions: [
    { name: 'click', emits: 'click' },
  ],
};
