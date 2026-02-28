# Scratchy v2 — UI/UX Design Review

**Date:** 2026-02-27  
**Reviewer:** Subagent (Senior UI/UX Review)  
**Design System:** Gold/amber dark theme, Geist font, 14px base, 8px radius, glassmorphism  
**Components Reviewed:** sc-settings, sc-setup-wizard, sc-auth, sc-landing, sc-plans

---

## Executive Summary

The overall design language is **strong** — the gold/amber dark theme is executed consistently across most components, glassmorphism is applied tastefully, and animations are purposeful with proper reduced-motion support. However, there are **critical accessibility failures** (primarily white-on-gold button contrast), inconsistent input patterns between screens, emoji usage violating the SVG-only icon rule, and off-palette colors leaking into `sc-plans`. Below are scores and detailed findings.

---

## Component Scores

| Component | Score | Summary |
|---|---|---|
| **sc-settings.js** | 7.5/10 | Solid glass-card settings with good section structure. Toggle switches lack keyboard a11y. Dialog lacks ARIA & focus trap. |
| **sc-setup-wizard.js** | 7/10 | Well-animated multi-step flow with staggered fields. Emoji icons violate design rule. Auth tabs missing proper ARIA. Global keydown listener is dangerous. |
| **sc-auth.js** | 8/10 | Best-executed component — floating labels, shake animation, social login, tab switching. PW toggle is removed from tab order. |
| **sc-landing.js** | 7.5/10 | Strong marketing page with intersection observer section reveals. Emoji icons, no mobile nav menu, correct dark-on-gold button text (only component to get this right). |
| **sc-plans.js** | 7/10 | Nice price animation and proper ARIA on billing toggle. Off-palette colors (`#818cf8` purple, `#a1a1aa` gray) break the design system. |

**Overall Average: 7.4/10**

---

## Cross-Component Issues

### 🔴 P0-01: White Text on Gold Buttons — WCAG Failure

**Severity:** P0 — Broken  
**Affects:** sc-settings, sc-setup-wizard, sc-auth, sc-plans  
**Does NOT affect:** sc-landing (correct implementation)

`color: #fff` on `background: #F9A602` produces a contrast ratio of approximately **1.45:1**, far below the WCAG AA minimum of 4.5:1 for normal text. This makes button labels nearly unreadable for low-vision users and fails automated accessibility audits.

**sc-landing gets it right** with `color: #0d0b07` — dark text on gold achieves ~10:1 contrast.

**Fix for sc-settings.js:**
```css
/* Line ~233: .btn-primary */
.btn-primary {
  background: var(--accent);
  color: #0d0b07; /* was #fff */
}
```

**Fix for sc-setup-wizard.js:**
```css
/* Line ~126: .btn-primary */
.btn-primary {
  background: #F9A602;
  color: #0d0b07; /* was #fff */
}

/* Line ~388: .start-btn */
.start-btn {
  /* ... */
  background: #F9A602;
  color: #0d0b07; /* was #fff */
}
```

Also update the spinner border colors accordingly (from `rgba(255,255,255,...)` to `rgba(0,0,0,...)`).

**Fix for sc-auth.js:**
```css
/* Line ~229: .submit-btn */
.submit-btn {
  background: var(--accent);
  color: #0d0b07; /* was #fff */
}
```

**Fix for sc-plans.js:**
```css
/* Line ~308: .cta--solid */
.cta--solid {
  background: #F9A602;
  border-color: #F9A602;
  color: #0d0b07; /* was #fff */
}
```

---

### 🔴 P0-02: Toggle Switches Have No Keyboard Accessibility (sc-settings)

**File:** sc-settings.js  
**Lines:** ~305–325 (CSS), ~458–460 (connectedCallback)

The `.toggle` elements are plain `<div>` elements with only click handlers. They have:
- No `tabindex`
- No `role="switch"` or `role="checkbox"`
- No `aria-checked`
- No keyboard handler (Enter/Space)

Keyboard-only users cannot interact with preferences at all.

