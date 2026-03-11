class SkillsGrid extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.skills = [
            { name: 'JavaScript', level: 95, icon: '🟨' },
            { name: 'React', level: 90, icon: '⚛️' },
            { name: 'Vue.js', level: 85, icon: '💚' },
            { name: 'TypeScript', level: 88, icon: '🔷' },
            { name: 'CSS3', level: 92, icon: '🎨' },
            { name: 'HTML5', level: 95, icon: '🌐' },
            { name: 'Node.js', level: 80, icon: '💚' },
            { name: 'Git', level: 85, icon: '🔧' },
            { name: 'Webpack', level: 75, icon: '📦' },
            { name: 'Sass', level: 88, icon: '💎' },
            { name: 'MongoDB', level: 70, icon: '🍃' },
            { name: 'Firebase', level: 82, icon: '🔥' }
        ];
    }

    connectedCallback() {
        this.render();
        this.setupIntersectionObserver();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    padding: 80px 0;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    margin: 40px 0;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
                }

                .skills-container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 0 40px;
                }

                .section-title {
                    font-size: 2.5rem;
                    color: #333;
                    text-align: center;
                    margin-bottom: 3rem;
                    position: relative;
                }

                .section-title::after {
                    content: '';
                    position: absolute;
                    bottom: -15px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 80px;
                    height: 4px;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    border-radius: 2px;
                }

                .skills-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 25px;
                    opacity: 0;
                    transform: translateY(50px);
                    transition: all 0.8s ease;
                }

                .skills-grid.animate {
                    opacity: 1;
                    transform: translateY(0);
                }

                .skill-item {
                    background: white;
                    padding: 25px;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                    transition: all 0.3s ease;
                    border: 2px solid transparent;
                    opacity: 0;
                    transform: translateY(30px);
                    animation: skillFadeIn 0.6s ease forwards;
                }

                .skill-item:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 20px 40px rgba(102, 126, 234, 0.2);
                    border-color: #667eea;
                }

                .skill-header {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-bottom: 15px;
                }

                .skill-icon {
                    font-size: 2rem;
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-radius: 12px;
                    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
                }

                .skill-name {
                    font-size: 1.3rem;
                    font-weight: 600;
                    color: #333;
                }

                .skill-level {
                    font-size: 0.9rem;
                    color: #667eea;
                    font-weight: 500;
                }

                .skill-progress {
                    width: 100%;
                    height: 8px;
                    background: #f0f0f0;
                    border-radius: 10px;
                    overflow: hidden;
                    margin-top: 10px;
                }

                .skill-progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    border-radius: 10px;
                    width: 0%;
                    transition: width 1.5s ease;
                    position: relative;
                }

                .skill-progress-bar::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 10px;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.3);
                    animation: shimmer 2s infinite;
                }

                @keyframes skillFadeIn {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }

                .tech-categories {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-bottom: 40px;
                    flex-wrap: wrap;
                }

                .category-tag {
                    padding: 10px 20px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border-radius: 25px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: transform 0.3s ease;
                }

                .category-tag:hover {
                    transform: scale(1.05);
                }

                @media (max-width: 768px) {
                    .skills-container {
                        padding: 0 20px;
                    }

                    .skills-grid {
                        grid-template-columns: 1fr;
                        gap: 20px;
                    }

                    .section-title {
                        font-size: 2rem;
                    }

                    .tech-categories {
                        gap: 10px;
                    }

                    .category-tag {
                        padding: 8px 16px;
                        font-size: 0.8rem;
                    }
                }
            </style>
            
            <div class="skills-container">
                <h2 class="section-title">Skills & Technologies</h2>
                
                <div class="tech-categories">
                    <span class="category-tag">Frontend</span>
                    <span class="category-tag">Backend</span>
                    <span class="category-tag">Tools</span>
                    <span class="category-tag">Database</span>
                </div>
                
                <div class="skills-grid">
                    ${this.skills.map((skill, index) => `
                        <div class="skill-item" style="animation-delay: ${index * 0.1}s">
                            <div class="skill-header">
                                <div class="skill-icon">${skill.icon}</div>
                                <div>
                                    <div class="skill-name">${skill.name}</div>
                                    <div class="skill-level">${skill.level}% Proficiency</div>
                                </div>
                            </div>
                            <div class="skill-progress">
                                <div class="skill-progress-bar" data-level="${skill.level}"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const grid = this.shadowRoot.querySelector('.skills-grid');
                        grid.classList.add('animate');
                        
                        // Animate progress bars
                        setTimeout(() => {
                            const progressBars = this.shadowRoot.querySelectorAll('.skill-progress-bar');
                            progressBars.forEach(bar => {
                                const level = bar.dataset.level;
                                bar.style.width = `${level}%`;
                            });
                        }, 300);
                        
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.3 }
        );

        observer.observe(this);
    }
}

customElements.define('skills-grid', SkillsGrid);