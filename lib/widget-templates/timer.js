import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_CSS = readFileSync(join(__dir, '_base.css'), 'utf8');

export default {
  id: 'timer',
  name: 'Pomodoro Timer',
  description: 'Focus timer with work/break cycles and session tracking.',
  schema: {
    type: 'object',
    properties: {
      workMinutes: { type: 'number', default: 25, minimum: 1, description: 'Work session duration (minutes)' },
      breakMinutes: { type: 'number', default: 5, minimum: 1, description: 'Break duration (minutes)' },
      label: { type: 'string', default: 'Focus Time', description: 'Label for work sessions' },
    },
  },
  defaults: {
    workMinutes: 25,
    breakMinutes: 5,
    label: 'Focus Time',
    _running: false,
    _phase: 'work',
    _isWork: true,
    _seconds: 25 * 60,
    _session: 1,
    _intervalId: null,
    minutes: '25',
    seconds: '00',
  },
  html: `
    <div class="timer-container wt-card">
      <div class="phase-indicator {{#if _isWork}}phase-work{{/if}} {{#unless _isWork}}phase-break{{/unless}}">
        {{#if _isWork}}Work{{/if}}{{#unless _isWork}}Break{{/unless}}
      </div>
      <div class="timer-display">{{minutes}}:{{seconds}}</div>
      <div class="buttons">
        <button class="wt-btn primary" data-action="click" data-btn="start" {{#unless _canStart}}disabled{{/unless}}>Start</button>
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
    .phase-indicator.phase-break {
      background-color: var(--wt-success);
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
      data.minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      data.seconds = (totalSeconds % 60).toString().padStart(2, '0');
      data._isWork = data._phase === 'work';
      data._canStart = !data._running;
      render();
    };

    const startTimer = () => {
      if (data._intervalId) clearInterval(data._intervalId);
      data._running = true;
      data._intervalId = setInterval(() => {
        data._seconds--;
        if (data._seconds < 0) {
          if (data._phase === 'work') {
            data._phase = 'break';
            data._seconds = data.breakMinutes * 60;
          } else {
            data._phase = 'work';
            data._seconds = data.workMinutes * 60;
            data._session++;
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
      data._seconds = data.workMinutes * 60;
      data._session = 1;
      updateTime();
    };

    switch (action) {
      case 'init':
        data._seconds = data.workMinutes * 60;
        updateTime();
        break;
      case 'click':
        if (payload.btn === 'start') startTimer();
        else if (payload.btn === 'pause') pauseTimer();
        else if (payload.btn === 'reset') resetTimer();
        break;
      case 'destroy':
        if (data._intervalId) clearInterval(data._intervalId);
        break;
    }
    return true;
  `,
  actions: [
    { name: 'click', emits: 'click' },
  ],
};
