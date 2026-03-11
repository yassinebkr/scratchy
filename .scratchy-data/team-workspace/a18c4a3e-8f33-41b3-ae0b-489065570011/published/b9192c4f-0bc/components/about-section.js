class AboutSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
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

                .about-container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 0 40px;
                    display: grid;
                    grid-template-columns: 1fr 2fr;
                    gap: 60px;
                    align-items: center;
                }

                .about-image {
                    opacity: 0;
                    transform: translateX(-50px);
                    transition: all 0.8s ease;
                }

                .about-image.animate {
                    opacity: 1;
                    transform: translateX(0);
                }

                .profile-image {
                    width: 300px;
                    height: 300px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 8px solid #667eea;
                    box-shadow: 0 20px 40px rgba(102, 126, 234, 0.3);
                    transition: transform 0.3s ease;
                }

                .profile-image:hover {
                    transform: scale(1.05);
                }

                .about-content {
                    opacity: 0;
                    transform: translateX(50px);
                    transition: all 0.8s ease 0.2s;
                }

                .about-content.animate {
                    opacity: 1;
                    transform: translateX(0);
                }

                .section-title {
                    font-size: 2.5rem;
                    color: #333;
                    margin-bottom: 1.5rem;
                    position: relative;
                }

                .section-title::after {
                    content: '';
                    position: absolute;
                    bottom: -10px;
                    left: 0;
                    width: 60px;
                    height: 4px;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    border-radius: 2px;
                }

                .about-text {
                    font-size: 1.1rem;
                    line-height: 1.8;
                    color: #666;
                    margin-bottom: 2rem;
                }

                .about-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 20px;
                    margin-top: 2rem;
                }

                .stat-item {
                    text-align: center;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border-radius: 15px;
                    transition: transform 0.3s ease;
                }

                .stat-item:hover {
                    transform: translateY(-5px);
                }

                .stat-number {
                    font-size: 2rem;
                    font-weight: bold;
                    display: block;
                }

                .stat-label {
                    font-size: 0.9rem;
                    opacity: 0.9;
                }

                @media (max-width: 768px) {
                    .about-container {
                        grid-template-columns: 1fr;
                        gap: 40px;
                        padding: 0 20px;
                        text-align: center;
                    }

                    .profile-image {
                        width: 250px;
                        height: 250px;
                    }

                    .section-title {
                        font-size: 2rem;
                    }

                    .about-stats {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
            </style>
            
            <div class="about-container">
                <div class="about-image">
                    <img src="https://via.placeholder.com/300x300/667eea/ffffff?text=Profile" 
                         alt="Profile Picture" 
                         class="profile-image">
                </div>
                
                <div class="about-content">
                    <h2 class="section-title">About Me</h2>
                    <p class="about-text">
                        I'm a passionate frontend developer with over 5 years of experience creating 
                        beautiful, functional, and user-friendly web applications. I specialize in 
                        modern JavaScript frameworks, responsive design, and creating seamless user experiences.
                    </p>
                    <p class="about-text">
                        When I'm not coding, you can find me exploring new technologies, contributing to 
                        open-source projects, or sharing knowledge with the developer community through 
                        blog posts and speaking engagements.
                    </p>
                    
                    <div class="about-stats">
                        <div class="stat-item">
                            <span class="stat-number">50+</span>
                            <span class="stat-label">Projects</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">5+</span>
                            <span class="stat-label">Years Exp</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">100+</span>
                            <span class="stat-label">Happy Clients</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const image = this.shadowRoot.querySelector('.about-image');
                        const content = this.shadowRoot.querySelector('.about-content');
                        
                        image.classList.add('animate');
                        content.classList.add('animate');
                        
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.3 }
        );

        observer.observe(this);
    }
}

customElements.define('about-section', AboutSection);