**Fix (HTML):**
```html
<div class="toggle active" id="toggle-notifs" 
     role="switch" aria-checked="true" 
     aria-label="Notifications" tabindex="0"></div>

<div class="toggle active disabled" id="toggle-theme" 
     role="switch" aria-checked="true" aria-disabled="true"
     aria-label="Dark theme" tabindex="0"
     title="Only dark theme is available"></div>
```

**Fix (JS — add to connectedCallback):**
```javascript
[this.$toggleNotifs, this.$toggleTheme].forEach(toggle => {
  toggle.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle.click();
    }
  });
});

// Update aria-checked on toggle
this.$toggleNotifs.addEventListener('click', () => {
  const active = this.$toggleNotifs.classList.contains('active');
  this.$toggleNotifs.setAttribute('aria-checked', String(active));
});
```

---

### 🔴 P0-03: Password Toggle Removed from Tab Order (sc-auth)

**File:** sc-auth.js, Line ~376  
**Code:** `<button type="button" class="pw-toggle" id="pw-toggle" tabindex="-1">`

The `tabindex="-1"` means keyboard users **cannot** toggle password visibility. This is a significant accessibility barrier.

**Fix:**
```html
<button type="button" class="pw-toggle" id="pw-toggle" tabindex="0" aria-label="Toggle password visibility">
```

---

## Per-Component Detailed Review

---

### 1. sc-settings.js — Score: 7.5/10

#### ✅ Strengths
- Complete design token usage via CSS custom properties
- Glass card sections with proper backdrop-filter
- Animated gradient mesh background matching design system
- Skeleton loading states defined (good progressive enhancement)
- Section stagger entrance animation (sectionIn)
- Password strength indicator with color-coded bars
- Auto-hide password reveal after 2 seconds (security best practice)
- Dialog overlay with Escape key support
- Scrollbar styling matching theme
- Reduced motion support

#### Issues

| ID | Priority | Line(s) | Issue | Fix |
|---|---|---|---|---|
| S-01 | P0 | 233 | `.btn-primary` has `color: #fff` — fails WCAG contrast on gold | Change to `color: #0d0b07` |
| S-02 | P0 | 305–325 | Toggle switches not keyboard accessible, no ARIA | Add `role="switch"`, `tabindex="0"`, `aria-checked`, keydown handler |
| S-03 | P1 | 79–81 | Back button is 36×36px — below 44px touch target minimum | Change to `width: 44px; height: 44px;` |
| S-04 | P1 | 396–426 | Dialog lacks `role="dialog"`, `aria-modal="true"`, no focus trap | Add ARIA attributes and implement focus trap |
| S-05 | P1 | 396 | Dialog overlay does not prevent background scroll | Add `body { overflow: hidden }` when dialog is open |
| S-06 | P1 | 312 | Select element has no associated `<label>` (only visual `.pref-label`) | Add `aria-label="Language"` to the select or use `for` attribute |
| S-07 | P2 | 426 | `.dialog h3` uses fixed 16px — could use the same section-title pattern for consistency | Minor, keep if intentional |
| S-08 | P2 | 505 | Delete error is shown via pw-msg area with comment "borrow" — fragile UX | Add a dedicated error area in the danger zone |

**Fix for S-03 (back button touch target):**
```css
.back-btn {
  width: 44px;   /* was 36px */
  height: 44px;  /* was 36px */
  /* rest unchanged */
}
```

**Fix for S-04 (dialog ARIA):**
```html
<div class="dialog-overlay" id="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <div class="dialog">
    <h3 id="dialog-title">Delete Account</h3>
    <!-- ... -->
  </div>
</div>
```

**Fix for S-06 (select label):**
```html
<select id="select-lang" aria-label="Interface language">
```

---

### 2. sc-setup-wizard.js — Score: 7/10

#### ✅ Strengths
- Well-crafted 5-step flow with smooth panel transitions
- Staggered field entrance animations (fieldIn with per-field delays)
- Step indicator dots with completion checkmarks
- Shimmer progress bar
- Provider card selection with keyboard support
- Avatar grid with proper `role="option"` and keyboard handlers
- Validation with shake animation and inline errors
- API key test functionality with visual feedback states
- OAuth tab system (new feature, well-structured)
- Good `setOAuthStatus()` public API for parent control
- Reduced motion support

