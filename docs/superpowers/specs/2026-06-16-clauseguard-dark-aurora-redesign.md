# ClauseGuard — Matte Black + Green Aurora Redesign

**Date:** 2026-06-16
**Scope:** Frontend only — `contract-leakage-recovery/public/style.css`
**No backend, HTML, or JS changes required.**

---

## Overview

Replace the current silver/white dashboard theme with a matte black + forest green palette. Add a slow-drifting green aurora effect behind the main content area. Keep the sidebar-dashboard layout structure exactly as-is — this is a CSS-only change.

---

## Color System

| Token | Value | Usage |
|---|---|---|
| `--bg-deep` | `#0a0a0a` | Body background deepest layer |
| `--bg-sidebar` | `#111111` | Sidebar background |
| `--bg-main` | `#141414` | Main content area background |
| `--bg-card` | `#1a1a1a` | Card surfaces |
| `--bg-card-hover` | `#1f1f1f` | Card hover state |
| `--green` | `#22c55e` | Primary green — glows, active states, money values |
| `--green-action` | `#16a34a` | Button backgrounds (slightly darker for contrast) |
| `--green-hover` | `#15803d` | Button hover |
| `--green-tint` | `rgba(34,197,94,0.08)` | Active nav bg, subtle fills |
| `--green-border` | `rgba(34,197,94,0.20)` | Accent borders |
| `--green-glow-sm` | `0 0 16px rgba(34,197,94,0.30)` | Small glow (buttons, step numbers) |
| `--green-glow-md` | `0 0 28px rgba(34,197,94,0.18)` | Medium glow (cards on hover) |
| `--green-glow-lg` | `0 0 48px rgba(34,197,94,0.12)` | Large ambient glow (aurora) |
| `--text` | `#e5e7eb` | Primary text |
| `--text-dim` | `#9ca3af` | Secondary text, labels |
| `--text-faint` | `#4b5563` | Hints, placeholders |
| `--danger` | `#fb7185` | Overcharge amounts, critical findings |
| `--danger-glow` | `0 0 12px rgba(251,113,133,0.35)` | Danger value text-shadow |
| `--amber` | `#fbbf24` | Moderate findings, optional badges |
| `--border` | `rgba(255,255,255,0.07)` | Default card borders |
| `--border-strong` | `rgba(255,255,255,0.12)` | Stronger borders, dividers |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` | Subtle elevation |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.5)` | Card elevation |
| `--radius` | `10px` | Default border radius |
| `--radius-sm` | `8px` | Small radius |
| `--radius-lg` | `14px` | Large radius |

---

## Typography

No changes. Keep existing fonts:
- **Space Grotesk** (500/600/700) — headings, brand, metric values
- **Inter** (400/500/600/700) — body, labels, UI text

---

## Aurora Effect

A slow-drifting green radial gradient sits behind all content using `body::before`.

```css
body::before {
  content: "";
  position: fixed;
  inset: -20% -10% auto -10%;
  height: 90vh;
  background:
    radial-gradient(45% 55% at 18% 12%, rgba(22,163,74,0.28), transparent 60%),
    radial-gradient(40% 50% at 82% 8%, rgba(34,197,94,0.18), transparent 60%),
    radial-gradient(45% 60% at 60% 40%, rgba(16,185,129,0.12), transparent 65%);
  filter: blur(20px);
  z-index: 0;
  pointer-events: none;
  animation: auroraDrift 18s ease-in-out infinite alternate;
}

@keyframes auroraDrift {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(3%, 2%) scale(1.04); }
  66%  { transform: translate(-2%, 3%) scale(0.97); }
  100% { transform: translate(4%, -2%) scale(1.02); }
}
```

The sidebar, cards, and all interactive elements sit at `z-index: 1` or higher — the aurora never obscures content.

---

## Layout Structure

No structural changes. Keep the existing sidebar-dashboard layout:

```
┌──────────────────┬────────────────────────────────────┐
│  Sidebar         │  Main Content                      │
│  #111111         │  #141414 + aurora behind           │
│  240px fixed     │  flex-grow                         │
│                  │                                    │
│  ◈ ClauseGuard  │  [view panel]                      │
│  (green glow)    │                                    │
│  ─ Dashboard     │                                    │
│  ─ New Audit     │                                    │
│  ─ History       │                                    │
│  ─ Billing       │                                    │
│                  │                                    │
│  user@email.com  │                                    │
│  [Sign out]      │                                    │
└──────────────────┴────────────────────────────────────┘
```

