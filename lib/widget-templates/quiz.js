import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'quiz',
  name: 'Interactive Quiz',
  description: 'Multi-question quiz with navigation, scoring, and retake.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Quiz Title' },
      questions: {
        type: 'array',
        title: 'Questions',
        items: {
          type: 'object',
          properties: {
            q: { type: 'string', title: 'Question Text' },
            options: { type: 'array', title: 'Options', items: { type: 'string' } },
            answer: { type: 'number', title: 'Correct Option Index (0-based)' },
          },
          required: ['q', 'options', 'answer'],
        },
      },
    },
    required: ['title', 'questions'],
  },
  defaults: {
    title: 'Quick Quiz',
    questions: [
      { q: 'What is 2 + 2?', options: ['3', '4', '5'], answer: 1 },
      { q: 'Capital of France?', options: ['London', 'Berlin', 'Paris'], answer: 2 },
    ],
    _currentQ: 0,
    _answers: [],
    _finished: false,
    _score: 0,
    _questionDisplay: '',
    _questionNumber: '',
    _questionTotal: '',
    _optionRows: [],
    _isFirst: true,
    _isLast: false,
    _hasAnswer: false,
  },
  html: `
    <div class="quiz-widget">
      <h3 class="quiz-title">{{title}}</h3>

      {{#if _finished}}
        <div class="quiz-result-screen">
          <p class="quiz-score-label wt-text-muted">Your Score</p>
          <p class="quiz-score">{{_score}}/{{_questionTotal}}</p>
          <button class="wt-btn primary" data-action="click" data-btn="reset">Retake Quiz</button>
        </div>
      {{/if}}

      {{#unless _finished}}
        <div class="quiz-question-container">
          <p class="question-number wt-text-muted">Question {{_questionNumber}} of {{_questionTotal}}</p>
          <p class="question-text">{{_questionDisplay}}</p>
          <div class="quiz-options">
            {{#each _optionRows}}
              <div class="quiz-option-row {{#if isSelected}}selected{{/if}}"
                   data-action="click" data-btn="select" data-option="{{index}}">
                {{text}}
              </div>
            {{/each}}
          </div>
        </div>

        <div class="quiz-navigation">
          <button class="wt-btn ghost" data-action="click" data-btn="prev" {{#if _isFirst}}disabled{{/if}}>Previous</button>
          {{#if _isLast}}
            <button class="wt-btn primary" data-action="click" data-btn="finish" {{#unless _hasAnswer}}disabled{{/unless}}>Finish</button>
          {{/if}}
          {{#unless _isLast}}
            <button class="wt-btn primary" data-action="click" data-btn="next" {{#unless _hasAnswer}}disabled{{/unless}}>Next</button>
          {{/unless}}
        </div>
      {{/unless}}
    </div>
  `,
  css: BASE_CSS + `
    .quiz-widget {
      padding: 10px;
      background: var(--wt-surface);
      border-radius: var(--wt-radius);
      border: 1px solid var(--wt-border);
      text-align: center;
    }
    .quiz-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--wt-text);
      margin-bottom: 15px;
    }
    .question-number { font-size: 0.75rem; margin-bottom: 8px; }
    .question-text {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 15px;
      color: var(--wt-text);
    }
    .quiz-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0 auto;
      max-width: 300px;
      text-align: left;
    }
    .quiz-option-row {
      padding: 10px 12px;
      background: var(--wt-bg);
      border: 1px solid var(--wt-border);
      border-radius: var(--wt-radius-sm);
      cursor: pointer;
      transition: all 0.15s;
    }
    .quiz-option-row:hover {
      background: var(--wt-surface-hover);
      border-color: var(--wt-border-strong);
    }
    .quiz-option-row.selected {
      border: 1px solid var(--wt-accent);
      background: var(--wt-accent-dim);
    }
    .quiz-navigation {
      display: flex;
      justify-content: space-between;
      padding-top: 15px;
      border-top: 1px solid var(--wt-border);
      margin-top: 15px;
    }
    .quiz-result-screen { padding: 30px 0; }
    .quiz-score-label { font-size: 1rem; margin-bottom: 10px; }
    .quiz-score {
      font-family: var(--wt-mono);
      font-size: 3rem;
      font-weight: 700;
      color: var(--wt-accent);
      margin-bottom: 20px;
    }
  `,
  js: `
    const updateView = () => {
      const q = data.questions[data._currentQ];
      data._questionDisplay = q.q;
      data._questionNumber = String(data._currentQ + 1);
      data._questionTotal = String(data.questions.length);
      data._isFirst = data._currentQ === 0;
      data._isLast = data._currentQ === data.questions.length - 1;
      const selected = data._answers[data._currentQ];
      data._hasAnswer = selected !== undefined;

      data._optionRows = q.options.map((text, i) => ({
        text,
        index: i,
        isSelected: i === selected,
      }));
    };

    if (action === 'click') {
      if (payload.btn === 'select') {
        const idx = parseInt(payload.option, 10);
        if (!isNaN(idx)) {
          data._answers[data._currentQ] = idx;
          updateView();
          render();
        }
        return true;
      }
      if (payload.btn === 'next') {
        if (data._currentQ < data.questions.length - 1) {
          data._currentQ++;
          updateView();
          render();
        }
        return true;
      }
      if (payload.btn === 'prev') {
        if (data._currentQ > 0) {
          data._currentQ--;
          updateView();
          render();
        }
        return true;
      }
      if (payload.btn === 'finish') {
        let score = 0;
        for (let i = 0; i < data.questions.length; i++) {
          if (data._answers[i] === data.questions[i].answer) score++;
        }
        data._score = score;
        data._finished = true;
        data._questionTotal = String(data.questions.length);
        render();
        return true;
      }
      if (payload.btn === 'reset') {
        data._currentQ = 0;
        data._answers = [];
        data._finished = false;
        data._score = 0;
        updateView();
        render();
        return true;
      }
    }

    // Init
    updateView();
    render();
    return true;
  `,
  actions: [
    { name: 'click', emits: 'click' },
  ],
};
