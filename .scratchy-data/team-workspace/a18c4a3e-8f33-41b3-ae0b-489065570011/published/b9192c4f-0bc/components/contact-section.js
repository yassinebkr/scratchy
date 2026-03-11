class ContactSection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
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
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    margin: 40px 0;
                    border-radius: 20px;
                    position: relative;
                    overflow: hidden;
                }

                .contact-background {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0.1;
                    background-image: 
                        radial-gradient(circle at 20% 80%, rgba(255,255,255,0.2) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%);
                }

                .contact-container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 0 40px;
                    position: relative;
                    z-index: 2;
                }

                .section-title {
                    font-size: 2.5rem;
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
                    background: rgba(255, 255, 255, 0.8);
                    border-radius: 2px;
                }

                .section-subtitle {
                    text-align: center;
                    font-size: 1.1rem;
                    margin-bottom: 3rem;
                    opacity: 0.9;
                }

                .contact-content {
                    display: grid;
                    grid-template-columns: 1fr 1.5fr;
                    gap: 60px;
                    align-items: start;
                    opacity: 0;
                    transform: translateY(50px);
                    transition: all 0.8s ease;
                }

                .contact-content.animate {
                    opacity: 1;
                    transform: translateY(0);
                }

                .contact-info {
                    opacity: 0;
                    transform: translateX(-50px);
                    transition: all 0.8s ease 0.2s;
                }

                .contact-info.animate {
                    opacity: 1;
                    transform: translateX(0);
                }

                .contact-item {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                    transition: all 0.3s ease;
                }

                .contact-item:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateX(10px);
                }

                .contact-icon {
                    width: 50px;
                    height: 50px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    flex-shrink: 0;
                }

                .contact-details h3 {
                    font-size: 1.2rem;
                    margin-bottom: 5px;
                }

                .contact-details p {
                    opacity: 0.8;
                    font-size: 0.95rem;
                }

                .contact-form {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    opacity: 0;
                    transform: translateX(50px);
                    transition: all 0.8s ease 0.4s;
                }

                .contact-form.animate {
                    opacity: 1;
                    transform: translateX(0);
                }

                .form-group {
                    margin-bottom: 25px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 500;
                    font-size: 0.95rem;
                }

                .form-control {
                    width: 100%;
                    padding: 15px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 10px;
                    color: white;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(5px);
                }

                .form-control::placeholder {
                    color: rgba(255, 255, 255, 0.7);
                }

                .form-control:focus {
                    outline: none;
                    border-color: rgba(255, 255, 255, 0.6);
                    background: rgba(255, 255, 255, 0.15);
                    box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
                }

                textarea.form-control {
                    resize: vertical;
                    min-height: 120px;
                }

                .submit-btn {
                    width: 100%;
                    padding: 15px;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    border: 2px solid rgba(255, 255, 255, 0.5);
                    border-radius: 10px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(5px);
                }

                .submit-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                    border-color: rgba(255, 255, 255, 0.8);
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                }

                .submit-btn:active {
                    transform: translateY(0);
                }

                .social-links {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-top: 40px;
                }

                .social-link {
                    width: 50px;
                    height: 50px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    text-decoration: none;
                    font-size: 1.3rem;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                }

                .social-link:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateY(-5px) scale(1.1);
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                }

                @media (max-width: 768px) {
                    .contact-container {
                        padding: 0 20px;
                    }

                    .contact-content {
                        grid-template-columns: 1fr;
                        gap: 40px;
                    }

                    .section-title {
                        font-size: 2rem;
                    }

                    .contact-form {
                        padding: 30px 25px;
                    }

                    .contact-item {
                        padding: 15px;
                    }

                    .social-links {
                        gap: 15px;
                    }
                }
            </style>
            
            <div class="contact-background"></div>
            
            <div class="contact-container">
                <h2 class="section-title">Get In Touch</h2>
                <p class="section-subtitle">Ready to start your next project? Let's create something amazing together!</p>
                
                <div class="contact-content">
                    <div class="contact-info">
                        <div class="contact-item">
                            <div class="contact-icon">📧</div>
                            <div class="contact-details">
                                <h3>Email</h3>
                                <p>john.doe@example.com</p>
                            </div>
                        </div>
                        
                        <div class="contact-item">
                            <div class="contact-icon">📱</div>
                            <div class="contact-details">
                                <h3>Phone</h3>
                                <p>+1 (555) 123-4567</p>
                            </div>
                        </div>
                        
                        <div class="contact-item">
                            <div class="contact-icon">📍</div>
                            <div class="contact-details">
                                <h3>Location</h3>
                                <p>San Francisco, CA</p>
                            </div>
                        </div>
                        
                        <div class="contact-item">
                            <div class="contact-icon">💼</div>
                            <div class="contact-details">
                                <h3>Availability</h3>
                                <p>Open for new projects</p>
                            </div>
                        </div>
                    </div>
                    
                    <form class="contact-form">
                        <div class="form-group">
                            <label for="name">Full Name</label>
                            <input type="text" id="name" name="name" class="form-control" placeholder="Your full name" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="email">Email Address</label>
                            <input type="email" id="email" name="email" class="form-control" placeholder="your.email@example.com" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="subject">Subject</label>
                            <input type="text" id="subject" name="subject" class="form-control" placeholder="Project inquiry" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="message">Message</label>
                            <textarea id="message" name="message" class="form-control" placeholder="Tell me about your project..." required></textarea>
                        </div>
                        
                        <button type="submit" class="submit-btn">Send Message</button>
                    </form>
                </div>
                
                <div class="social-links">
                    <a href="#" class="social-link" title="LinkedIn">💼</a>
                    <a href="#" class="social-link" title="GitHub">🐱</a>
                    <a href="#" class="social-link" title="Twitter">🐦</a>
                    <a href="#" class="social-link" title="Dribbble">🏀</a>
                </div>
            </div>
        `;
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const content = this.shadowRoot.querySelector('.contact-content');
                        const info = this.shadowRoot.querySelector('.contact-info');
                        const form = this.shadowRoot.querySelector('.contact-form');
                        
                        content.classList.add('animate');
                        info.classList.add('animate');
                        form.classList.add('animate');
                        
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.3 }
        );

        observer.observe(this);
    }

    setupEventListeners() {
        const form = this.shadowRoot.querySelector('.contact-form');
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(form);
            const data = {
                name: formData.get('name'),
                email: formData.get('email'),
                subject: formData.get('subject'),
                message: formData.get('message')
            };
            
            // Simulate form submission
            const submitBtn = this.shadowRoot.querySelector('.submit-btn');
            const originalText = submitBtn.textContent;
            
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            setTimeout(() => {
                submitBtn.textContent = 'Message Sent! ✅';
                form.reset();
                
                setTimeout(() => {
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }, 2000);
            }, 1500);
            
            // In a real application, you would send the data to your backend
            console.log('Form submitted:', data);
        });
        
        // Add input focus effects
        const inputs = this.shadowRoot.querySelectorAll('.form-control');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                input.parentElement.style.transform = 'scale(1.02)';
            });
            
            input.addEventListener('blur', () => {
                input.parentElement.style.transform = 'scale(1)';
            });
        });
    }
}

customElements.define('contact-section', ContactSection);