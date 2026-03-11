
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'quiz',
  name: 'Interactive Quiz',
  description: 'A multi-question quiz with score tracking.',
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
            answer: { type: 'number', title: 'Correct Option Index (0-based)' }
          },
          required: ['q', 'options', 'answer']
        }
      }
    },
    required: ['title', 'questions']
  },
  defaults: {
    _currentQ: 0,
    _answers: [], // Stores index of selected answer for each question
    _finished: false,
    _selected: -1 // Currently selected option for the active question
  },
  html: `
    <div class="quiz-widget">
      <h3 class="quiz-title">{{title}}</h3>

      {{#if _finished}}
        <div class="quiz-result-screen">
          <p class="quiz-score-label wt-text-muted">Your Score</p>
          <p class="quiz-score">{{_score}}/{{questions.length}}</p>
          <button class="wt-btn primary" data-action="reset">Retake Quiz</button>
        </div>
      {{else}}
        <div class="quiz-question-container">
          <p class="question-number wt-text-muted">Question {{_currentQ_display}} of {{questions.length}}</p>
          <p class="question-text">{{current_question.q}}</p>
          <div class="quiz-options">
            {{#each current_question.options}}
              <div class="quiz-option-row {{#ifEquals @index ../_selected}}selected{{/ifEquals}}"
                   data-action="select" data-option="{{@index}}">
                {{this}}
              </div>
            {{/each}}
          </div>
        </div>

        <div class="quiz-navigation">
          <button class="wt-btn ghost" data-action="prev" {{#if _is_first_question}}disabled{{/if}}>Previous</button>
          {{#if _is_last_question}}
            <button class="wt-btn primary" data-action="finish" {{#if _answer_not_selected}}disabled{{/if}}>Finish Quiz</button>
          {{else}}
            <button class="wt-btn primary" data-action="next" {{#if _answer_not_selected}}disabled{{/if}}>Next Question</button>
          {{/if}}
        </div>
      {{/if}}
    </div>
  `,
  css: BASE_CSS + '\n' + `
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
    .quiz-question-container {
      margin-bottom: 20px;
    }
    .question-number {
      font-size: 0.75rem;
      margin-bottom: 8px;
    }
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
      max-width: 300px; /* Constrain options width */
      text-align: left;
    }
    .quiz-option-row {
      padding: 10px 12px;
      background: var(--wt-bg);
      border: 1px solid var(--wt-border);
      border-radius: var(--wt-radius-sm);
      cursor: pointer;
      transition: all var(--wt-transition);
    }
    .quiz-option-row:hover {
      background: var(--wt-surface-hover);
      border-color: var(--wt-border-strong);
    }
    .quiz-option-row.selected {
      border: 1px solid var(--wt-accent);
      background: var(--wt-accent-dim);
      color: var(--wt-text);
    }
    .quiz-navigation {
      display: flex;
      justify-content: space-between;
      padding-top: 15px;
      border-top: 1px solid var(--wt-border);
      margin-top: 15px;
    }
    .quiz-result-screen {
      padding: 30px 0;
    }
    .quiz-score-label {
      font-size: 1rem;
      margin-bottom: 10px;
    }
    .quiz-score {
      font-family: var(--wt-mono);
      font-size: 3rem;
      font-weight: 700;
      color: var(--wt-accent);
      margin-bottom: 20px;
    }
  `,
  js: `
    // Helper to update current question data and selected state
    function updateQuestionData(data) {
      data.current_question = data.questions[data._currentQ];
      data._selected = data._answers[data._currentQ] !== undefined ? data._answers[data._currentQ] : -1;
      data._is_first_question = data._currentQ === 0;
      data._is_last_question = data._currentQ === data.questions.length - 1;
      data._answer_not_selected = data._selected === -1;
      data._currentQ_display = data._currentQ + 1;
    }

    // Initial setup or re-render after data change
    if (!data.current_question || action === 'render') {
      updateQuestionData(data);
    }

    if (action === 'select') {
      const optionIndex = parseInt(payload.option, 10);
      if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= data.current_question.options.length) {
        return false; // Invalid option
      }
      data._selected = optionIndex;
      data._answers[data._currentQ] = optionIndex;
      updateQuestionData(data); // Update derived properties
      render();
      return true;
    }

    if (action === 'next') {
      if (data._currentQ < data.questions.length - 1) {
        data._currentQ++;
        updateQuestionData(data);
        render();
        return true;
      }
    }

    if (action === 'prev') {
      if (data._currentQ > 0) {
        data._currentQ--;
        updateQuestionData(data);
        render();
        return true;
      }
    }

    if (action === 'finish') {
      data._score = 0;
      for (let i = 0; i < data.questions.length; i++) {
        if (data._answers[i] === data.questions[i].answer) {
          data._score++;
        }
      }
      data._finished = true;
      render();
      return true;
    }

    if (action === 'reset') {
      data._currentQ = 0;
      data._answers = [];
      data._finished = false;
      data._selected = -1;
      data._score = 0; // Clear score as well
      updateQuestionData(data);
      render();
      return true;
    }

    return false;
  `,
  actions: [
    { name: 'select', emits: 'select' },
    { name: 'next', emits: 'next' },
    { name: 'prev', emits: 'prev' },
    { name: 'finish', emits: 'finish' },
    { name: 'reset', emits: 'reset' },
  ],
};
