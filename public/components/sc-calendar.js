
class ScCalendar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.date = new Date();
    this.events = [];
    this.selectedDate = null;
    this.colorPresets = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#ec4899'];
  }

  static get observedAttributes() {
    return ['open'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      this.render();
    }
  }

  connectedCallback() {
    this.fetchEvents();
    this.shadowRoot.addEventListener('click', this.onClick.bind(this));
    document.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onKeyDown.bind(this));
  }

  onKeyDown(e) {
    if (!this.hasAttribute('open')) return;
    if (e.key === 'Escape') {
      this.close();
    }
    if (e.key === 'ArrowLeft') {
      this.prevMonth();
    }
    if (e.key === 'ArrowRight') {
      this.nextMonth();
    }
  }

  onClick(e) {
    const target = e.target;
    if (target.closest('.close-btn')) {
      this.close();
    }
    if (target.closest('.prev-month')) {
      this.prevMonth();
    }
    if (target.closest('.next-month')) {
      this.nextMonth();
    }
    if (target.closest('.calendar-day')) {
      const day = target.closest('.calendar-day').dataset.date;
      if (day) {
        this.selectedDate = new Date(day);
        this.render();
      }
    }
    if (target.closest('.add-event-btn')) {
        this.selectedDate = new Date(target.closest('.add-event-btn').dataset.date);
        this.renderForm();
    }
    if(target.closest('.day-events-close')) {
        this.selectedDate = null;
        this.render();
    }
    if (target.closest('.delete-event-btn')) {
        const eventId = target.closest('.delete-event-btn').dataset.id;
        this.deleteEvent(eventId);
    }
    if (target.closest('.edit-event-btn')) {
        const eventId = target.closest('.edit-event-btn').dataset.id;
        this.editEvent(eventId);
    }
    if (target.id === 'save-event') {
        this.saveEvent(e);
    }
     if (target.id === 'cancel-event') {
        this.selectedDate = null;
        this.render();
    }
  }

  async deleteEvent(eventId) {
      if (!confirm('Are you sure you want to delete this event?')) return;

      try {
        const response = await fetch(`/api/calendar/${eventId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        if (response.ok) {
            this.selectedDate = null;
            this.fetchEvents();
        }
      } catch (err) {
          console.error('Failed to delete event', err);
      }
  }

  editEvent(eventId) {
    const event = this.events.find(e => e.id === eventId);
    this.selectedDate = new Date(event.startTime);
    this.renderForm(event);
  }
  
  async saveEvent(e){
    e.preventDefault();
    const form = this.shadowRoot.querySelector('#event-form');
    const title = form.title.value;
    const allDay = form.allDay.checked;
    const startTime = form.startTime.value;
    const endTime = form.endTime.value;
    const color = form.color.value;

    const startDateTime = new Date(this.selectedDate);
    if(!allDay && startTime){
        const [hours, minutes] = startTime.split(':');
        startDateTime.setHours(hours, minutes);
    }

    const endDateTime = new Date(this.selectedDate);
    if(!allDay && endTime){
         const [hours, minutes] = endTime.split(':');
        endDateTime.setHours(hours, minutes);
    }
    
    const event = {
        title,
        startTime: startDateTime.toISOString(),
        endTime: !allDay && endTime ? endDateTime.toISOString() : null,
        allDay,
        color
    };

    try {
        const response = await fetch('/api/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(event)
        });
        if(response.ok){
            this.selectedDate = null;
            this.fetchEvents();
        }
    } catch(err){
        console.error('Failed to save event', err);
    }
  }


  close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('calendar-close'));
  }

  prevMonth() {
    this.date.setMonth(this.date.getMonth() - 1);
    this.fetchEvents();
  }

  nextMonth() {
    this.date.setMonth(this.date.getMonth() + 1);
    this.fetchEvents();
  }

  async fetchEvents() {
    const start = new Date(this.date.getFullYear(), this.date.getMonth(), 1).toISOString();
    const end = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).toISOString();

    try {
      const response = await fetch(`/api/calendar?start=${start}&end=${end}`, { credentials: 'same-origin' });
      this.events = await response.json();
      this.render();
    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
      this.events = [];
      this.render();
    }
  }
  
  renderForm(event = null) {
    const isEdit = event !== null;
    const title = isEdit ? event.title : '';
    const allDay = isEdit ? event.allDay : false;
    const startTime = isEdit && !event.allDay ? new Date(event.startTime).toTimeString().substring(0,5) : '';
    const endTime = isEdit && event.endTime && !event.allDay ? new Date(event.endTime).toTimeString().substring(0,5) : '';
    const color = isEdit ? event.color : this.colorPresets[0];

    const formHtml = `
      <div class="form-modal">
        <form id="event-form" data-id="${isEdit ? event.id : ''}">
          <h3>${isEdit ? 'Edit' : 'Add'} Event on ${this.selectedDate.toDateString()}</h3>
          <input type="text" name="title" placeholder="Event Title" value="${title}" required>
          <div>
            <label><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''} onchange="this.getRootNode().host.shadowRoot.querySelector('.time-inputs').style.display = this.checked ? 'none' : 'flex'"> All-day</label>
          </div>
          <div class="time-inputs" style="display: ${allDay ? 'none' : 'flex'};">
            <input type="time" name="startTime" value="${startTime}">
            <input type="time" name="endTime" value="${endTime}">
          </div>
          <div class="color-picker">
            ${this.colorPresets.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span class="color-dot" style="background:${c}"></span></label>`).join('')}
          </div>
          <div class="form-actions">
            <button type="button" id="cancel-event">Cancel</button>
            <button type="submit" id="save-event">${isEdit ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </div>
    `;
    this.shadowRoot.querySelector('.calendar-container').insertAdjacentHTML('beforeend', formHtml);
  }

  render() {
    if (!this.hasAttribute('open')) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const month = this.date.getMonth();
    const year = this.date.getFullYear();
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday, 6 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const monthName = this.date.toLocaleString('default', { month: 'long' });

    let daysHtml = '';
    // empty days
    for (let i = 0; i < firstDay; i++) {
      daysHtml += `<div class="calendar-day empty"></div>`;
    }

    // month days
    for (let i = 1; i <= daysInMonth; i++) {
      const currentDate = new Date(year, month, i);
      const isToday = today.toDateString() === currentDate.toDateString();
      const dayEvents = this.events.filter(e => new Date(e.startTime).toDateString() === currentDate.toDateString());
      daysHtml += `
        <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${currentDate.toISOString()}">
          <span>${i}</span>
          <div class="day-events">
            ${dayEvents.map(e => `<div class="event-dot" style="background:${e.color || 'var(--accent)'}"></div>`).join('')}
          </div>
        </div>`;
    }

    let dayDetailHtml = '';
    if (this.selectedDate) {
      const dayEvents = this.events.filter(e => new Date(e.startTime).toDateString() === this.selectedDate.toDateString());
      dayDetailHtml = `
        <div class="day-detail-panel">
          <button class="day-events-close">X</button>
          <h4>Events on ${this.selectedDate.toLocaleDateString()}</h4>
          ${dayEvents.length > 0 ? 
            `<ul>${dayEvents.map(e => `<li><div>${e.allDay ? 'All Day' : new Date(e.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${e.title}</div><div><button class="edit-event-btn" data-id="${e.id}">Edit</button><button class="delete-event-btn" data-id="${e.id}">Delete</button></div></li>`).join('')}</ul>`
            : `<p>No events. <button class="add-event-btn" data-date="${this.selectedDate.toISOString()}">Add one?</button></p>`
          }
        </div>
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --bg: #0d0b07;
          --surface: rgba(26,22,16,0.85);
          --border: rgba(249,166,2,0.10);
          --text: #f0ead6;
          --muted: #8a7e6a;
          --accent: #F9A602;
          --font: 'Geist', system-ui, sans-serif;
          position: fixed;
          inset: 0;
          z-index: 1000;
          font-family: var(--font);
          color: var(--text);
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          background: rgba(0,0,0,0.5);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        :host([open]) {
          opacity: 1;
        }
        .calendar-container {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          position: relative;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }
        header h2 {
          font-weight: 500;
        }
        .close-btn, .prev-month, .next-month {
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font-size: 1.5rem;
        }
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 1px;
          background: var(--border);
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
          overflow:hidden;
        }
        .calendar-day, .weekday {
          padding: 0.5rem;
          text-align: center;
          background: var(--surface);
          color: var(--muted);
          min-height: 80px;
        }
        .weekday {
            min-height: auto;
             padding: 0.75rem 0.5rem;
             font-weight: 600;
        }
        .calendar-day:not(.empty) {
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .calendar-day:not(.empty):hover {
          background: rgba(255,255,255,0.05);
        }
        .calendar-day.today span {
          background: var(--accent);
          color: var(--bg);
          border-radius: 50%;
          padding: 0.2rem 0.4rem;
        }
        .event-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            margin: 2px auto 0;
        }
        .day-events {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            margin-top: 4px;
        }

        /* Day Detail Panel */
        .day-detail-panel {
          position: absolute;
          top: 0;
          right: 0;
          width: 250px;
          height: 100%;
          background: #110e09;
          border-left: 1px solid var(--border);
          padding: 1rem;
          animation: slideIn 0.2s ease;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        
        .day-events-close {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            color: var(--muted);
            font-size: 1rem;
            cursor: pointer;
        }

        /* Form Modal */
        .form-modal {
          position: absolute;
          inset: 0;
          background: rgba(13, 11, 7, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        #event-form {
          background: var(--surface);
          padding: 2rem;
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        #event-form input[type="text"], #event-form input[type="time"] {
            width: 100%;
            background: #110e09;
            border: 1px solid var(--border);
            color: var(--text);
            padding: 0.5rem;
            border-radius: 4px;
            margin-bottom: 1rem;
        }
        .time-inputs { display: flex; gap: 1rem; }
        .color-picker { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .color-picker input { display: none; }
        .color-picker .color-dot {
            width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent;
        }
        .color-picker input:checked + .color-dot {
            border-color: var(--accent);
        }
        .form-actions { display: flex; justify-content: flex-end; gap: 1rem; }
        .form-actions button {
            background: var(--surface-hover);
            border: 1px solid var(--border);
            color: var(--text);
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
        }
        .form-actions button#save-event {
            background: var(--accent);
            color: var(--bg);
        }


      </style>
      <div class="calendar-container">
        <header>
          <button class="prev-month">&lt;</button>
          <h2>${monthName} ${year}</h2>
          <button class="next-month">&gt;</button>
          <button class="close-btn">&times;</button>
        </header>
        <div class="calendar-grid">
           <div class="weekday">Mon</div>
           <div class="weekday">Tue</div>
           <div class="weekday">Wed</div>
           <div class="weekday">Thu</div>
           <div class="weekday">Fri</div>
           <div class="weekday">Sat</div>
           <div class="weekday">Sun</div>
          ${daysHtml}
        </div>
        ${dayDetailHtml}
        ${this.events.filter(e => new Date(e.startTime).getMonth() === this.date.getMonth()).length === 0 ? `<div style="padding: 2rem; text-align:center;">No events this month. <button class="add-event-btn" data-date="${new Date().toISOString()}">Create one</button></div>` : ''}
      </div>
    `;

    // Re-focus after render if needed
    if (this.selectedDate && this.shadowRoot.querySelector('.day-detail-panel')) {
        this.shadowRoot.querySelector('.day-events-close').focus();
    } else if (this.shadowRoot.querySelector('.form-modal')) {
        this.shadowRoot.querySelector('input[name="title"]').focus();
    }
  }
}

customElements.define('sc-calendar', ScCalendar);
