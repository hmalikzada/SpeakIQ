# ClauseGuard — Shield Scan Logo + Dashboard Hero Banner

**Date:** 2026-06-16
**Scope:** `contract-leakage-recovery/public/index.html` + `contract-leakage-recovery/public/style.css`
**No backend or JS changes required.**

---

## Overview

Two additions to the existing dark aurora UI:

1. **Shield Scan Logo** — SVG mark replaces the `◈` Unicode glyph in both brand locations (sidebar + auth screen). Animated scan line at auth screen size; static at sidebar size.
2. **Dashboard Hero Banner** — Full-width illustrative banner at the top of the Dashboard view. Three-column layout: animated document illustration | headline + stats | CTA.

---

## Logo — Shield Scan

### SVG Specification

Angular shield path with horizontal document lines inside and a green scan line that sweeps top-to-bottom on loop (auth size only).

```svg
<!-- Full SVG at 48×48 viewBox -->
<svg width="{SIZE}" height="{SIZE}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Shield body -->
  <path d="M24 4L8 11V26C8 35 15.5 42.5 24 45C32.5 42.5 40 35 40 26V11L24 4Z"
        fill="#16a34a" fill-opacity="0.18" stroke="#22c55e" stroke-width="1.5"/>
  <!-- Document lines (decorative) -->
  <line x1="16" y1="20" x2="32" y2="20" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="16" y1="24" x2="32" y2="24" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="16" y1="28" x2="26" y2="28" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>
  <line x1="16" y1="32" x2="30" y2="32" stroke="#4b5563" stroke-width="1.2" stroke-linecap="round"/>
  <!-- Scan line (animated at auth size; static highlight at sidebar size) -->
  <line class="logo-scan" x1="14" y1="17" x2="34" y2="17"
        stroke="#22c55e" stroke-width="1.8" stroke-linecap="round"/>
</svg>
```

### Sizes and Placement

| Location | Size | Animation | Glow |
|---|---|---|---|
| `.sidebar-brand` | 20×20 | None — static highlight line on line y=24 only | None (performance) |
| `.auth-brand` | 28×28 | `logo-scan` sweep animation | `filter: drop-shadow(0 0 8px rgba(34,197,94,0.6))` |

### Scan Line Animation

```css
.logo-scan {
  animation: logoScan 3s ease-in-out infinite;
}

@keyframes logoScan {
  0%   { transform: translateY(0);    opacity: 0; }
  10%  { opacity: 1; }
  85%  { transform: translateY(22px); opacity: 1; }
  95%  { transform: translateY(24px); opacity: 0; }
  100% { transform: translateY(0);    opacity: 0; }
}
```

The scan line starts at `y1="17"` (near the top of the shield interior) and translateY(22px) moves it to approximately y=39, which remains within the shield's lower boundary (~y=45). No clipPath needed.

### HTML Changes

**In `.auth-brand`** — replace `<span class="brand-mark">◈</span>` with the 28×28 SVG (with `class="brand-mark-svg"` and `aria-hidden="true"`).

**In `.sidebar-brand`** — replace `<span class="brand-mark">◈</span>` with the 20×20 SVG (no animation, static).

The `ClauseGuard` text node stays in place after the SVG in both locations.

### CSS Changes for Brand Marks

Remove or repurpose `.brand-mark` text-shadow rule (the SVG uses `filter: drop-shadow` instead). Add:

```css
.brand-mark-svg {
  flex-shrink: 0;
  display: inline-block;
  vertical-align: middle;
}

.auth-brand .brand-mark-svg {
  filter: drop-shadow(0 0 8px rgba(34,197,94,0.6));
}
```

---

## Dashboard Hero Banner

### Placement

First child of `#view-dashboard`, **before** the existing `.page-header` div.

### HTML Structure

```html
<div class="dashboard-hero">
  <!-- Left: document illustration -->
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

  <!-- Center: text + stats -->
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

  <!-- Right: CTA -->
  <div class="hero-actions">
    <button type="button" class="btn primary" onclick="showView('new-audit')">+ New audit</button>
  </div>
</div>
```

### CSS Specification

```css
/* ── Dashboard Hero Banner ──────────────────────────────── */
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
  width: 90px; height: 80px;
  top: 16px; left: 20px;
  transform: rotate(6deg);
  opacity: 0.4;
}

.hero-doc--mid {
  width: 95px; height: 84px;
  top: 8px; left: 10px;
  transform: rotate(-3deg);
  opacity: 0.65;
}

.hero-doc--front {
  width: 100px; height: 90px;
  top: 0; left: 0;
  position: relative; /* scan line needs relative parent */
}

.hero-scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent);
  filter: blur(1px);
  animation: heroScan 3s ease-in-out infinite;
}

@keyframes heroScan {
  0%   { top: 0;   opacity: 0; }
  8%   { opacity: 1; }
  88%  { top: 100%; opacity: 1; }
  96%  { opacity: 0; }
  100% { top: 0;   opacity: 0; }
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
.hero-line--short      { width: 55%; }

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
  50%       { opacity: 1; }
}

.hero-magnifier {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 32px; height: 32px;
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
  50%       { box-shadow: 0 0 28px rgba(34,197,94,0.85); }
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

## Animation Summary

| Animation | Element | Duration | Notes |
|---|---|---|---|
| `logoScan` | `.logo-scan` in auth SVG | 3s infinite | translateY(0→22px) within shield |
| `heroScan` | `.hero-scan-line` | 3s infinite | top: 0→100% within front doc |
| `heroPulse` | `.hero-line--highlight`, `.hero-line--danger` | 2s infinite | opacity pulse |
| `heroMagGlow` | `.hero-magnifier` | 2.5s infinite | box-shadow pulse |

---

## Files Changed

| File | Change |
|---|---|
| `contract-leakage-recovery/public/index.html` | Replace `◈` × 2 with SVG logo; add `.dashboard-hero` to `#view-dashboard` |
| `contract-leakage-recovery/public/style.css` | Add hero banner styles + logo SVG CSS; update brand-mark rules |

`app.js` is **not changed**.

---

## Out of Scope

- Favicon / `<link rel="icon">` update — separate task
- Mobile responsive adjustments to hero banner — follow-up sprint
- Animated logo at sidebar size — intentionally excluded (performance)
