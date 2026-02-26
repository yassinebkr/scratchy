/**
 * @module lib/widgets/calendar
 * Calendar widget for Scratchy v2.
 *
 * Provides event management with month and week views.
 * Events are stored per-user in SQLite and rendered as
 * GenUI ops for the canvas.
 *
 * Actions:
 *   cal-month        — Show month view (grid of days with events)
 *   cal-week         — Show week view (7-day list with events)
 *   cal-add-event    — Create a new calendar event
 *   cal-delete-event — Delete an event by ID or index
 *
 * @example
 * ```js
 * import { calendarWidget } from './calendar.js';
 * registry.register(calendarWidget);
 * ```
 */

import crypto from 'node:crypto';
import { upsert, toast } from './framework.js';

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {import('better-sqlite3').Database} */
let db;

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Ensure the `calendar_events` table exists.
 * @param {import('better-sqlite3').Database} database
 */
function ensureTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      title     TEXT NOT NULL,
      startTime TEXT NOT NULL,
      endTime   TEXT,
      allDay    INTEGER NOT NULL DEFAULT 0,
      color     TEXT DEFAULT 'blue',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_userId ON calendar_events(userId);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_startTime ON calendar_events(startTime);
  `);
}

// ─── Data Access ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CalEvent
 * @property {string} id
 * @property {string} userId
 * @property {string} title
 * @property {string} startTime - ISO datetime
 * @property {string|null} endTime - ISO datetime or null
 * @property {number} allDay - 0 or 1
 * @property {string} color
 * @property {string} createdAt
 */

/**
 * Get events for a user within a date range.
 * @param {string} userId
 * @param {string} startDate - ISO date (YYYY-MM-DD)
 * @param {string} endDate - ISO date (YYYY-MM-DD)
 * @returns {CalEvent[]}
 */
function getEvents(userId, startDate, endDate) {
  return db.prepare(
    `SELECT * FROM calendar_events
     WHERE userId = ? AND startTime >= ? AND startTime < ?
     ORDER BY startTime ASC`
  ).all(userId, startDate, endDate + 'T23:59:59');
}

/**
 * Get a single event by ID.
 * @param {string} eventId
 * @param {string} userId
 * @returns {CalEvent|undefined}
 */
function getEventById(eventId, userId) {
  return db.prepare(
    'SELECT * FROM calendar_events WHERE id = ? AND userId = ?'
  ).get(eventId, userId);
}

/**
 * Create a new event.
 * @param {string} userId
 * @param {Object} fields
 * @param {string} fields.title
 * @param {string} fields.startTime
 * @param {string} [fields.endTime]
 * @param {boolean} [fields.allDay]
 * @param {string} [fields.color]
 * @returns {CalEvent}
 */
function createEvent(userId, fields) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO calendar_events (id, userId, title, startTime, endTime, allDay, color, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    fields.title,
    fields.startTime,
    fields.endTime || null,
    fields.allDay ? 1 : 0,
    fields.color || 'blue',
    now,
  );

  return getEventById(id, userId);
}

/**
 * Delete an event.
 * @param {string} eventId
 * @param {string} userId
 * @returns {boolean}
 */
function deleteEvent(eventId, userId) {
  const result = db.prepare(
    'DELETE FROM calendar_events WHERE id = ? AND userId = ?'
  ).run(eventId, userId);
  return result.changes > 0;
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

/**
 * Get the first and last day of a month.
 * @param {number} year
 * @param {number} month - 1-indexed (1=Jan, 12=Dec)
 * @returns {{ start: string, end: string }}
 */
function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Get start and end of the week containing a given date (Monday-based).
 * @param {Date} date
 * @returns {{ start: string, end: string }}
 */
function weekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

/**
 * Format a time string for display.
 * @param {string} isoDate
 * @param {boolean} allDay
 * @returns {string}
 */
function formatTime(isoDate, allDay) {
  if (allDay) return 'All day';
  try {
    const d = new Date(isoDate);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoDate.slice(11, 16);
  }
}

/**
 * Format a date for display.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return isoDate.slice(0, 10);
  }
}

/**
 * Get month name from number.
 * @param {number} month - 1-indexed
 * @returns {string}
 */
function monthName(month) {
  const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return names[month] || 'Unknown';
}

// ─── GenUI Builders ─────────────────────────────────────────────────────────

/**
 * Build the month view as GenUI ops.
 * Shows a table grid with days and their events.
 * @param {number} year
 * @param {number} month
 * @param {CalEvent[]} events
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildMonthView(year, month, events) {
  const ops = [];

  // Header
  ops.push(upsert('cal-header', 'hero', {
    title: `📅 ${monthName(month)} ${year}`,
    subtitle: `${events.length} event${events.length !== 1 ? 's' : ''}`,
    icon: '📅',
  }));

  // Group events by day
  /** @type {Map<string, CalEvent[]>} */
  const byDay = new Map();
  for (const ev of events) {
    const day = ev.startTime.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(ev);
  }

  // Build timeline of days with events
  if (events.length > 0) {
    const timelineItems = [];
    for (const [day, dayEvents] of byDay) {
      for (const ev of dayEvents) {
        timelineItems.push({
          title: ev.title,
          text: formatTime(ev.startTime, !!ev.allDay),
          date: formatDate(day),
          icon: ev.allDay ? '📌' : '⏰',
          status: ev.color || 'blue',
        });
      }
    }

    ops.push(upsert('cal-events', 'timeline', {
      title: 'Events This Month',
      items: timelineItems.slice(0, 20), // Cap at 20 for readability
    }));
  } else {
    ops.push(upsert('cal-events', 'card', {
      title: 'No Events',
      text: `No events scheduled for ${monthName(month)} ${year}.`,
    }));
  }

  // Navigation + add buttons
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  ops.push(upsert('cal-nav', 'buttons', {
    title: 'Calendar',
    buttons: [
      { label: `← ${monthName(prevMonth).slice(0, 3)}`, action: 'cal-month', style: 'ghost' },
      { label: 'This Week', action: 'cal-week', style: 'ghost' },
      { label: `${monthName(nextMonth).slice(0, 3)} →`, action: 'cal-month', style: 'ghost' },
      { label: '+ Event', action: 'cal-add-event', style: 'primary' },
    ],
  }));

  return ops;
}

/**
 * Build the week view as GenUI ops.
 * @param {string} startDate
 * @param {string} endDate
 * @param {CalEvent[]} events
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildWeekView(startDate, endDate, events) {
  const ops = [];

  ops.push(upsert('cal-header', 'hero', {
    title: `📅 Week View`,
    subtitle: `${formatDate(startDate)} — ${formatDate(endDate)}`,
    icon: '📅',
  }));

  if (events.length > 0) {
    const items = events.map(ev => ({
      title: ev.title,
      text: `${formatDate(ev.startTime)} · ${formatTime(ev.startTime, !!ev.allDay)}`,
      icon: ev.allDay ? '📌' : '⏰',
      status: ev.color || 'blue',
    }));

    ops.push(upsert('cal-events', 'timeline', {
      title: `${events.length} Event${events.length !== 1 ? 's' : ''} This Week`,
      items,
    }));
  } else {
    ops.push(upsert('cal-events', 'card', {
      title: 'Free Week! 🎉',
      text: 'No events scheduled this week.',
    }));
  }

  ops.push(upsert('cal-nav', 'buttons', {
    title: 'Navigation',
    buttons: [
      { label: 'Month View', action: 'cal-month', style: 'ghost' },
      { label: '+ Event', action: 'cal-add-event', style: 'primary' },
    ],
  }));

  return ops;
}

// ─── Action Handlers ────────────────────────────────────────────────────────

/**
 * Handle cal-month: show month view.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleMonth(userId, context) {
  const now = new Date();
  const year = context.year ? Number(context.year) : now.getFullYear();
  const month = context.month ? Number(context.month) : now.getMonth() + 1;

  const { start, end } = monthRange(year, month);
  const events = getEvents(userId, start, end);
  return buildMonthView(year, month, events);
}

/**
 * Handle cal-week: show week view.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleWeek(userId, context) {
  const baseDate = context.date ? new Date(String(context.date)) : new Date();
  const { start, end } = weekRange(baseDate);
  const events = getEvents(userId, start, end);
  return buildWeekView(start, end, events);
}

/**
 * Handle cal-add-event: create a new event.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleAddEvent(userId, context) {
  const { title, startTime, endTime, allDay, color } = context;

  if (!title || !startTime) {
    return [toast('Event title and start time are required', 'error')];
  }

  createEvent(userId, {
    title: String(title),
    startTime: String(startTime),
    endTime: endTime ? String(endTime) : undefined,
    allDay: !!allDay,
    color: color ? String(color) : 'blue',
  });

  // Return to month view showing the event's month
  const eventDate = new Date(String(startTime));
  const year = eventDate.getFullYear();
  const month = eventDate.getMonth() + 1;
  const { start, end } = monthRange(year, month);
  const events = getEvents(userId, start, end);

  return [
    toast('Event created', 'success'),
    ...buildMonthView(year, month, events),
  ];
}

/**
 * Handle cal-delete-event: delete an event.
 * @param {string} userId
 * @param {Record<string, unknown>} context
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleDeleteEvent(userId, context) {
  const eventId = context.id ? String(context.id) : null;

  if (!eventId) {
    return [toast('Event ID required', 'error')];
  }

  const deleted = deleteEvent(eventId, userId);
  if (!deleted) {
    return [toast('Event not found', 'error')];
  }

  // Refresh current month
  const now = new Date();
  return [
    toast('Event deleted', 'success'),
    ...handleMonth(userId, { year: now.getFullYear(), month: now.getMonth() + 1 }),
  ];
}

// ─── Widget Definition ──────────────────────────────────────────────────────

/** @type {import('./framework.js').WidgetDef} */
export const calendarWidget = {
  prefix: 'cal',
  name: 'Calendar',

  /**
   * Initialize the calendar widget.
   * @param {import('./framework.js').WidgetContext} ctx
   */
  init(ctx) {
    db = ctx.db;
    ensureTable(db);
    console.log('[calendar] Widget initialized');
  },

  /**
   * Route an action to the appropriate handler.
   * @param {string} userId
   * @param {string} action
   * @param {Record<string, unknown>} context
   * @returns {import('./framework.js').GenUIOp[]}
   */
  handleAction(userId, action, context) {
    switch (action) {
      case 'cal-month':
        return handleMonth(userId, context);
      case 'cal-week':
        return handleWeek(userId, context);
      case 'cal-add-event':
        return handleAddEvent(userId, context);
      case 'cal-delete-event':
        return handleDeleteEvent(userId, context);
      default:
        return [toast(`Unknown calendar action: ${action}`, 'error')];
    }
  },

  /**
   * Cleanup.
   */
  destroy() {
    db = null;
  },
};
