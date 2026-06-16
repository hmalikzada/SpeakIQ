# ClauseGuard Logo + Hero Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `◈` Unicode glyph with an animated SVG Shield Scan logo, and add an illustrative animated hero banner to the top of the dashboard view.

**Architecture:** Two self-contained HTML+CSS changes with no JS. Task 1 swaps the brand mark in `index.html` and updates `style.css` brand-mark rules. Task 2 adds the `.dashboard-hero` block to `index.html` and its CSS to `style.css`. Both tasks are independent and commit separately.

**Tech Stack:** Vanilla HTML5, CSS3 (animations, SVG inline), no build step.

---

## File Map

| File | Changes |
|---|---|
| `contract-leakage-recovery/public/index.html` | Task 1: replace `◈` ×2 with SVG; Task 2: add `.dashboard-hero` block |
| `contract-leakage-recovery/public/style.css` | Task 1: update brand-mark CSS + add `@keyframes logoScan`; Task 2: add all hero banner CSS |

---

## Task 1: Shield Scan SVG Logo

**Files:**
- Modify: `contract-leakage-recovery/public/index.html` (lines 16, 51)
- Modify: `contract-leakage-recovery/public/style.css` (lines 109–112, 277–280)

---

- [ ] **Step 1: Replace `◈` in `.auth-brand` (index.html line 16)**

Current line 16:
```html
    <div class="auth-brand"><span class="brand-mark">◈</span> ClauseGuard</div>
```

Replace with (28×28 SVG, animated scan line):
```html
    <div class="auth-brand">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" class="brand-mark-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 4L8 11V26C8 35 15.5 42.5 24 45C32.5 42.5 40 35 40 26V11L24 4Z" fill="#16a34a" fill-opacity="0.18" stroke="#22c55e" stroke-width="1.5"/>
        <line x1="16" y1="20" x2="32" y2="20" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="16" y1="24" x2="32" y2="24" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="16" y1="28" x2="26" y2="28" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>
        <line x1="16" y1="32" x2="30" y2="32" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
        <line class="logo-scan" x1="14" y1="17" x2="34" y2="17" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      ClauseGuard
    </div>
```

---

- [ ] **Step 2: Replace `◈` in `.sidebar-brand` (index.html line 51)**

Current line 51:
```html
      <div class="sidebar-brand"><span class="brand-mark">◈</span> ClauseGuard</div>
```

Replace with (20×20 SVG, static — no `.logo-scan` class):
```html
      <div class="sidebar-brand">
        <svg width="20" height="20" viewBox="0 0 48 48" fill="none" class="brand-mark-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 4L8 11V26C8 35 15.5 42.5 24 45C32.5 42.5 40 35 40 26V11L24 4Z" fill="#16a34a" fill-opacity="0.18" stroke="#22c55e" stroke-width="1.5"/>
          <line x1="16" y1="20" x2="32" y2="20" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="16" y1="24" x2="26" y2="24" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>
          <line x1="16" y1="28" x2="28" y2="28" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        ClauseGuard
      </div>
```

---

- [ ] **Step 3: Update `.auth-brand .brand-mark` CSS rule (style.css lines 109–112)**

Current (lines 109–112):
```css
.auth-brand .brand-mark {
  color: var(--green);
  text-shadow: var(--brand-glow);
}
```

Replace with SVG-based rules (the SVG handles its own color; `.brand-mark` selector no longer matches anything):
```css
.brand-mark-svg {
  flex-shrink: 0;
  vertical-align: middle;
  display: inline-block;
}

.auth-brand .brand-mark-svg {
  filter: drop-shadow(0 0 8px rgba(34,197,94,0.6));
}
```

Also update `.auth-brand` itself to flex so the SVG and text align cleanly. Find `.auth-brand {` in style.css and add `display: flex; align-items: center; gap: 8px;`:

