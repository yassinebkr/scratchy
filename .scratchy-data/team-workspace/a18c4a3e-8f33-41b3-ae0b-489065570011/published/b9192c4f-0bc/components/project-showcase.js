class ProjectShowcase extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.projects = [
            {
                id: 1,
                title: 'E-Commerce Platform',
                description: 'A modern e-commerce platform built with React and Node.js, featuring real-time inventory, payment integration, and responsive design.',
                image: 'https://via.placeholder.com/400x250/667eea/ffffff?text=E-Commerce',
                technologies: ['React', 'Node.js', 'MongoDB', 'Stripe'],
                github: '#',
                demo: '#',
                featured: true
            },
            {
                id: 2,
                title: 'Task Management App',
                description: 'A collaborative task management application with real-time updates, drag-and-drop functionality, and team collaboration features.',
                image: 'https://via.placeholder.com/400x250/764ba2/ffffff?text=Task+Manager',
                technologies: ['Vue.js', 'Firebase', 'CSS3'],
                github: '#',
                demo: '#',
                featured: false
            },
            {
                id: 3,
                title: 'Weather Dashboard',
                description: 'An interactive weather dashboard with location-based forecasts, data visualization, and responsive charts.',
                image: 'https://via.placeholder.com/400x250/48bb78/ffffff?text=Weather+App',
                technologies: ['JavaScript', 'Chart.js', 'Weather API'],
                github: '#',
                demo: '#',
                featured: false
            },
            {
                id: 4,
                title: 'Portfolio Website',
                description: 'A responsive portfolio website built with modern web components and advanced CSS animations.',
                image: 'https://via.placeholder.com/400x250/f39c12/ffffff?text=Portfolio',
                technologies: ['Web Components', 'CSS3', 'JavaScript'],
                github: '#',
                demo: '#',
                featured: true
            }
        ];
    }

    connectedCallback() {
        this.render();
        this.setupIntersectionObserver();
        this.setupEventListeners();
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

                .projects-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 0 40px;
                }

                .section-title {
                    font-size: 2.5rem;
                    color: #333;
                    text-align: center;
                    margin-bottom: 1rem;
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

                .section-subtitle {
                    text-align: center;
                    color: #666;
                    font-size: 1.1rem;
                    margin-bottom: 3rem;
                }

                .filter-tabs {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-bottom: 40px;
                }

                .filter-tab {
                    padding: 12px 24px;
                    background: transparent;
                    border: 2px solid #667eea;
                    color: #667eea;
                    border-radius: 25px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-weight: 500;
                }

                .filter-tab.active,
                .filter-tab:hover {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    transform: translateY(-2px);
                }

                .projects-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                    gap: 30px;
                    opacity: 0;
                    transform: translateY(50px);
                    transition: all 0.8s ease;
                }

                .projects-grid.animate {
                    opacity: 1;
                    transform: translateY(0);
                }

                .project-card {
                    background: white;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
                    transition: all 0.4s ease;
                    opacity: 0;
                    transform: translateY(30px);
                    animation: cardFadeIn 0.6s ease forwards;
                    position: relative;
                }

                .project-card:hover {
                    transform: translateY(-10px);
                    box-shadow: 0 25px 50px rgba(102, 126, 234, 0.2);
                }

                .project-card.featured::before {
                    content: '⭐ Featured';
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    background: linear-gradient(135deg, #f39c12, #e67e22);
                    color: white;
                    padding: 5px 12px;
                    border-radius: 15px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    z-index: 2;
                }

                .project-image {
                    width: 100%;
                    height: 200px;
                    object-fit: cover;
                    transition: transform 0.4s ease;
                }

                .project-card:hover .project-image {
                    transform: scale(1.05);
                }

                .project-content {
                    padding: 25px;
                }

                .project-title {
                    font-size: 1.4rem;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 10px;
                }

                .project-description {
                    color: #666;
                    line-height: 1.6;
                    margin-bottom: 20px;
                    font-size: 0.95rem;
                }

                .project-tech {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 20px;
                }

                .tech-tag {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    padding: 4px 12px;
                    border-radius: 15px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }

                .project-links {
                    display: flex;
                    gap: 15px;
                }

                .project-link {
                    flex: 1;
                    padding: 12px;
                    text-align: center;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: 500;
                    transition: all 0.3s ease;
                }

                .link-github {
                    background: #333;
                    color: white;
                }

                .link-github:hover {
                    background: #555;
                    transform: translateY(-2px);
                }

                .link-demo {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                }

                .link-demo:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
                }

                @keyframes cardFadeIn {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .projects-container {
                        padding: 0 20px;
                    }

                    .projects-grid {
                        grid-template-columns: 1fr;
                        gap: 20px;
                    }

                    .section-title {
                        font-size: 2rem;
                    }

                    .filter-tabs {
                        flex-wrap: wrap;
                        gap: 10px;
                    }

                    .filter-tab {
                        padding: 10px 20px;
                        font-size: 0.9rem;
                    }

                    .project-content {
                        padding: 20px;
                    }
                }
            </style>
            
            <div class="projects-container">
                <h2 class="section-title">Featured Projects</h2>
                <p class="section-subtitle">Here are some of my recent works that showcase my skills and creativity</p>
                
                <div class="filter-tabs">
                    <button class="filter-tab active" data-filter="all">All Projects</button>
                    <button class="filter-tab" data-filter="featured">Featured</button>
                    <button class="filter-tab" data-filter="web">Web Apps</button>
                </div>
                
                <div class="projects-grid">
                    ${this.projects.map((project, index) => `
                        <div class="project-card ${project.featured ? 'featured' : ''}" 
                             style="animation-delay: ${index * 0.15}s"
                             data-category="${project.featured ? 'featured' : 'web'}">
                            <img src="${project.image}" alt="${project.title}" class="project-image">
                            <div class="project-content">
                                <h3 class="project-title">${project.title}</h3>
                                <p class="project-description">${project.description}</p>
                                <div class="project-tech">
                                    ${project.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
                                </div>
                                <div class="project-links">
                                    <a href="${project.github}" class="project-link link-github">GitHub</a>
                                    <a href="${project.demo}" class="project-link link-demo">Live Demo</a>
                                </div>
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
                        const grid = this.shadowRoot.querySelector('.projects-grid');
                        grid.classList.add('animate');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.3 }
        );

        observer.observe(this);
    }

    setupEventListeners() {
        const filterTabs = this.shadowRoot.querySelectorAll('.filter-tab');
        const projectCards = this.shadowRoot.querySelectorAll('.project-card');

        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const filter = tab.dataset.filter;
                
                // Update active tab
                filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Filter projects
                projectCards.forEach(card => {
                    if (filter === 'all' || card.dataset.category === filter) {
                        card.style.display = 'block';
                        card.style.animation = 'cardFadeIn 0.6s ease forwards';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });
    }
}

customElements.define('project-showcase', ProjectShowcase);