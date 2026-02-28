
class SCAgentWizard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._currentStep = 1;
        this._agentConfig = this._getDefaultConfig();
        this._boundHandleKeydown = this._handleKeydown.bind(this);
        this._boundHandleClick = this._handleClick.bind(this);
    }

    static get observedAttributes() {
        return ['open'];
    }

    _getDefaultConfig() {
        return {
            persona: 'custom',
            name: 'Custom Agent',
            avatar: '🤖',
            systemPrompt: 'You are a helpful AI assistant.',
            capabilities: {
                webSearch: false,
                fileAccess: false,
                codeExecution: false,
                imageGeneration: false,
                canvas: false,
                memory: false,
            },
            mcpUrls: [],
            model: 'sonnet',
        };
    }

    get open() {
        return this.hasAttribute('open');
    }

    set open(isOpen) {
        if (isOpen) {
            this.setAttribute('open', '');
        } else {
            this.removeAttribute('open');
        }
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Design System Variables */
                :host {
                    --bg: #0d0b07;
                    --surface: #1a1610;
                    --text: #f0ead6;
                    --muted: #8a7e6a;
                    --accent: #F9A602;
                    --accent-hover: #DAA520;
                    --accent-glow: rgba(249, 166, 2, 0.20);
                    --accent-border: rgba(249, 166, 2, 0.10);
                    --glass: rgba(26, 22, 16, 0.85);
                    --glass-border: rgba(249, 166, 2, 0.08);

                    --font-sans: 'Geist', sans-serif;
                    --font-mono: 'Geist Mono', monospace;
                    
                    --radius: 8px;
                    --radius-sm: 6px;
                    --transition: 0.2s ease;
                }

                /* Base */
                .backdrop {
                    position: fixed;
                    inset: 0;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity var(--transition), visibility var(--transition);
                }

                :host([open]) .backdrop {
                    opacity: 1;
                    visibility: visible;
                }

                .wizard {
                    background: var(--glass);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--radius);
                    width: 90vw;
                    max-width: 680px;
                    color: var(--text);
                    font-family: var(--font-sans);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    transform: scale(0.95);
                    opacity: 0;
                    transition: transform var(--transition), opacity var(--transition);
                }
                
                :host([open]) .wizard {
                    transform: scale(1);
                    opacity: 1;
                }

                header {
                    padding: 16px 24px;
                    border-bottom: 1px solid var(--accent-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                header h2 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 500;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: var(--muted);
                    font-size: 24px;
                    cursor: pointer;
                    transition: color var(--transition);
                    line-height: 1;
                }

                .close-btn:hover {
                    color: var(--text);
                }

                main {
                    padding: 24px;
                    min-height: 400px;
                    overflow-x: hidden;
                    position: relative;
                }
                
                .step {
                    display: none;
                    animation: slide-in 0.3s ease forwards;
                }

                .step.active {
                    display: block;
                }
                
                .step.slide-out {
                    animation: slide-out 0.3s ease forwards;
                }

                @keyframes slide-in {
                    from {
                        transform: translateX(30px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                
                @keyframes slide-out {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(-30px);
                        opacity: 0;
                    }
                }
                

                footer {
                    padding: 16px 24px;
                    border-top: 1px solid var(--accent-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                /* Step Indicator */
                .step-indicator {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .step-dot {
                    width: 10px;
                    height: 10px;
                    background-color: var(--surface);
                    border: 1px solid var(--accent-border);
                    border-radius: 50%;
                    transition: background-color var(--transition), border-color var(--transition);
                }

                .step-dot.active {
                    background-color: var(--accent);
                    border-color: var(--accent);
                }

                /* Buttons */
                .btn {
                    font-family: var(--font-sans);
                    border: none;
                    padding: 8px 16px;
                    font-size: 14px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    transition: background-color var(--transition), color var(--transition), box-shadow var(--transition);
                }

                .btn-primary {
                    background-color: var(--accent);
                    color: var(--bg);
                    font-weight: 500;
                }

                .btn-primary:hover {
                    background-color: var(--accent-hover);
                    box-shadow: 0 0 15px var(--accent-glow);
                }
                
                .btn-secondary {
                    background-color: var(--surface);
                    color: var(--text);
                    border: 1px solid var(--accent-border);
                }

                .btn-secondary:hover {
                     background-color: #2a241a;
                }
                
                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .nav-buttons {
                    display: flex;
                    gap: 12px;
                }

                /* Step 1: Persona Grid */
                .persona-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 16px;
                }

                .persona-card {
                    background: var(--surface);
                    padding: 16px;
                    border-radius: var(--radius);
                    border: 1px solid var(--accent-border);
                    cursor: pointer;
                    transition: all var(--transition);
                    position: relative;
                    overflow: hidden;
                    border-left: 4px solid transparent;
                }

                .persona-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 0 20px var(--accent-glow);
                    border-color: var(--accent);
                }
                
                .persona-card.selected {
                    border-left-color: var(--accent);
                    box-shadow: 0 0 20px var(--accent-glow);
                    background-color: #2a241a;
                }

                .persona-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .persona-card p {
                    margin: 0;
                    font-size: 12px;
                    color: var(--muted);
                }

                /* Step 2: Capabilities */
                .capabilities-grid, .form-section {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                .capabilities-grid h3, .form-section h3 {
                    margin: 0 0 8px 0;
                    font-weight: 500;
                    font-size: 16px;
                    border-bottom: 1px solid var(--accent-border);
                    padding-bottom: 8px;
                }
                
                .chip-group {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }

                .chip {
                    background: var(--surface);
                    color: var(--muted);
                    padding: 6px 12px;
                    border-radius: 16px;
                    font-size: 12px;
                    cursor: pointer;
                    border: 1px solid var(--accent-border);
                    transition: all var(--transition);
                    user-select: none;
                }

                .chip:hover {
                    background-color: #2a241a;
                    color: var(--text);
                }

                .chip.selected {
                    background-color: var(--accent);
                    color: var(--bg);
                    font-weight: 500;
                    border-color: var(--accent);
                }

                /* Step 3 & Form Elements */
                 .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 220px;
                    gap: 24px;
                }

                .form-fields {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .form-group label {
                    font-size: 12px;
                    color: var(--muted);
                    font-weight: 500;
                }

                input[type="text"], select, textarea {
                    width: 100%;
                    background: var(--surface);
                    border: 1px solid var(--accent-border);
                    border-radius: var(--radius-sm);
                    padding: 8px 12px;
                    color: var(--text);
                    font-family: var(--font-sans);
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color var(--transition), box-shadow var(--transition);
                }
                
                input[type="text"]:focus, select:focus, textarea:focus {
                    outline: none;
                    border-color: var(--accent);
                    box-shadow: 0 0 10px var(--accent-glow);
                }

                textarea {
                    font-family: var(--font-mono);
                    min-height: 150px;
                    resize: vertical;
                }
                
                select {
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%238a7e6a' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 10px center;
                }

                /* Preview Card */
                .preview-card {
                    background: var(--surface);
                    padding: 16px;
                    border-radius: var(--radius);
                    border: 1px solid var(--accent-border);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }

                .preview-card h4 {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    color: var(--muted);
                    font-weight: 500;
                }
                
                .agent-preview {
                    background-color: var(--bg);
                    padding: 12px;
                    border-radius: var(--radius-sm);
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .agent-preview-avatar {
                    font-size: 24px;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .agent-preview-name {
                    font-size: 14px;
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                /* Responsive */
                @media (max-width: 640px) {
                    .wizard {
                        height: 90vh;
                    }
                    main {
                        flex-grow: 1;
                        overflow-y: auto;
                    }
                    .persona-grid {
                         grid-template-columns: 1fr;
                    }
                    .form-grid {
                        grid-template-columns: 1fr;
                    }
                    .preview-card {
                        order: -1;
                        margin-bottom: 24px;
                    }
                }

            </style>
            <div class="backdrop" part="backdrop">
                <div class="wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title" part="wizard">
                    <header>
                        <h2 id="wizard-title">Create New Agent</h2>
                        <button class="close-btn" aria-label="Close">&times;</button>
                    </header>

                    <main>
                        <!-- Step 1: Choose Persona -->
                        <div id="step-1" class="step">
                            <div class="persona-grid">
                                <!-- Persona cards will be injected here -->
                            </div>
                        </div>

                        <!-- Step 2: Pick Capabilities -->
                        <div id="step-2" class="step">
                            <div class="capabilities-grid">
                                <div class="form-section">
                                    <h3>Core Capabilities</h3>
                                    <div class="chip-group" data-group="capabilities">
                                        <div class="chip" data-capability="webSearch">Web Search</div>
                                        <div class="chip" data-capability="fileAccess">File Access</div>
                                        <div class="chip" data-capability="codeExecution">Code Execution</div>
                                        <div class="chip" data-capability="imageGeneration">Image Generation</div>
                                        <div class="chip" data-capability="canvas">Canvas/GenUI</div>
                                        <div class="chip" data-capability="memory">Memory</div>
                                    </div>
                                </div>
                                <div class="form-section">
                                     <h3>Model</h3>
                                     <div class="form-group">
                                         <label for="model-select">Select a primary model for the agent</label>
                                         <select id="model-select" name="model">
                                             <option value="sonnet">Claude 3.5 Sonnet</option>
                                             <option value="opus">Claude 3 Opus</option>
                                             <option value="haiku">Claude 3 Haiku</option>
                                             <option value="custom">Custom Model</option>
                                         </select>
                                     </div>
                                 </div>
                                <div class="form-section">
                                    <h3>Custom Tools (Advanced)</h3>
                                    <div class="form-group">
                                        <label for="mcp-urls">MCP Server URLs (one per line)</label>
                                        <textarea id="mcp-urls" name="mcpUrls" placeholder="https://example.com/tools/v1\nhttps://anotherservice.com/api"></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Step 3: Customize -->
                        <div id="step-3" class="step">
                            <div class="form-grid">
                                <div class="form-fields">
                                    <div class="form-group">
                                        <label for="agent-name">Agent Name</label>
                                        <input type="text" id="agent-name" name="name" placeholder="e.g., Code Assistant">
                                    </div>
                                    <div class="form-group">
                                        <label for="agent-avatar">Avatar (Emoji or URL)</label>
                                        <input type="text" id="agent-avatar" name="avatar" placeholder="🏗️">
                                    </div>
                                    <div class="form-group">
                                        <label for="agent-prompt">System Prompt</label>
                                        <textarea id="agent-prompt" name="systemPrompt" placeholder="You are a helpful assistant..."></textarea>
                                    </div>
                                </div>
                                <div class="preview-card">
                                    <h4>Preview</h4>
                                    <div class="agent-preview">
                                        <div class="agent-preview-avatar"></div>
                                        <div class="agent-preview-name"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    <footer>
                        <div class="step-indicator">
                            <div id="dot-1" class="step-dot"></div>
                            <div id="dot-2" class="step-dot"></div>
                            <div id="dot-3" class="step-dot"></div>
                        </div>
                        <div class="nav-buttons">
                            <button id="back-btn" class="btn btn-secondary">Back</button>
                            <button id="next-btn" class="btn btn-primary">Next</button>
                            <button id="create-btn" class="btn btn-primary">Create Agent</button>
                        </div>
                    </footer>
                </div>
            </div>
        `;

        this.PERSONAS = {
            'code-assistant': { name: 'Code Assistant', icon: '🏗️', description: 'Writes and reviews code', prompt: 'You are a senior software engineer. Your purpose is to help users write, debug, and optimize high-quality code. You are proficient in multiple programming languages and development best practices.' },
            'designer': { name: 'Designer', icon: '🎨', description: 'UI/UX design and styling', prompt: 'You are an expert UI/UX designer. You specialize in creating intuitive, beautiful, and user-centric interfaces. Provide feedback, generate design ideas, and help with CSS and layout.' },
            'researcher': { name: 'Researcher', icon: '🔬', description: 'Deep research and analysis', prompt: 'You are a meticulous researcher. Your goal is to find, synthesize, and present information from reliable sources to answer complex questions. Always cite your sources.' },
            'writer': { name: 'Writer', icon: '✍️', description: 'Content, docs, copywriting', prompt: 'You are a versatile writer and editor. You can draft, refine, and proofread content for various purposes, including documentation, marketing copy, and articles. Your tone is clear and engaging.' },
            'data-analyst': { name: 'Data Analyst', icon: '📊', description: 'Data visualization and insights', prompt: 'You are a data analyst. You can interpret datasets, generate visualizations, and extract meaningful insights. You are proficient with data analysis libraries and tools.' },
            'custom': { name: 'Custom', icon: '🤖', description: 'Blank slate, configure everything', prompt: 'You are a helpful AI assistant.' }
        };

        this._renderPersonas();
        this._addEventListeners();
        this._updateStepView();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'open') {
            const isOpen = newValue !== null;
            if (isOpen) {
                document.addEventListener('keydown', this._boundHandleKeydown);
                this._trapFocus();
                // Reset to default state when opening
                this._currentStep = 1;
                this._agentConfig = this._getDefaultConfig();
                this._updateStepView();
                this._updateFormFromConfig();
            } else {
                document.removeEventListener('keydown', this._boundHandleKeydown);
            }
        }
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._boundHandleKeydown);
    }
    
    _addEventListeners() {
        this.shadowRoot.addEventListener('click', this._boundHandleClick);
        this.shadowRoot.querySelector('#agent-name').addEventListener('input', e => this._updateConfigValue('name', e.target.value));
        this.shadowRoot.querySelector('#agent-avatar').addEventListener('input', e => this._updateConfigValue('avatar', e.target.value));
        this.shadowRoot.querySelector('#agent-prompt').addEventListener('input', e => this._updateConfigValue('systemPrompt', e.target.value));
        this.shadowRoot.querySelector('#model-select').addEventListener('change', e => this._updateConfigValue('model', e.target.value));
        this.shadowRoot.querySelector('#mcp-urls').addEventListener('input', e => this._updateConfigValue('mcpUrls', e.target.value.split('\n').filter(Boolean)));
    }

    _handleClick(event) {
        const target = event.target;

        if (target.closest('.close-btn') || target.classList.contains('backdrop')) {
            this._cancel();
        } else if (target.id === 'next-btn') {
            this._nextStep();
        } else if (target.id === 'back-btn') {
            this._prevStep();
        } else if (target.id === 'create-btn') {
            this._finish();
        } else if (target.closest('.persona-card')) {
            this._selectPersona(target.closest('.persona-card').dataset.id);
        } else if (target.closest('.chip')) {
            this._toggleChip(target.closest('.chip'));
        }
    }
    
    _handleKeydown(event) {
        if (event.key === 'Escape') {
            this._cancel();
        }
    }
    
    _renderPersonas() {
        const grid = this.shadowRoot.querySelector('.persona-grid');
        grid.innerHTML = Object.entries(this.PERSONAS).map(([id, persona]) => `
            <div class="persona-card" data-id="${id}">
                <h3>${persona.icon} <span>${persona.name}</span></h3>
                <p>${persona.description}</p>
            </div>
        `).join('');
    }

    _updateStepView() {
        const steps = this.shadowRoot.querySelectorAll('.step');
        steps.forEach((step, index) => {
            const isActive = (index + 1) === this._currentStep;
            if (isActive && !step.classList.contains('active')) {
                 step.classList.remove('slide-out');
                 step.classList.add('active');
            } else if (!isActive && step.classList.contains('active')) {
                step.classList.remove('active');
                // We only slide-out if we are moving forward, not implemented yet
                // step.classList.add('slide-out'); 
            }
        });

        // Update dots
        const dots = this.shadowRoot.querySelectorAll('.step-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', (index + 1) <= this._currentStep);
        });

        // Update buttons
        this.shadowRoot.querySelector('#back-btn').style.display = this._currentStep > 1 ? 'inline-block' : 'none';
        this.shadowRoot.querySelector('#next-btn').style.display = this._currentStep < 3 ? 'inline-block' : 'none';
        this.shadowRoot.querySelector('#create-btn').style.display = this._currentStep === 3 ? 'inline-block' : 'none';
    }

    _nextStep() {
        if (this._currentStep < 3) {
            this._currentStep++;
            this._updateStepView();
        }
    }

    _prevStep() {
        if (this._currentStep > 1) {
            this._currentStep--;
            this._updateStepView();
        }
    }

    _selectPersona(personaId) {
        this._agentConfig.persona = personaId;
        const persona = this.PERSONAS[personaId];
        this._agentConfig.name = persona.name;
        this._agentConfig.avatar = persona.icon;
        this._agentConfig.systemPrompt = persona.prompt;

        // Update UI selection
        this.shadowRoot.querySelectorAll('.persona-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.id === personaId);
        });
        
        // Pre-fill Step 3 and update preview
        this._updateFormFromConfig();
        
        // Automatically move to the next step
        setTimeout(() => this._nextStep(), 200);
    }
    
    _toggleChip(chip) {
        const isSelected = chip.classList.toggle('selected');
        const capability = chip.dataset.capability;
        if (capability) {
            this._agentConfig.capabilities[capability] = isSelected;
        }
    }

    _updateConfigValue(key, value) {
        this._agentConfig[key] = value;
        if (key === 'name' || key === 'avatar') {
            this._updatePreview();
        }
    }

    _updateFormFromConfig() {
        this.shadowRoot.querySelector('#agent-name').value = this._agentConfig.name;
        this.shadowRoot.querySelector('#agent-avatar').value = this._agentConfig.avatar;
        this.shadowRoot.querySelector('#agent-prompt').value = this._agentConfig.systemPrompt;
        this.shadowRoot.querySelector('#model-select').value = this._agentConfig.model;
        this.shadowRoot.querySelector('#mcp-urls').value = this._agentConfig.mcpUrls.join('\n');
        
        // Update capability chips
        const chips = this.shadowRoot.querySelectorAll('.chip[data-capability]');
        chips.forEach(chip => {
            const capability = chip.dataset.capability;
            chip.classList.toggle('selected', !!this._agentConfig.capabilities[capability]);
        });
        
        this._updatePreview();
    }
    
    _updatePreview() {
        this.shadowRoot.querySelector('.agent-preview-avatar').textContent = this._agentConfig.avatar;
        this.shadowRoot.querySelector('.agent-preview-name').textContent = this._agentConfig.name || 'New Agent';
    }

    _finish() {
        // Final validation can go here if needed
        this.dispatchEvent(new CustomEvent('wizard-complete', {
            detail: { agent: { ...this._agentConfig } },
            bubbles: true,
            composed: true
        }));
        this.open = false;
    }

    _cancel() {
        this.dispatchEvent(new CustomEvent('wizard-cancel', {
            bubbles: true,
            composed: true
        }));
        this.open = false;
    }

    _trapFocus() {
        const focusableElements = this.shadowRoot.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const focusHandler = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement || this.shadowRoot.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement || this.shadowRoot.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        };

        // remove previous if any
        this.shadowRoot.removeEventListener('keydown', this._focusHandler);
        // add new one
        this._focusHandler = focusHandler;
        this.shadowRoot.addEventListener('keydown', this._focusHandler);

        firstElement?.focus();
    }
}

customElements.define('sc-agent-wizard', SCAgentWizard);