#### Issues

| ID | Priority | Line(s) | Issue | Fix |
|---|---|---|---|---|
| W-01 | P0 | 126 | `.btn-primary` has `color: #fff` — fails WCAG contrast | Change to `color: #0d0b07` |
| W-02 | P0 | 388 | `.start-btn` has `color: #fff` — fails WCAG contrast | Change to `color: #0d0b07` |
| W-03 | P1 | 17–21 | `STEP_META` uses emoji icons (✨👤🔑⚙️🚀) instead of SVGs | Replace with inline SVG icons from a consistent icon set |
| W-04 | P1 | 206–215 | OAuth provider icons use emoji (🟠🔵) | Replace with proper SVG brand icons |
| W-05 | P1 | 350–364 | Preference option cards use emoji (🌙🇬🇧🇫🇷) | Replace with SVG icons or text-only |
| W-06 | P1 | 500–520 | Auth tabs (`.auth-tab`) don't use proper `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls` | Implement proper ARIA tabbed interface pattern |
| W-07 | P1 | 528–538 | Global `document.addEventListener('keydown')` — captures Enter/Escape globally | Scope to wizard element or add `isConnected` check |
| W-08 | P1 | 156 | Step indicators don't have `aria-label` for screen readers | Add `aria-label="Step N of 5: Title"` |
| W-09 | P2 | — | No glassmorphism/mesh background (unlike settings/auth) | Add bg-mesh for visual consistency, or document as intentional |
| W-10 | P2 | 305–308 | `.oauth-note` uses `border-left: 2px solid rgba(249,166,2,0.3)` — callout box is good, but could match a shared component pattern | Minor — acceptable |

**Fix for W-06 (ARIA tabs):**
```html
<div class="auth-tabs" role="tablist" aria-label="Connection method">
  <button class="auth-tab active" data-tab="apikey" role="tab" 
          aria-selected="true" aria-controls="tab-apikey" id="tab-btn-apikey">API Key</button>
  <button class="auth-tab" data-tab="oauth" role="tab" 
          aria-selected="false" aria-controls="tab-oauth" id="tab-btn-oauth">Subscription (OAuth)</button>
</div>

<div class="auth-tab-content active" id="tab-apikey" role="tabpanel" aria-labelledby="tab-btn-apikey">
```

**Fix for W-07 (scoped keydown):**
```javascript
// In connectedCallback, replace:
document.addEventListener('keydown', this._onKeyDown);
// With:
this.addEventListener('keydown', this._onKeyDown);
// And ensure the host element can receive focus:
if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '-1');
```

---

### 3. sc-auth.js — Score: 8/10

#### ✅ Strengths
- Best-executed component for polish and interaction design
- Floating label inputs with smooth CSS transitions
- Animated tab indicator with cubic-bezier easing
- Social login buttons with proper SVG icons (Google, GitHub)
- Shake animation on form errors — good haptic-like feedback
- Password strength indicator with progressive bar coloring
- Auto-hide password reveal after 2 seconds
- Slide-in/out name field for signup mode
- Blur validation for real-time feedback
- Focus management (auto-focus email on mount, re-focus on mode switch)
- Mobile: full-height card with safe-area-inset support
- Reduced motion support
- Consistent CSS variable usage

#### Issues

| ID | Priority | Line(s) | Issue | Fix |
|---|---|---|---|---|
| A-01 | P0 | 229 | `.submit-btn` has `color: #fff` on gold — WCAG contrast failure | Change to `color: #0d0b07` |
| A-02 | P0 | 376 | PW toggle has `tabindex="-1"` — inaccessible to keyboard | Change to `tabindex="0"` |
| A-03 | P1 | 175–177 | Input height is 52px vs sc-settings' 42px — inconsistent input sizing across screens | Standardize to 48px (compromise), or 52px everywhere if floating labels are adopted globally |
| A-04 | P1 | 306–308 | Social buttons lack `aria-label` (text content "Google" / "GitHub" is present but combined with SVG may confuse some readers) | Good enough with text content — minor |
| A-05 | P2 | 274 | `.forgot-link` click dispatches no event — dead button | Add `auth-forgot` event dispatch or link to a route |
| A-06 | P2 | — | Input pattern uses floating labels while sc-settings uses block labels above inputs — visual inconsistency between screens | Adopt one pattern globally (floating labels preferred for modern UX) |
| A-07 | P2 | 175 | Email field uses `type="text"` — mobile keyboards won't show `@` key | Consider `inputmode="email"` on the input while keeping `type="text"` for username support |

