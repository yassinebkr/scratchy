
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'poll',
  name: 'Simple Poll',
  description: 'A multiple choice poll widget.',
  schema: {
    type: 'object',
    properties: {
      question: { type: 'string', title: 'Poll Question' },
      options: {
        type: 'array',
        title: 'Options',
        items: { type: 'string' }
      },
      multiSelect: { type: 'boolean', title: 'Allow Multiple Selections', default: false }
    },
    required: ['question', 'options']
  },
  defaults: {
    _votes: [],
    _voted: false
  },
  html: `
    <div class="poll-widget">
      <h3 class="poll-question">{{question}}</h3>
      <div class="poll-options">
        {{#each options}}
          <div class="poll-option-row {{#ifEquals @index ../_selected}}selected{{/ifEquals}} {{#if ../_voted}}voted{{/if}}"
               data-action="click" data-option="{{@index}}">
            <span class="option-text">{{this}}</span>
            {{#if ../_voted}}
              <div class="poll-result-bar" style="width: {{_votes_percentages.[@index]}}%; background-color: var(--wt-accent-dim);"></div>
              <span class="poll-percentage">{{_votes_percentages.[@index]}}%</span>
            {{/if}}
          </div>
        {{/each}}
      </div>
      {{#if _voted}}
        <div class="poll-footer wt-text-muted">You have voted.</div>
      {{/if}}
    </div>
  `,
  css: BASE_CSS + '\n' + `
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
      transition: all var(--wt-transition);
    }
    .poll-option-row:hover:not(.voted) {
      background: var(--wt-surface-hover);
      border-color: var(--wt-border-strong);
    }
    .poll-option-row.voted:not(.selected) {
      cursor: default;
    }
    .poll-option-row.voted.selected {
      border-left: 4px solid var(--wt-accent);
      padding-left: 6px; /* Adjust padding for border */
    }
    .option-text {
      flex-grow: 1;
      z-index: 1;
      position: relative; /* Ensure text is above bar */
    }
    .poll-result-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background-color: var(--wt-accent-dim);
      transition: width 0.5s ease-out;
    }
    .poll-percentage {
      font-size: 0.75rem;
      color: var(--wt-text-muted);
      margin-left: 8px;
      z-index: 1;
      position: relative; /* Ensure percentage is above bar */
    }
    .poll-footer {
      font-size: 0.75rem;
      text-align: right;
      margin-top: 10px;
    }
  `,
  js: `
    // Initialize votes array if not already done or if options changed
    if (!data._votes || data._votes.length !== data.options.length) {
      data._votes = new Array(data.options.length).fill(0);
    }

    if (action === 'click') {
      if (data._voted && !data.multiSelect) {
        // Already voted and not multi-select, so ignore further clicks
        return true;
      }

      const optionIndex = parseInt(payload.option, 10);
      if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= data.options.length) {
        return false; // Invalid option
      }

      data._votes[optionIndex]++;
      data._voted = true;

      // Calculate percentages for rendering
      const totalVotes = data._votes.reduce((sum, count) => sum + count, 0);
      data._votes_percentages = data._votes.map(count =>
        totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
      );
      data._selected = optionIndex; // Mark selected for single choice visual

      render();
      return true;
    }
    return false;
  `,
  actions: [
    { name: 'click', emits: 'click' },
  ],
};
