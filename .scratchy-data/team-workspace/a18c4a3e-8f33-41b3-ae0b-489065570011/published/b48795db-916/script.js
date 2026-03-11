// Enhanced Animation and Interaction Script

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeAnimations();
    setupScrollIndicator();
    setupSmoothScrolling();
    setupFormInteractions();
    setupNavbarEffects();
    setupParallaxEffects();
    setupTypewriterEffect();
});

// Initialize all scroll-triggered animations
function initializeAnimations() {
    // Create Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
                
                // Special handling for staggered animations
                if (entry.target.classList.contains('projects-grid')) {
                    animateProjectCards(entry.target);
                }
                if (entry.target.classList.contains('skills-grid')) {
                    animateSkillItems(entry.target);
                }
            }
        });
    }, observerOptions);

    // Observe all animatable elements
    const animatableElements = document.querySelectorAll(
        '.section-title, .about-text, .about-image, .contact-form, .projects-grid, .skills-grid'
    );
    
    animatableElements.forEach(el => {
        observer.observe(el);
    });
}

// Animate project cards with staggered timing
function animateProjectCards(container) {
    const cards = container.querySelectorAll('.project-card');
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.classList.add('animate');
        }, index * 150); // 150ms delay between each card
    });
}

// Animate skill items with staggered timing
function animateSkillItems(container) {
    const items = container.querySelectorAll('.skill-item');
    items.forEach((item, index) => {
        setTimeout(() => {
            item.classList.add('animate');
        }, index * 100); // 100ms delay between each item
    });
}

// Setup scroll progress indicator
function setupScrollIndicator() {
    const scrollIndicator = document.createElement('div');
    scrollIndicator.className = 'scroll-indicator';
    document.body.appendChild(scrollIndicator);

    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        scrollIndicator.style.width = scrolled + '%';
    });
}

// Setup smooth scrolling for navigation links
function setupSmoothScrolling() {
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const offsetTop = targetSection.offsetTop - 80; // Account for fixed nav
                
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
                
                // Add active state animation
                this.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 150);
            }
        });
    });
}

// Enhanced form interactions
function setupFormInteractions() {
    const form = document.querySelector('.contact-form');
    if (!form) return;
    
    const inputs = form.querySelectorAll('input, textarea');
    const submitButton = form.querySelector('.submit-button');
    
    inputs.forEach(input => {
        // Focus animations
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
            this.style.transform = 'translateY(-2px)';
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('focused');
            this.style.transform = '';
            
            // Validation feedback
            if (this.value.trim() !== '') {
                this.style.borderColor = '#10b981'; // Green for valid
            } else if (this.hasAttribute('required')) {
                this.style.borderColor = '#ef4444'; // Red for invalid
            }
        });
        
        // Real-time validation
        input.addEventListener('input', function() {
            if (this.type === 'email') {
                const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
                this.style.borderColor = isValid ? '#10b981' : '#ef4444';
            }
        });
        
        // Floating label effect
        input.addEventListener('input', function() {
            const label = this.parentElement.querySelector('label');
            if (this.value.trim() !== '') {
                label.style.transform = 'translateY(-25px) scale(0.85)';
                label.style.color = '#6366f1';
            } else {
                label.style.transform = '';
                label.style.color = '';
            }
        });
    });
    
    // Form submission with loading state
    if (submitButton) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Show loading state
            submitButton.disabled = true;
            submitButton.innerHTML = '<span style="opacity: 0.7;">Sending...</span>';
            submitButton.style.background = '#9ca3af';
            
            // Simulate form submission
            setTimeout(() => {
                submitButton.innerHTML = '✓ Message Sent!';
                submitButton.style.background = '#10b981';
                
                // Reset form after success
                setTimeout(() => {
                    form.reset();
                    submitButton.disabled = false;
                    submitButton.innerHTML = 'Send Message';
                    submitButton.style.background = '';
                }, 2000);
            }, 2000);
        });
    }
}

// Navbar scroll effects
function setupNavbarEffects() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });
}

// Parallax effects for hero section
function setupParallaxEffects() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallax = scrolled * 0.5;
        
        hero.style.transform = `translateY(${parallax}px)`;
    });
}

// Typewriter effect for hero subtitle
function setupTypewriterEffect() {
    const typewriterElement = document.querySelector('.typewriter');
    if (!typewriterElement) return;
    
    const text = typewriterElement.textContent;
    typewriterElement.textContent = '';
    
    let i = 0;
    const typeWriter = () => {
        if (i < text.length) {
            typewriterElement.textContent += text.charAt(i);
            i++;
            setTimeout(typeWriter, 100);
        }
    };
    
    // Start typewriter effect after initial animations
    setTimeout(typeWriter, 1500);
}

// Enhanced hover effects for project cards
function setupProjectCardEffects() {
    const projectCards = document.querySelectorAll('.project-card');
    
    projectCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-15px) scale(1.03)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
        
        // Add ripple effect on click
        card.addEventListener('click', function(e) {
            const ripple = document.createElement('div');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(99, 102, 241, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            this.style.position = 'relative';
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
}

// Add ripple animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Enhanced scroll animations with custom easing
function animateOnScroll() {
    const elements = document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right, .scale-in');
    
    elements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;
        
        if (elementTop < window.innerHeight - elementVisible) {
            element.classList.add('animate');
        }
    });
}

// Throttled scroll listener for performance
let ticking = false;
function updateAnimations() {
    animateOnScroll();
    ticking = false;
}

window.addEventListener('scroll', () => {
    if (!ticking) {
        requestAnimationFrame(updateAnimations);
        ticking = true;
    }
});

// Initialize project card effects when DOM is ready
document.addEventListener('DOMContentLoaded', setupProjectCardEffects);

// Add loading animation
window.addEventListener('load', () => {
    document.body.classList.add('loaded');
    
    // Trigger initial animations
    const initialElements = document.querySelectorAll('.loading');
    initialElements.forEach((element, index) => {
        setTimeout(() => {
            element.classList.add('loaded');
        }, index * 100);
    });
});

// Cursor trail effect (optional)
function createCursorTrail() {
    const trail = [];
    const trailLength = 20;
    
    for (let i = 0; i < trailLength; i++) {
        const dot = document.createElement('div');
        dot.style.cssText = `
            position: fixed;
            width: 4px;
            height: 4px;
            background: #6366f1;
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            opacity: ${1 - i / trailLength};
            transform: scale(${1 - i / trailLength});
        `;
        document.body.appendChild(dot);
        trail.push(dot);
    }
    
    document.addEventListener('mousemove', (e) => {
        trail.forEach((dot, index) => {
            setTimeout(() => {
                dot.style.left = e.clientX + 'px';
                dot.style.top = e.clientY + 'px';
            }, index * 10);
        });
    });
}

// Uncomment to enable cursor trail
// createCursorTrail();