**Fix for A-05 (forgot password):**
```javascript
this.$forgotRow.querySelector('.forgot-link').addEventListener('click', () => {
  this.dispatchEvent(new CustomEvent('auth-forgot', {
    bubbles: true, composed: true,
    detail: { email: this.$email.value.trim() }
  }));
});
```

**Fix for A-07 (mobile keyboard):**
```html
<input id="email" name="email" type="text" placeholder=" " 
       autocomplete="username" inputmode="email" required />
```

---

### 4. sc-landing.js — Score: 7.5/10

#### ✅ Strengths
- **Only component with correct button text color** (`color: #0d0b07` on gold)
- Responsive hero with `clamp()` typography — excellent
- Intersection observer for section fade-in reveals
- Scroll-aware nav with glassmorphism on scroll
- Smooth scroll for anchor links
- Code showcase block with syntax highlighting
- Stats section with bold numbers
- Well-structured footer
- Reduced motion support
- Proper focus-visible on buttons

#### Issues

| ID | Priority | Line(s) | Issue | Fix |
|---|---|---|---|---|
| L-01 | P1 | 8–13 (FEATURES) | Feature icons use emojis (🤖🎨🔌🔒💬🌐) instead of SVGs | Replace with SVG icons from Lucide or Heroicons |
| L-02 | P1 | 20–24 (STEPS) | Step icons use emojis (🚀🔗⚡) instead of SVGs | Replace with SVG icons |
| L-03 | P1 | 5 (PLANS) | BYOK plan CTA text includes emoji: `'🔑 Subscribe'` | Remove emoji from CTA |
| L-04 | P1 | — | Nav links disappear on mobile (≤768px) with no hamburger menu | Add a mobile hamburger/drawer menu |
| L-05 | P1 | 1–7 (PLANS) | Duplicate `PLANS` data — also defined in sc-plans.js | Extract to shared module or import |
| L-06 | P2 | 38 (:host) | Base font-size is 15px — design system specifies 14px | Change to `font-size: 14px` for consistency |
| L-07 | P2 | — | Feature cards lack `cursor: pointer` despite hover effects | Add `cursor: pointer` to `.feature-card` |
| L-08 | P2 | — | Plan cards in the landing section lack `cursor: pointer` | Either make them clickable or remove hover transforms |
| L-09 | P2 | 60–65 | `.nav` is flush `top:0; left:0; right:0` — skill recommends floating nav with spacing | Acceptable for marketing pages, but could add subtle top/side margin |
| L-10 | P2 | — | `.hero-scroll` text "↓ Scroll to explore" uses a text arrow — could use an SVG chevron for consistency | Minor aesthetic preference |

**Fix for L-04 (mobile nav):**
```css
/* Add to existing styles */
.nav-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 8px;
  min-width: 44px;
  min-height: 44px;
}

@media (max-width: 768px) {
  .nav-toggle { display: flex; align-items: center; justify-content: center; }
  .nav-links { 
    display: none; /* Toggle via JS */
    position: absolute;
    top: 56px; left: 0; right: 0;
    flex-direction: column;
    background: rgba(13,11,7,0.95);
    backdrop-filter: blur(12px);
    padding: 16px;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .nav-links.open { display: flex; }
}
```

**Fix for L-07 (cursor):**
```css
.feature-card {
  /* add: */
  cursor: default; /* or cursor: pointer if cards become clickable */
}
```

---

### 5. sc-plans.js — Score: 7/10

