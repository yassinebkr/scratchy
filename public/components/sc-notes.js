
class ScNotes extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.notes = [];
    this.activeNoteId = null;
    this.debounceTimeout = null;
  }

  static get observedAttributes() {
    return ['open'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open' && newValue !== null) {
      this.style.display = 'flex';
      this.fetchNotes();
    } else {
      this.style.display = 'none';
    }
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
    if (this.hasAttribute('open')) {
      this.fetchNotes();
    }
  }

  // -----------------
  // API Methods
  // -----------------

  async fetchNotes() {
    try {
      const response = await fetch('/api/notes', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Failed to fetch notes');
      this.notes = await response.json();
      this.notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      this.renderNoteList();
    } catch (error) {
      console.error('Error fetching notes:', error);
      // TODO: show error state
    }
  }

  async createNote() {
    const newNote = { title: 'New Note', content: '' };
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(newNote),
      });
      if (!response.ok) throw new Error('Failed to create note');
      const createdNote = await response.json();
      this.notes.unshift(createdNote);
      this.renderNoteList();
      this.openEditor(createdNote.id);
    } catch (error) {
      console.error('Error creating note:', error);
    }
  }

  async updateNote(id, title, content) {
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title, content }),
      });
      if (!response.ok) throw new Error('Failed to update note');
      const updatedNote = await response.json();
      const index = this.notes.findIndex(note => note.id === id);
      if (index !== -1) {
        this.notes[index] = updatedNote;
        this.notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        this.renderNoteList();
      }
    } catch (error) {
      console.error('Error updating note:', error);
    }
  }

  async deleteNote(id) {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Failed to delete note');
      this.notes = this.notes.filter(note => note.id !== id);
      this.closeEditor();
      this.renderNoteList();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  }

  // -----------------
  // Event Handlers
  // -----------------

  addEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target.closest('.close-btn')) this.close();
      if (e.target === this.shadowRoot.querySelector('.container') && !window.getSelection()?.toString()) this.close();
      if (e.target.closest('.new-note-btn')) this.createNote();
      if (e.target.closest('.back-btn')) this.closeEditor();
      if (e.target.closest('.delete-btn')) this.deleteNote(this.activeNoteId);

      const noteItem = e.target.closest('.note-item');
      if (noteItem) {
        this.openEditor(noteItem.dataset.id);
      }
    });
    
    this.shadowRoot.addEventListener('input', (e) => {
        const titleInput = this.shadowRoot.querySelector('.editor-title');
        const contentInput = this.shadowRoot.querySelector('.editor-content');
        if (e.target === titleInput || e.target === contentInput) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.updateNote(this.activeNoteId, titleInput.value, contentInput.value);
            }, 800);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (!this.hasAttribute('open')) return;
        if (e.key === 'Escape') this.closeEditor();
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            this.createNote();
        }
    });
  }

  // -----------------
  // UI Methods
  // -----------------

  openEditor(id) {
    this.activeNoteId = id;
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    
    this.shadowRoot.querySelector('.note-list-view').classList.add('hidden');
    this.shadowRoot.querySelector('.note-editor-view').classList.remove('hidden');

    this.shadowRoot.querySelector('.editor-title').value = note.title;
    this.shadowRoot.querySelector('.editor-content').value = note.content;
  }

  closeEditor() {
    this.activeNoteId = null;
    this.shadowRoot.querySelector('.note-editor-view').classList.add('hidden');
    this.shadowRoot.querySelector('.note-list-view').classList.remove('hidden');
  }

  close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('notes-close'));
  }

  // -----------------
  // Render Methods
  // -----------------
  
  renderNoteList() {
    const listContainer = this.shadowRoot.querySelector('.note-list');
    const emptyState = this.shadowRoot.querySelector('.empty-state');

    if (this.notes.length === 0) {
      emptyState.classList.remove('hidden');
      listContainer.classList.add('hidden');
    } else {
      emptyState.classList.add('hidden');
      listContainer.classList.remove('hidden');
      listContainer.innerHTML = this.notes.map(note => `
        <div class="note-item" data-id="${note.id}">
          <h3>${note.title}</h3>
          <p>${note.content.substring(0, 100)}</p>
          <time>${new Date(note.updatedAt).toLocaleDateString()}</time>
        </div>
      `).join('');
    }
  }

  render() {
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
          z-index: 100;
          display: none;
          font-family: var(--font);
          color: var(--text);
        }
        .container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .widget {
          width: 90%;
          max-width: 400px;
          height: 80%;
          max-height: 700px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .hidden { display: none !important; }
        
        /* List View */
        .note-list-view { display: flex; flex-direction: column; height: 100%; }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        }
        .header h2 { font-size: 18px; }
        .note-list { flex-grow: 1; overflow-y: auto; padding: 8px; }
        .note-item {
          padding: 12px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .note-item:hover { background: rgba(255,255,255,0.05); }
        .note-item h3 { font-size: 16px; margin-bottom: 4px; }
        .note-item p { font-size: 14px; color: var(--muted); line-height: 1.4; }
        .note-item time { font-size: 12px; color: var(--muted); margin-top: 8px; display: block; }
        .search-bar { padding: 8px 16px; }
        .search-bar input {
            width: 100%;
            padding: 8px 12px;
            background: rgba(0,0,0,0.2);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-size: 14px;
        }

        /* Editor View */
        .note-editor-view { display: flex; flex-direction: column; height: 100%; }
        .editor-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
        }
        .editor-title {
            flex-grow: 1;
            font-size: 18px;
            background: transparent;
            border: none;
            color: var(--text);
            padding: 4px 0;
        }
        .editor-title:focus { outline: none; }
        .editor-content {
            flex-grow: 1;
            padding: 16px;
            background: transparent;
            border: none;
            color: var(--text);
            font-size: 15px;
            line-height: 1.6;
            resize: none;
        }
        .editor-content:focus { outline: none; }
        
        /* Buttons */
        .btn {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        }
        .btn:hover { background: var(--accent); color: var(--bg); border-color: var(--accent); }
        .icon-btn { border: none; padding: 4px; }
        .icon-btn svg { width: 20px; height: 20px; fill: currentColor; }

        /* Empty State */
        .empty-state {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 20px;
        }
        .empty-state svg { width: 64px; height: 64px; color: var(--muted); margin-bottom: 16px; }
        .empty-state h3 { font-size: 18px; margin-bottom: 8px; }
        .empty-state p { color: var(--muted); margin-bottom: 16px; }

      </style>
      <div class="container">
        <div class="widget">
            <!-- Note List View -->
            <div class="note-list-view">
              <div class="header">
                  <h2>Notes</h2>
                  <div>
                    <button class="btn new-note-btn">New Note</button>
                    <button class="btn icon-btn close-btn">
                        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  </div>
              </div>
              <div class="search-bar">
                <input type="text" placeholder="Search notes..." />
              </div>
              <div class="note-list"></div>
              <div class="empty-state hidden">
                <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
                <h3>No notes yet</h3>
                <p>Create your first note to get started.</p>
                <button class="btn new-note-btn">Create Note</button>
              </div>
            </div>

            <!-- Note Editor View -->
            <div class="note-editor-view hidden">
                <div class="editor-header">
                    <button class="btn icon-btn back-btn">
                        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                    </button>
                    <input type="text" class="editor-title" placeholder="Note Title" />
                    <button class="btn icon-btn delete-btn">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
                <textarea class="editor-content" placeholder="Start writing..."></textarea>
            </div>
        </div>
      </div>
    `;
  }
}

customElements.define('sc-notes', ScNotes);