Auth screen: No sidebar. Centered card on `#0a0a0a` background with subtle green aurora behind it.

---

## Component Patterns

### Sidebar
- Background: `--bg-sidebar` (`#111111`)
- Brand mark ◈: `--green` with `text-shadow: 0 0 14px rgba(34,197,94,0.5)`
- Nav item default: `--text-dim` color, transparent bg
- Nav item hover: `--bg-card` bg
- Nav item active: `--green` color, `--green-tint` bg, 3px left border `--green`, `text-shadow: 0 0 8px rgba(34,197,94,0.4)`
- Sidebar footer: `--border-strong` top border, sign-out button hover → danger red

### Cards
- Background: `--bg-card`
- Border: `1px solid var(--border)`
- Box-shadow at rest: `0 0 24px rgba(34,197,94,0.06)` (faint ambient green)
- Box-shadow on hover: `var(--green-glow-md)` — glow intensifies
- Border-radius: `var(--radius)`

### Primary Button
- Background: `--green-action`
- Box-shadow: `var(--green-glow-sm)`
- Hover: `--green-hover`, stronger glow

### Ghost Button
- Background: transparent
- Border: `1px solid var(--border-strong)`
- Hover: `--green-border` border, `--green-tint` bg

### Metric Values (money amounts)
- Green values (recoverable, fee): `color: var(--green)`, `text-shadow: 0 0 16px rgba(34,197,94,0.45)`
- Danger values (overcharge): `color: var(--danger)`, `text-shadow: var(--danger-glow)`

### Finding Cards
- Left border: 4px — critical = `--danger`, moderate = `--amber`, minor = `--green`
- White bg → replaced with `--bg-card`
- Title: `--text`
- Impact: `--danger` with glow

### Step Numbers (upload form)
- Background: `--green-action`
- Box-shadow: `var(--green-glow-sm)`

### Dropzones
- Background: `--bg-card`
- Dashed border: `--border-strong`
- Hover: `--green-border` border, `rgba(34,197,94,0.04)` bg tint

### Memo Card (exec summary)
- Background: `--bg-card`
- Left border: `4px solid var(--green)`

### Status Pills / Badges
- Default: `--bg-card` bg, `--border-strong` border
- Active/green: `--green-tint` bg, `--green-border` border, `--green` text
- Danger: `rgba(251,113,133,0.12)` bg, `rgba(251,113,133,0.3)` border

### Auth Card
- Background: `rgba(26,26,26,0.9)` — slightly translucent over aurora
- Border: `1px solid var(--border-strong)`
- Tab active: `--green-action` bg

### Loading Spinner
- Border: `--border-strong`
- Top color (spinning): `--green`

---

## Glow Hierarchy

| Element | Effect |
|---|---|
| Brand mark ◈ | `text-shadow: 0 0 14px rgba(34,197,94,0.5)` |
| Active nav item | `text-shadow: 0 0 8px rgba(34,197,94,0.4)` |
| Money values | `text-shadow: 0 0 16px rgba(34,197,94,0.45)` |
| Danger values | `text-shadow: 0 0 12px rgba(251,113,133,0.35)` |
| Primary button | `box-shadow: 0 4px 16px rgba(22,163,74,0.4)` |
| Cards (rest) | `box-shadow: 0 0 24px rgba(34,197,94,0.06)` |
| Cards (hover) | `box-shadow: 0 0 28px rgba(34,197,94,0.18)` |
| Step numbers | `box-shadow: 0 0 16px rgba(34,197,94,0.3)` |
| Aurora background | `filter: blur(20px)` radial gradients |

---

## Files Changed

| File | Change |
|---|---|
| `contract-leakage-recovery/public/style.css` | Full rewrite — dark matte palette, aurora animation, green glow system |

`index.html` and `app.js` are **not changed**.

---

## Out of Scope

- HTML structure changes — none
- JS logic changes — none
- Mobile responsive polish — follow-up sprint
- New features — visual change only