#### ✅ Strengths
- Animated price counter on billing toggle — excellent micro-interaction with ease-out cubic
- Proper ARIA on billing toggle (`role="radiogroup"`, `role="radio"`, `aria-checked`)
- CTA buttons have descriptive `aria-label` (e.g., "Upgrade to Pro — Pro plan")
- Native `<details>/<summary>` for FAQ — accessible by default
- SVG check icons instead of emoji ✅
- `@media (hover: hover)` — prevents sticky hover on touch devices
- Clean card entrance animation with stagger delay
- Reduced motion support
- FAQ chevron rotation animation
- Responsive grid breakpoints

#### Issues

| ID | Priority | Line(s) | Issue | Fix |
|---|---|---|---|---|
| P-01 | P0 | 308 | `.cta--solid` has `color: #fff` on gold — WCAG contrast failure | Change to `color: #0d0b07` |
| P-02 | P1 | 235 | `.badge--accent` uses `color: #818cf8` (purple) — NOT in design system | Change to `color: #F9A602` or `#f0ead6` |
| P-03 | P1 | 329 | `.cta--outline` uses `color: #818cf8` (purple) — NOT in design system | Change to `color: #F9A602` |
| P-04 | P1 | 335 | `.cta--outline:hover` uses `border-color: #818cf8` — off-palette | Change to `border-color: #DAA520` or `#F9A602` |
| P-05 | P1 | 277 | `.feature` color is `#a1a1aa` — not in design palette (cold gray vs warm scheme) | Change to `#8a7e6a` (muted) for warm consistency |
| P-06 | P1 | 376 | `.faq-a` color is `#a1a1aa` — same off-palette gray | Change to `#8a7e6a` |
| P-07 | P1 | 1–55 | Duplicate `PLANS` data (also in sc-landing.js) | Extract to shared `plans-data.js` module |
| P-08 | P2 | — | No glassmorphism/backdrop-filter on cards — opaque `#1a1610` | Acceptable if embedded within another page, but could add subtle glass |
| P-09 | P2 | — | No animated background mesh — differs from settings/auth | Expected if component is embedded, not standalone |
| P-10 | P2 | 221 | `.badge-spacer` is used to maintain alignment when no badge — could use `min-height` instead | Functional, minor preference |

**Fix for P-02 and P-03 (off-palette purple):**
```css
/* Line ~235 */
.badge--accent {
  background: rgba(249,166,2,0.14);
  color: #F9A602; /* was #818cf8 */
}

/* Line ~329 */
.cta--outline {
  background: transparent;
  border-color: #F9A602;
  color: #F9A602; /* was #818cf8 */
}

/* Line ~335 */
@media (hover: hover) {
  .cta--outline:hover {
    background: rgba(249,166,2,0.08);
    border-color: #DAA520; /* was #818cf8 */
  }
}
```

**Fix for P-05 and P-06 (off-palette gray):**
```css
.feature {
  color: #8a7e6a; /* was #a1a1aa */
}

.faq-a {
  color: #8a7e6a; /* was #a1a1aa */
}
```

---

## Priority-Ranked Fix List

### 🔴 P0 — Broken (fix immediately)

| # | ID | Component | Issue |
|---|---|---|---|
| 1 | P0-01 | settings, wizard, auth, plans | **White text on gold buttons** — 1.45:1 contrast ratio. Change `color: #fff` → `color: #0d0b07` on all `.btn-primary` / `.submit-btn` / `.start-btn` / `.cta--solid` |
| 2 | S-02 / P0-02 | settings | **Toggle switches not keyboard accessible** — add `role="switch"`, `tabindex="0"`, `aria-checked`, keyboard handlers |
| 3 | A-02 / P0-03 | auth | **PW toggle `tabindex="-1"`** — keyboard users can't toggle password visibility. Change to `tabindex="0"` |

### 🟡 P1 — Should Fix

