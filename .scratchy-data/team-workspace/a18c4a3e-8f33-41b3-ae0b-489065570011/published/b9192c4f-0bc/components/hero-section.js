class HeroSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.currentTextIndex = 0;
        this.currentCharIndex = 0;
        this.isDeleting = false;
        this.texts = ['Frontend Developer', 'UI/UX Designer', 'Creative Coder', 'Problem Solver'];
    }

    connectedCallback() {
        this.render();
        this.startTypingAnimation();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    position: relative;
                    overflow: hidden;
                }

                .hero-content {
                    z-index: 2;
                    max-width: 800px;
                    padding: 2rem;
                }

                .hero-title {
                    font-size: 3.5rem;
                    font-weight: 700;
                    margin-bottom: 1rem;
                    opacity: 0;
                    animation: fadeInUp 1s ease-out 0.5s forwards;
                }

                .hero-subtitle {
                    font-size: 1.5rem;
                    margin-bottom: 2rem;
                    height: 2em;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .typing-text {
                    border-right: 3px solid white;
                    padding-right: 5px;
                    animation: blink 1s infinite;
                }

                .hero-cta {
                    opacity: 0;
                    animation: fadeInUp 1s ease-out 1.5s forwards;
                }

                .cta-button {
                    display: inline-block;
                    padding: 15px 30px;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    text-decoration: none;
                    border-radius: 30px;
                    border: 2px solid white;
                    font-size: 1.1rem;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                }

                .cta-button:hover {
                    background: white;
                    color: #667eea;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                }

                .hero-background {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                }

                .floating-shape {
                    position: absolute;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    animation: float 6s ease-in-out infinite;
                }

                .shape-1 {
                    width: 80px;
                    height: 80px;
                    top: 20%;
                    left: 10%;
                    animation-delay: 0s;
                }

                .shape-2 {
                    width: 120px;
                    height: 120px;
                    top: 60%;
                    right: 15%;
                    animation-delay: 2s;
                }

                .shape-3 {
                    width: 60px;
                    height: 60px;
                    bottom: 20%;
                    left: 20%;
                    animation-delay: 4s;
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes blink {
                    0%, 50% { border-color: white; }
                    51%, 100% { border-color: transparent; }
                }

                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(180deg); }
                }

                @media (max-width: 768px) {
                    .hero-title {
                        font-size: 2.5rem;
                    }
                    
                    .hero-subtitle {
                        font-size: 1.2rem;
                    }
                    
                    .hero-content {
                        padding: 1rem;
                    }
                }
            </style>
            
            <div class="hero-background">
                <div class="floating-shape shape-1"></div>
                <div class="floating-shape shape-2"></div>
                <div class="floating-shape shape-3"></div>
            </div>
            
            <div class="hero-content">
                <h1 class="hero-title">Hello, I'm John Doe</h1>
                <div class="hero-subtitle">
                    <span class="typing-text">Frontend Developer</span>
                </div>
                <div class="hero-cta">
                    <a href="#contact" class="cta-button">Let's Work Together</a>
                </div>
            </div>
        `;
    }

    startTypingAnimation() {
        const typingElement = this.shadowRoot.querySelector('.typing-text');
        
        const type = () => {
            const currentText = this.texts[this.currentTextIndex];
            
            if (this.isDeleting) {
                typingElement.textContent = currentText.substring(0, this.currentCharIndex - 1);
                this.currentCharIndex--;
            } else {
                typingElement.textContent = currentText.substring(0, this.currentCharIndex + 1);
                this.currentCharIndex++;
            }

            let typeSpeed = this.isDeleting ? 100 : 150;

            if (!this.isDeleting && this.currentCharIndex === currentText.length) {
                typeSpeed = 2000;
                this.isDeleting = true;
            } else if (this.isDeleting && this.currentCharIndex === 0) {
                this.isDeleting = false;
                this.currentTextIndex = (this.currentTextIndex + 1) % this.texts.length;
            }

            setTimeout(type, typeSpeed);
        };

        setTimeout(type, 1000);
    }
}

customElements.define('hero-section', HeroSection);