```css
.auth-brand {
  font-family: var(--display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 32px;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

---

- [ ] **Step 4: Update `.sidebar-brand .brand-mark` CSS rule (style.css lines 277–280)**

Current (lines 277–280):
```css
.sidebar-brand .brand-mark {
  color: var(--green);
  text-shadow: var(--brand-glow);
}
```

Replace with nothing — the sidebar SVG is static and uses inline `stroke="#22c55e"`. Delete these 3 lines entirely.

Also update `.sidebar-brand` to flex. Find `.sidebar-brand {` and add `display: flex; align-items: center; gap: 8px;`:

```css
.sidebar-brand {
  font-family: var(--display);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}
```

---

- [ ] **Step 5: Add `@keyframes logoScan` animation to style.css**

Find the `@keyframes auroraDrift` block in style.css (around line 78). After it, add:

```css
@keyframes logoScan {
  0%   { transform: translateY(0);    opacity: 0; }
  10%  { opacity: 1; }
  85%  { transform: translateY(22px); opacity: 1; }
  95%  { transform: translateY(24px); opacity: 0; }
  100% { transform: translateY(0);    opacity: 0; }
}

.logo-scan {
  animation: logoScan 3s ease-in-out infinite;
}
```

---

- [ ] **Step 6: Visually verify the logo**

Open `contract-leakage-recovery/public/index.html` directly in a browser (or via the Railway URL if deployed).

Check:
- Auth screen: Shield SVG appears left of "ClauseGuard" text, green scan line sweeps top-to-bottom on loop, green glow around the SVG
- Sidebar (logged in): 20px shield appears left of "ClauseGuard", static green highlighted line visible, no animation
- No `◈` character appears anywhere on the page

---

- [ ] **Step 7: Commit Task 1**

```bash
git add contract-leakage-recovery/public/index.html \
        contract-leakage-recovery/public/style.css
git commit -m "feat: replace ◈ with animated SVG Shield Scan logo"
```

---

## Task 2: Dashboard Hero Banner

**Files:**
- Modify: `contract-leakage-recovery/public/index.html` (line 71 — insert before `.page-header`)
- Modify: `contract-leakage-recovery/public/style.css` (append hero banner section)

---

- [ ] **Step 1: Add `.dashboard-hero` HTML to `#view-dashboard` (index.html)**

Find this block (starts at line 70):
```html
      <!-- Dashboard view -->
      <div id="view-dashboard" class="view">
        <div class="page-header">
```

Insert the hero block **between** `<div id="view-dashboard" class="view">` and `<div class="page-header">`:

```html
      <!-- Dashboard view -->
      <div id="view-dashboard" class="view">

        <div class="dashboard-hero">
          <div class="hero-illustration">
            <div class="hero-doc hero-doc--back"></div>
            <div class="hero-doc hero-doc--mid"></div>
            <div class="hero-doc hero-doc--front">
              <div class="hero-scan-line"></div>
              <div class="hero-doc-lines">
                <div class="hero-line"></div>
                <div class="hero-line hero-line--highlight"></div>
                <div class="hero-line"></div>
                <div class="hero-line hero-line--danger"></div>
                <div class="hero-line hero-line--short"></div>
              </div>
            </div>
            <div class="hero-magnifier" aria-hidden="true">🔍</div>
          </div>
          <div class="hero-body">
            <h2 class="hero-title">Scan any vendor contract in minutes</h2>
            <p class="hero-sub">AI reads every clause, cross-references every invoice, and surfaces exactly where you're being overcharged.</p>
            <div class="hero-stats">
              <div class="hero-stat">
                <span class="hero-stat-val">$2.4M</span>
                <span class="hero-stat-label">Recovered for clients</span>
              </div>
              <div class="hero-stat">
                <span class="hero-stat-val hero-stat-val--danger">18%</span>
                <span class="hero-stat-label">Avg overcharge rate</span>
              </div>
              <div class="hero-stat">
                <span class="hero-stat-val">340+</span>
                <span class="hero-stat-label">Audits completed</span>
              </div>
            </div>
          </div>
          <div class="hero-actions">
            <button type="button" class="btn primary" onclick="showView('new-audit')">+ New audit</button>
          </div>
        </div>

        <div class="page-header">
```

---

- [ ] **Step 2: Add hero banner CSS to style.css**

Append the following block at the end of `contract-leakage-recovery/public/style.css`:

```css
/* ══════════════════════════════════════════════════════════
   Dashboard Hero Banner
   ══════════════════════════════════════════════════════════ */

.dashboard-hero {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 28px 32px;
  background: linear-gradient(135deg, #0d1f0d 0%, #0a0a0a 60%);
  border-bottom: 1px solid var(--border);
  position: relative;
  overflow: hidden;
}

.dashboard-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(55% 80% at 5% 50%, rgba(22,163,74,0.18), transparent 60%),
    radial-gradient(35% 55% at 85% 20%, rgba(34,197,94,0.08), transparent 60%);
  pointer-events: none;
}

/* ── Document illustration ──────────────────────────────── */

.hero-illustration {
  position: relative;
  width: 120px;
  height: 100px;
  flex-shrink: 0;
  z-index: 1;
}

.hero-doc {
  position: absolute;
  border-radius: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  overflow: hidden;
}

.hero-doc--back {
  width: 90px;
  height: 80px;
  top: 16px;
  left: 20px;
  transform: rotate(6deg);
  opacity: 0.4;
}

.hero-doc--mid {
  width: 95px;
  height: 84px;
  top: 8px;
  left: 10px;
  transform: rotate(-3deg);
  opacity: 0.65;
}

.hero-doc--front {
  width: 100px;
  height: 90px;
  top: 0;
  left: 0;
  /* position: absolute inherited from .hero-doc — establishes containing block for .hero-scan-line */
}

.hero-scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent);
  filter: blur(1px);
  animation: heroScan 3s ease-in-out infinite;
}

@keyframes heroScan {
  0%   { top: 0;    opacity: 0; }
  8%   { opacity: 1; }
  88%  { top: 100%; opacity: 1; }
  96%  { opacity: 0; }
  100% { top: 0;    opacity: 0; }
}

.hero-doc-lines {
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-line {
  height: 5px;
  border-radius: 3px;
  background: var(--faint);
  width: 85%;
}

.hero-line:nth-child(2) { width: 70%; }
.hero-line--short       { width: 55%; }

.hero-line--highlight {
  background: rgba(34,197,94,0.55);
  animation: heroPulse 2s ease-in-out infinite;
}

.hero-line--danger {
  background: rgba(251,113,133,0.6);
  animation: heroPulse 2s ease-in-out infinite 0.7s;
}

@keyframes heroPulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}

.hero-magnifier {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 32px;
  height: 32px;
  background: var(--green-action);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  z-index: 2;
  box-shadow: 0 0 16px rgba(34,197,94,0.5);
  animation: heroMagGlow 2.5s ease-in-out infinite;
}

@keyframes heroMagGlow {
  0%, 100% { box-shadow: 0 0 16px rgba(34,197,94,0.5); }
  50%      { box-shadow: 0 0 28px rgba(34,197,94,0.85); }
}

/* ── Hero body ───────────────────────────────────────────── */

.hero-body {
  flex: 1;
  position: relative;
  z-index: 1;
}

.hero-title {
  font-family: var(--display);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
  line-height: 1.3;
}

.hero-sub {
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.5;
  margin-bottom: 16px;
  max-width: 400px;
}

.hero-stats {
  display: flex;
  gap: 24px;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hero-stat-val {
  font-family: var(--display);
  font-size: 20px;
  font-weight: 700;
  color: var(--green);
  text-shadow: 0 0 16px rgba(34,197,94,0.45);
  line-height: 1;
}

.hero-stat-val--danger {
  color: var(--danger);
  text-shadow: var(--danger-glow);
}

.hero-stat-label {
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── Hero actions ────────────────────────────────────────── */

.hero-actions {
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
```

---

- [ ] **Step 3: Visually verify the hero banner**

Open the app (log in or use dev server). Navigate to Dashboard.

Check:
- Banner appears at the very top of the dashboard, above the page header
- Dark green-tinted background with subtle radial glow on the left
- Three stacked document cards visible on the left; front card has a green scan line sweeping top-to-bottom
- Pulsing green line and pulsing red line visible inside the front doc
- Green glowing magnifier circle in the bottom-right of the doc stack
- Headline: "Scan any vendor contract in minutes"
- Three stat values visible: "$2.4M" (green glow), "18%" (danger red glow), "340+"
- "+ New audit" button on the right; clicking it navigates to the New Audit view
- Existing page header (with dashboard welcome and existing CTA button) still appears below the banner

---

- [ ] **Step 4: Commit Task 2**

```bash
git add contract-leakage-recovery/public/index.html \
        contract-leakage-recovery/public/style.css
git commit -m "feat: add animated dashboard hero banner with document illustration"
```

---

- [ ] **Step 5: Push to remote**

```bash
git push origin main:claude/prompt-usage-puhjfi
```