| # | ID | Component | Issue |
|---|---|---|---|
| 4 | P-02/03/04 | plans | **Off-palette purple `#818cf8`** on badge and outline CTA — change to `#F9A602` |
| 5 | P-05/06 | plans | **Off-palette gray `#a1a1aa`** on features and FAQ — change to `#8a7e6a` |
| 6 | W-03/04/05 | wizard | **Emoji icons** for steps, OAuth providers, preferences — replace with SVGs |
| 7 | L-01/02/03 | landing | **Emoji icons** for features, steps, BYOK CTA — replace with SVGs |
| 8 | S-04 | settings | **Dialog missing `role="dialog"`, `aria-modal`, focus trap** |
| 9 | W-06 | wizard | **Auth tabs lack proper ARIA** tablist/tab/tabpanel pattern |
| 10 | W-07 | wizard | **Global `document.addEventListener('keydown')`** — scope to component |
| 11 | S-03 | settings | **Back button 36×36px** — below 44px touch target minimum |
| 12 | A-03 | auth vs settings | **Inconsistent input heights** — 52px (auth) vs 42px (settings) |
| 13 | S-06 | settings | **Select missing label** — add `aria-label` to language select |
| 14 | L-04 | landing | **No mobile hamburger menu** — nav links disappear on small screens |
| 15 | L-05 / P-07 | landing + plans | **Duplicate PLANS data** — extract to shared module |
| 16 | W-08 | wizard | **Step indicators missing `aria-label`** for screen readers |

### 🟢 P2 — Nice to Have

| # | ID | Component | Issue |
|---|---|---|---|
| 17 | L-06 | landing | Base font-size 15px vs design system 14px |
| 18 | A-06 | auth vs settings | Floating labels (auth) vs block labels (settings) — adopt one pattern |
| 19 | A-05 | auth | Forgot password link dispatches no event |
| 20 | L-07/08 | landing | Feature/plan cards lack `cursor: pointer` despite hover effects |
| 21 | A-07 | auth | Email input could use `inputmode="email"` for better mobile keyboards |
| 22 | W-09 | wizard | No glassmorphism/mesh background (unlike settings/auth) |
| 23 | S-08 | settings | Delete error borrows pw-msg area — fragile |
| 24 | P-08 | plans | No glassmorphism on cards (opaque surface) |

---

## Design System Compliance Matrix

| Token | Expected | settings | wizard | auth | landing | plans |
|---|---|---|---|---|---|---|
| `--bg` | `#0d0b07` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `--surface` | `#1a1610` | ✅ (rgba) | ✅ (solid) | ✅ (rgba) | ✅ (rgba) | ✅ (solid) |
| `--accent` | `#F9A602` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `--text` | `#f0ead6` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `--muted` | `#8a7e6a` | ✅ | ✅ | ✅ | ✅ | ⚠️ `#a1a1aa` |
| Font | Geist, 14px | ✅ | ✅ | ✅ | ⚠️ 15px | ✅ |
| Border-radius | 8px | ✅ | ✅ | ✅ | ✅ | ✅ |
| Glassmorphism | backdrop-filter | ✅ | ❌ | ✅ | ✅ (nav) | ❌ |
| Mesh bg | animated gradient | ✅ | ❌ | ✅ | ✅ (hero) | ❌ |
| Reduced motion | `prefers-reduced-motion` | ✅ | ✅ | ✅ | ✅ | ✅ |
| SVG icons | No emoji | ✅ | ❌ emoji | ✅ | ❌ emoji | ✅ |
| Btn text on gold | Dark (`#0d0b07`) | ❌ white | ❌ white | ❌ white | ✅ dark | ❌ white |

---

## Summary of Top 5 Fixes (Highest Impact)

1. **Fix button contrast everywhere** — Change `color: #fff` to `color: #0d0b07` on all gold buttons. This is a WCAG violation affecting 4 of 5 components. ~15 minutes of work.

2. **Add keyboard accessibility to toggle switches** (sc-settings) — Add `role="switch"`, `tabindex`, `aria-checked`, and keydown handlers. ~20 minutes.

3. **Fix pw-toggle tabindex** (sc-auth) — Single attribute change from `-1` to `0`. 30 seconds.

4. **Replace off-palette colors** (sc-plans) — Change `#818cf8` → `#F9A602` and `#a1a1aa` → `#8a7e6a`. ~5 minutes.

5. **Replace emoji icons with SVGs** (sc-wizard, sc-landing) — Create a shared icon set. ~1 hour.

---

*End of review. All line numbers are approximate and may shift with edits.*
