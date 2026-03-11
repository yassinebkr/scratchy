import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'timer',
  name: 'Pomodoro Timer',
  description: 'A simple Pomodoro timer to help you focus.',
  schema: {
    type: 'object',
    properties: {
      workMinutes: { type: 'number', default: 25, minimum: 1, description: 'Duration of work sessions in minutes' },
      breakMinutes: { type: 'number', default: 5, minimum: 1, description: 'Duration of break sessions in minutes' },
      label: { type: 'string', default: 'Focus Time', description: 'Label for work sessions' },
    },
  },
  defaults: {
    _running: false,
    _phase: 'work', // 'work' or 'break'
    _seconds: 25 * 60,
    _session: 1,
    _intervalId: null,
  },
  html: `
    <div class="timer-container wt-card">
      <div class="phase-indicator" data-phase="{{_phase}}">
        {{#if (eq _phase "work")}}
          Work
        {{else}}
          Break
        {{/if}}
      </div>
      <div class="timer-display">{{minutes}}:{{seconds}}</div>
      <div class="buttons">
        <button class="wt-btn primary" data-action="click" data-btn="start" {{#if _running}}disabled{{/if}}>Start</button>
        <button class="wt-btn" data-action="click" data-btn="pause" {{#unless _running}}disabled{{/unless}}>Pause</button>
        <button class="wt-btn ghost" data-action="click" data-btn="reset">Reset</button>
      </div>
      <div class="session-counter">Session {{_session}}</div>
    </div>
  `,
  css: BASE_CSS + `
    .timer-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      gap: 12px;
      min-width: 240px;
    }
    .phase-indicator {
      font-size: 0.85rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--wt-radius-pill);
      color: var(--wt-bg);
      background-color: var(--wt-accent);
      text-transform: capitalize;
    }
    .phase-indicator[data-phase="break"] {
      background-color: var(--wt-success); /* Green for break */
    }
    .timer-display {
      font-family: var(--wt-mono);
      font-size: 3rem;
      font-weight: 700;
      color: var(--wt-text);
      line-height: 1;
    }
    .buttons {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 4px;
    }
    .session-counter {
      font-size: 0.8rem;
      color: var(--wt-text-muted);
    }
  `,
  js: `
    const updateTime = () => {
      const totalSeconds = data._seconds;
      const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const seconds = (totalSeconds % 60).toString().padStart(2, '0');
      render({ minutes, seconds });
    };

    const startTimer = () => {
      if (data._intervalId) clearInterval(data._intervalId);
      data._running = true;
      data._intervalId = setInterval(() => {
        data._seconds--;
        if (data._seconds < 0) {
          // Switch phase
          if (data._phase === 'work') {
            data._phase = 'break';
            data._seconds = config.breakMinutes * 60;
          } else {
            data._phase = 'work';
            data._seconds = config.workMinutes * 60;
            data._session++; // Increment session only when starting new work phase
          }
        }
        updateTime();
      }, 1000);
      updateTime();
    };

    const pauseTimer = () => {
      if (data._intervalId) {
        clearInterval(data._intervalId);
        data._intervalId = null;
      }
      data._running = false;
      updateTime();
    };

    const resetTimer = () => {
      pauseTimer();
      data._phase = 'work';
      data._seconds = config.workMinutes * 60;
      data._session = 1;
      updateTime();
    };

    switch (action) {
      case 'init':
        data._seconds = config.workMinutes * 60;
        updateTime();
        break;
      case 'click':
        if (payload.btn === 'start') {
          startTimer();
        } else if (payload.btn === 'pause') {
          pauseTimer();
        } else if (payload.btn === 'reset') {
          resetTimer();
        }
        break;
      case 'destroy':
        // Clean up interval when widget is destroyed
        if (data._intervalId) {
          clearInterval(data._intervalId);
        }
        break;
    }
    return true;
  `,
  actions: [
    { name: 'click', type: 'dom' },
  ],
};