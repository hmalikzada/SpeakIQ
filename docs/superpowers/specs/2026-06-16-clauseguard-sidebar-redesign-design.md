# ClauseGuard Sidebar-Dashboard Redesign

**Date:** 2026-06-16
**Scope:** Frontend only — `public/index.html`, `public/style.css`, `public/app.js`
**No backend changes required.**

---

## Overview

Restructure ClauseGuard's UI from a single-column scrolling layout into a professional sidebar-dashboard layout. Style: brushed silver sidebar, off-white main content panel, forest green accents. Inspired by triage/tracker dashboard patterns — sidebar navigation on the left, content panel on the right.

---

## Color System

| Token | Value | Usage |
|---|---|---|
| `--silver` | `#E2E2E2` | Sidebar background |
| `--main-bg` | `#F7F7F7` | Main content background |
| `--card-bg` | `#FFFFFF` | Card surfaces |
| `--green` | `#16a34a` | Primary actions, active nav, accents |
| `--green-hover` | `#15803d` | Button/link hover |
| `--green-tint` | `#dcfce7` | Active nav background tint |
| `--text-primary` | `#111827` | Headings |
| `--text-body` | `#374151` | Body text |
| `--text-muted` | `#6B7280` | Labels, hints |
| `--danger` | `#dc2626` | Overcharge amounts, critical findings |
| `--border` | `#D1D5DB` | Card borders, dividers |

---

## Typography

No changes. Keep existing fonts already loaded:
- **Space Grotesk** (500/600/700) — headings, brand
- **Inter** (400/500/600/700) — body, labels, UI text

---

## Layout Structure

```
┌──────────────────┬────────────────────────────────────┐
│   Sidebar        │         Main Content               │
│   240px fixed    │         flex-grow                  │
│                  │                                    │
│  ◈ ClauseGuard  │  [page title + top action]         │
│                  │                                    │
│  ○ Dashboard     │  [content panel — one of:          │
│  ○ New Audit     │   Dashboard / New Audit /          │
│  ○ History       │   Results / History / Billing]     │
│  ○ Billing       │                                    │
│                  │                                    │
│  ─────────────  │                                    │
│  user@email.com  │                                    │
│  [Sign out]      │                                    │
└──────────────────┴────────────────────────────────────┘
```

- Sidebar is fixed-position, full viewport height, silver background.
- Main content area is scrollable, off-white background.
- Active nav item: forest green left border (3px) + `--green-tint` background.
- **Logged-out state:** No sidebar. Centered auth card on a silver/white gradient background.

---

## Views

### Logged-out (Auth)
- No sidebar rendered.
- Centered auth card (max-width 420px) with sign-in / create account tabs.
- Minimal hero text above card: brand mark + tagline.
- Background: soft silver-to-white gradient.

### Dashboard (default after login)
- Welcome banner: "Welcome back, [name]" + "Run new audit" CTA button (forest green).
- Stats row (3 metric cards): Total audits run | Total annual $ recovered | Plan badge.
- Recent audits section heading + list/grid of audit cards:
  - Each card: vendor name, date, finding count badge, annual impact ($), "View" button.
  - Empty state: illustration + "No audits yet — run your first one" CTA.

### New Audit
- Page title: "New Audit".
- Guided/bulk mode toggle (tab strip).
- **Guided:** 3 step cards (contract, MOUs, invoices) stacked vertically — same logic as today, restyled.
- **Bulk:** Single large dropzone card.
- Primary CTA: "Run expert analysis" (forest green button).
- Status message + loading spinner render below the form.

### Results
- Renders in the main content panel after analysis completes (no separate scroll-to).
- Sections: Exec summary card → Metrics row (4 cards) → Findings list → Legal advisory accordion.
- "Download PDF report" button in the exec summary card header.
- "Run another audit" secondary link at top.

### History
- Full-width table or card list of all past audits.
- Columns/fields: Vendor, Date, Mode (single/bulk), Findings, Annual impact, Actions.
- Clicking a row expands or navigates to that audit's Results view in the main panel.
- Pagination if > 20 records.

### Billing
- Page title: "Plans & Billing".
- Current plan callout banner at top.
- 3 pricing cards (Free / Pro / Business) — forest green CTA on recommended/upgrade plan.
- Billing portal link if user has an active Stripe subscription.

---

## Component Patterns

### Sidebar Nav Item
```
[3px green left border if active] [label]  (no icons — text-only nav)
Active bg: --green-tint
Active text: --green
Inactive text: --text-body
Hover bg: #F0F0F0
```

### Cards
- White background, 1px `--border` border, `border-radius: 10px`, subtle box-shadow.
- Consistent padding: 20px.

### Primary Button
- Background: `--green`, text: white, `border-radius: 8px`.
- Hover: `--green-hover`.

### Ghost Button
- Background: transparent, border: 1px `--border`, text: `--text-body`.

### Metric Card
- Label in `--text-muted` (small caps or uppercase), value in large bold `--text-primary`.
- Danger variant: value in `--danger`.
- Accent variant: green-tinted background for "Our fee" metric.

### Finding Card
- White card with severity left-border (red = overcharge, amber = warning, blue = info).
- Shows: title, clause reference, $ impact, recommendation.

### Status Badge / Pill
- `border-radius: 9999px`, small padding.
- Green = clean, amber = warning, red = critical.

---

## Navigation State Management (JS)

- Add a `data-view` attribute to each nav item.
- JS `showView(name)` function hides all content panels and shows the target one.
- Active nav item tracked via `data-active` or CSS class swap.
- Current routing logic (history panel, pricing panel toggled by buttons) migrated to sidebar nav clicks.
- Results view triggered programmatically after analysis completes (same as today, just targets the new results panel).

---

## Responsive Behavior

- **≥ 900px:** Sidebar visible, main content fills remaining width.
- **< 900px:** Sidebar collapses to a top nav bar (hamburger or icon-only strip). Out of scope for this sprint — mobile polish can be a follow-up.

---

## Files Changed

| File | Change |
|---|---|
| `public/index.html` | Restructure into sidebar + main layout; add dashboard, results, history, billing view panels |
| `public/style.css` | Full CSS rewrite with new design tokens, sidebar, card system, nav states |
| `public/app.js` | Add `showView()` nav routing; wire sidebar nav clicks; keep all existing API/logic unchanged |

---

## Out of Scope

- Backend / API changes — none.
- Mobile responsive polish — follow-up sprint.
- New features — this is a visual restructure only.
- Changing fonts — keep Space Grotesk + Inter.
