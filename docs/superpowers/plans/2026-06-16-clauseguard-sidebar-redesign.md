# ClauseGuard Sidebar-Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure ClauseGuard's UI from a single-column dark-theme page into a silver + forest-green sidebar-dashboard layout with five named views: Dashboard, New Audit, Results, History, Billing.

**Architecture:** Frontend-only changes to three files. HTML gains a two-column shell (fixed sidebar + scrollable main) that is only visible when logged in; the auth screen stays centered. CSS is fully replaced with a light palette. JavaScript gains a `showView(name)` router and a `renderDashboard()` function; all existing API calls, dropzone logic, rendering, billing, and PDF logic are preserved without modification.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, no new dependencies.

---

## File Map

| File | Change |
|---|---|
| `contract-leakage-recovery/public/index.html` | Full structural rewrite — sidebar shell + 5 view panels |
| `contract-leakage-recovery/public/style.css` | Full rewrite — new design tokens, light palette, all components |
| `contract-leakage-recovery/public/app.js` | Targeted additions — `showView()`, `renderDashboard()`, updated `showApp()`/`showAuth()`, sidebar nav wiring |

---

### Task 1: Replace index.html

**Files:**
- Modify: `contract-leakage-recovery/public/index.html`

The HTML gets a new two-column shell. All existing element IDs that JS depends on are preserved. The old `.user-bar`, `.hero`, `.page` wrapper, `#history-panel`, and `#pricing-panel` are removed and replaced with sidebar nav + named view divs. A new `#view-results` wrapper contains the existing `#results` and `#bulk-results` sections.

- [ ] **Step 1: Replace the entire contents of index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClauseGuard — AI Vendor Contract Audit</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="style.css" />
</head>
<body class="logged-out">

  <!-- ── Auth screen (no sidebar) ──────────────────────────── -->
  <div id="auth-screen" class="auth-screen">
    <div class="auth-brand"><span class="brand-mark">◈</span> ClauseGuard</div>
    <div class="auth-intro">
      <h2>Find the money hiding in your vendor contracts</h2>
      <p>Sign in to run an audit, or create a free account to get started.</p>
    </div>
    <div class="auth-card">
      <div class="auth-tabs" role="tablist">
        <button type="button" class="auth-tab active" data-auth="login">Sign in</button>
        <button type="button" class="auth-tab" data-auth="register">Create account</button>
      </div>
      <form id="auth-form" class="auth-form">
        <label class="auth-label reg-only hidden" for="auth-name">Full name
          <input type="text" id="auth-name" autocomplete="name" disabled />
        </label>
        <label class="auth-label reg-only hidden" for="auth-company">Company
          <span class="opt-tag">optional</span>
          <input type="text" id="auth-company" autocomplete="organization" disabled />
        </label>
        <label class="auth-label" for="auth-email">Email
          <input type="email" id="auth-email" autocomplete="email" required />
        </label>
        <label class="auth-label" for="auth-password">Password
          <input type="password" id="auth-password" autocomplete="current-password" minlength="8" required />
        </label>
        <button type="submit" id="auth-submit" class="btn primary">Sign in</button>
        <p id="auth-error" class="auth-error" role="alert"></p>
      </form>
      <p class="auth-hint">The Free plan includes 5 audits per month. No card required.</p>
    </div>
  </div>

  <!-- ── App shell (sidebar + main — logged-in only) ─────── -->
  <div id="app-shell" class="app-shell hidden">

    <aside class="sidebar">
      <div class="sidebar-brand"><span class="brand-mark">◈</span> ClauseGuard</div>
      <nav class="sidebar-nav">
        <button type="button" class="nav-item" data-view="dashboard">Dashboard</button>
        <button type="button" class="nav-item" data-view="new-audit">New Audit</button>
        <button type="button" class="nav-item" data-view="history">History</button>
        <button type="button" class="nav-item" data-view="billing" id="billing-nav-item">Billing</button>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <span id="ub-email" class="ub-email"></span>
          <span id="ub-usage" class="ub-usage"></span>
        </div>
        <button type="button" id="logout-btn" class="sidebar-signout">Sign out</button>
      </div>
    </aside>

    <main class="main-content">

      <!-- Dashboard view -->
      <div id="view-dashboard" class="view">
        <div class="page-header">
          <div>
            <h1 id="dashboard-welcome">Dashboard</h1>
            <p class="page-sub" id="dashboard-sub"></p>
          </div>
          <button type="button" id="new-audit-cta" class="btn primary">+ New audit</button>
        </div>
        <div class="stats-row" id="stats-row"></div>
        <h2 class="section-heading">Recent audits</h2>
        <div id="recent-audits"></div>
      </div>

      <!-- New Audit view -->
      <div id="view-new-audit" class="view hidden">
        <div class="page-header">
          <h1>New Audit</h1>
          <div class="case-stamp"><span class="live-dot"></span> Powered by GPT-4o</div>
        </div>

        <div class="mode-toggle" role="tablist">
          <button type="button" class="mode-btn active" data-mode="guided">Guided upload</button>
          <button type="button" class="mode-btn" data-mode="bulk">Bulk upload</button>
        </div>

        <form id="analyze-form" class="workflow">
          <div class="steps">
            <section class="step">
              <div class="step-head">
                <span class="step-num">1</span>
                <div>
                  <h2>The contract</h2>
                  <p>The master agreement with this vendor. <span class="req">Required</span></p>
                </div>
              </div>
              <div class="dropzone" id="dz-contract" data-kind="contract">
                <input type="file" id="contract-file" accept=".pdf,.txt" hidden />
                <div class="dz-icon">📄</div>
                <div class="dz-label">Drop the contract here<br /><span>or tap to browse (PDF or .txt)</span></div>
              </div>
              <ul class="file-list" id="list-contract"></ul>
            </section>

            <section class="step">
              <div class="step-head">
                <span class="step-num">2</span>
                <div>
                  <h2>MOUs &amp; amendments</h2>
                  <p>Side letters, renewals, anything that changed the deal. <span class="opt">Optional</span></p>
                </div>
              </div>
              <div class="dropzone" id="dz-supporting" data-kind="supporting">
                <input type="file" id="supporting-files" accept=".pdf,.txt" multiple hidden />
                <div class="dz-icon">📎</div>
                <div class="dz-label">Drop supporting documents<br /><span>up to 10 files</span></div>
              </div>
              <ul class="file-list" id="list-supporting"></ul>
            </section>

            <section class="step">
              <div class="step-head">
                <span class="step-num">3</span>
                <div>
                  <h2>The invoices</h2>
                  <p>What this vendor actually billed you. <span class="req">Required</span></p>
                </div>
              </div>
              <div class="dropzone" id="dz-invoices" data-kind="invoices">
                <input type="file" id="invoice-files" accept=".pdf,.txt,.csv" multiple hidden />
                <div class="dz-icon">🧾</div>
                <div class="dz-label">Drop invoices here<br /><span>up to 10 (PDF, .txt, or .csv)</span></div>
              </div>
              <ul class="file-list" id="list-invoices"></ul>
            </section>
          </div>

          <div class="actions">
            <button type="submit" id="analyze-btn" class="btn primary">Run expert analysis</button>
            <button type="button" id="sample-btn" class="btn ghost">Try sample data</button>
          </div>
        </form>

        <div id="bulk-section" class="workflow hidden">
          <section class="step bulk-step">
            <div class="step-head">
              <div>
                <h2>Drop everything here</h2>
                <p>Contracts, amendments, and invoices for one or more vendors. We'll sort and pair them automatically.</p>
              </div>
            </div>
            <div class="dropzone" id="dz-bulk" data-kind="bulk">
              <input type="file" id="bulk-files" accept=".pdf,.txt,.csv" multiple hidden />
              <div class="dz-icon">📚</div>
              <div class="dz-label">Drop files here<br /><span>up to 30 files (PDF, .txt, or .csv)</span></div>
            </div>
            <ul class="file-list" id="list-bulk"></ul>
          </section>
          <div class="actions">
            <button type="button" id="bulk-analyze-btn" class="btn primary">Sort &amp; analyze</button>
          </div>
        </div>

        <p id="status-msg" class="status-msg" role="status"></p>
        <div id="loading" class="loading hidden">
          <div class="loading-spinner"></div>
          <p id="loading-step">Reading contract &amp; supporting documents…</p>
        </div>
      </div>

      <!-- Results view -->
      <div id="view-results" class="view hidden">
        <div class="page-header">
          <h1>Audit Results</h1>
          <button type="button" id="run-another-btn" class="btn ghost">← New audit</button>
        </div>

        <section id="results" class="results">
          <article class="memo">
            <div class="memo-head">
              <span class="memo-stamp">Audit memo</span>
              <h2>Executive summary</h2>
              <button type="button" id="download-pdf-btn" class="btn primary memo-download">Download PDF report</button>
            </div>
            <p id="exec-summary"></p>
          </article>

          <div class="summary-grid">
            <div class="metric">
              <div class="metric-label">Monthly leakage</div>
              <div class="metric-value" id="sum-monthly">$0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Annual recoverable</div>
              <div class="metric-value danger" id="sum-annual">$0</div>
            </div>
            <div class="metric accent">
              <div class="metric-label">Our fee (25% of recovery)</div>
              <div class="metric-value" id="sum-fee">$0</div>
            </div>
            <div class="metric">
              <div class="metric-label">Findings</div>
              <div class="metric-value" id="sum-count">0</div>
            </div>
          </div>

          <h2 class="findings-title">Detailed findings</h2>
          <div id="findings-list"></div>

          <section id="legal" class="legal hidden">
            <div class="legal-head">
              <span class="legal-icon">⚖</span>
              <div>
                <h2>Legal advisory</h2>
                <p>Where this relationship stands legally, and how to move forward.</p>
              </div>
              <span class="status-pill" id="legal-status"></span>
            </div>
            <p class="legal-status-expl" id="legal-status-expl"></p>
            <div class="legal-block">
              <h3>What governs the relationship now</h3>
              <p id="legal-governing"></p>
            </div>
            <div class="legal-cols">
              <div class="legal-block">
                <h3>Risks of continuing as-is</h3>
                <ul id="legal-risks" class="risk-list"></ul>
              </div>
              <div class="legal-block">
                <h3>Your leverage</h3>
                <ul id="legal-leverage" class="leverage-list"></ul>
              </div>
            </div>
            <div class="legal-block">
              <h3>Recommended path forward</h3>
              <ol id="legal-path" class="path-list"></ol>
            </div>
          </section>

          <p class="disclaimer">
            This analysis is AI-generated and for informational purposes only, not legal advice.
            Verify each finding against the source documents and consult licensed counsel before acting.
          </p>
        </section>

        <section id="bulk-results" class="results hidden"></section>
      </div>

      <!-- History view -->
      <div id="view-history" class="view hidden">
        <div class="page-header">
          <h1>Audit History</h1>
        </div>
        <ul id="history-list" class="history-list"></ul>
      </div>

      <!-- Billing view -->
      <div id="view-billing" class="view hidden">
        <div class="page-header">
          <h1>Plans &amp; Billing</h1>
        </div>
        <p id="billing-msg" class="billing-msg"></p>
        <div id="pricing-grid" class="pricing-grid"></div>
        <div id="pricing-actions" class="pricing-actions"></div>
      </div>

    </main>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify the file saved correctly**

Run: `wc -l contract-leakage-recovery/public/index.html`
Expected: ~185 lines (no error)

- [ ] **Step 3: Commit**

```bash
git add contract-leakage-recovery/public/index.html
git commit -m "restructure: sidebar-dashboard HTML shell with 5 named views"
```

---

### Task 2: Replace style.css

**Files:**
- Modify: `contract-leakage-recovery/public/style.css`

Full replacement. Dark aurora theme → light silver/green palette. New sidebar, nav, dashboard stats, and audit card styles added. All existing component class names (`.step`, `.dropzone`, `.finding`, `.memo`, `.legal`, `.history-item`, `.plan-card`, `.vendor-card`, etc.) are preserved; only their color values and backgrounds change.

- [ ] **Step 1: Replace the entire contents of style.css**

```css
/* ═══════════════════════════════════════════════════════════
   ClauseGuard — Silver & Forest Green Dashboard
   ═══════════════════════════════════════════════════════════ */

:root {
  --sidebar-width: 240px;

  --silver:        #E2E2E2;
  --silver-hover:  #D5D5D5;
  --main-bg:       #F7F7F7;
  --card-bg:       #FFFFFF;

  --green:         #16a34a;
  --green-hover:   #15803d;
  --green-tint:    #dcfce7;
  --green-border:  #86efac;

  --text-primary:  #111827;
  --text-body:     #374151;
  --text-muted:    #6B7280;
  --text-faint:    #9CA3AF;

  --danger:        #dc2626;
  --danger-tint:   #fee2e2;
  --amber:         #d97706;
  --amber-tint:    #fef3c7;
  --border:        #D1D5DB;
  --border-strong: #9CA3AF;

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-lg: 0 10px 30px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.07);

  --radius:    10px;
  --radius-sm: 8px;
  --radius-lg: 14px;

  --display: "Space Grotesk", "Inter", system-ui, sans-serif;
  --sans:    "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html { height: 100%; }

body {
  margin: 0;
  font-family: var(--sans);
  color: var(--text-body);
  line-height: 1.6;
  background: var(--main-bg);
  -webkit-font-smoothing: antialiased;
  height: 100%;
}

/* ── Utility ─────────────────────────────────────────────── */
.hidden { display: none !important; }

/* ── Auth screen ─────────────────────────────────────────── */
.auth-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background: linear-gradient(160deg, #E8E8E8 0%, #F5F5F5 50%, #FFFFFF 100%);
}

.auth-brand {
  font-family: var(--display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 32px;
  letter-spacing: -0.01em;
}

.auth-brand .brand-mark { color: var(--green); }

.auth-intro {
  text-align: center;
  max-width: 420px;
  margin-bottom: 28px;
}

.auth-intro h2 {
  font-family: var(--display);
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0 0 10px;
  color: var(--text-primary);
}

.auth-intro p {
  margin: 0;
  font-size: 14.5px;
  color: var(--text-muted);
}

.auth-card {
  width: 100%;
  max-width: 430px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px 34px 26px;
  box-shadow: var(--shadow-lg);
}

.auth-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  padding: 4px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.auth-tab {
  flex: 1;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 999px;
  padding: 10px 8px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.auth-tab.active {
  background: var(--green);
  color: #fff;
  box-shadow: 0 4px 12px rgba(22,163,74,0.35);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.auth-label input {
  font-family: var(--sans);
  font-size: 15px;
  color: var(--text-primary);
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 11px 14px;
  text-transform: none;
  letter-spacing: normal;
  transition: border-color 0.18s, box-shadow 0.18s;
}

.auth-label input:focus {
  outline: none;
  border-color: var(--green);
  box-shadow: 0 0 0 3px rgba(22,163,74,0.15);
}

.auth-form .btn.primary {
  margin-top: 4px;
  align-self: stretch;
  text-align: center;
}

.auth-error {
  min-height: 18px;
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}

.auth-hint {
  margin: 16px 0 0;
  font-size: 12.5px;
  color: var(--text-faint);
  text-align: center;
}

.opt-tag {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--amber);
  background: var(--amber-tint);
  border-radius: 999px;
  padding: 2px 7px;
  margin-left: 6px;
}

/* ── App shell ───────────────────────────────────────────── */
.app-shell {
  display: flex;
  min-height: 100vh;
}

/* ── Sidebar ─────────────────────────────────────────────── */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--silver);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.sidebar-brand {
  font-family: var(--display);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border);
}

.sidebar-brand .brand-mark { color: var(--green); }

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 2px;
}

.nav-item {
  display: block;
  width: 100%;
  text-align: left;
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-body);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  position: relative;
}

.nav-item:hover {
  background: var(--silver-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--green-tint);
  color: var(--green);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--green);
  border-radius: 0 2px 2px 0;
}

.sidebar-footer {
  padding: 16px 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-user {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ub-email {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ub-usage {
  font-size: 11.5px;
  color: var(--text-muted);
}

.sidebar-signout {
  font-family: var(--sans);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 7px 12px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  align-self: flex-start;
}

.sidebar-signout:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-tint);
}

/* ── Main content ────────────────────────────────────────── */
.main-content {
  margin-left: var(--sidebar-width);
  flex: 1;
  min-height: 100vh;
  background: var(--main-bg);
  overflow-y: auto;
}

/* ── View panels ─────────────────────────────────────────── */
.view {
  padding: 32px 36px 48px;
  max-width: 960px;
}

/* ── Page header ─────────────────────────────────────────── */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.page-header h1 {
  font-family: var(--display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-primary);
}

.page-sub {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-muted);
}

.section-heading {
  font-family: var(--display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 28px 0 14px;
  letter-spacing: -0.01em;
}

.case-stamp {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 7px 14px;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(22,163,74,0.5); }
  70%  { box-shadow: 0 0 0 7px rgba(22,163,74,0); }
  100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
}

/* ── Dashboard stats ─────────────────────────────────────── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 4px;
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.stat-card .stat-label {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  margin-bottom: 8px;
}

.stat-card .stat-value {
  font-family: var(--display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.stat-card.green-accent .stat-value { color: var(--green); }

/* ── Dashboard audit cards ───────────────────────────────── */
.audit-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.audit-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  text-align: left;
  width: 100%;
  font-family: var(--sans);
}

.audit-card:hover {
  border-color: var(--green-border);
  box-shadow: var(--shadow-md);
  transform: translateX(2px);
}

.audit-card-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.audit-card-vendor {
  font-family: var(--display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audit-card-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.audit-card-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.audit-card-impact {
  font-family: var(--display);
  font-size: 15px;
  font-weight: 700;
  color: var(--green);
  white-space: nowrap;
}

.audit-card-findings {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--main-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 10px;
}

/* ── Empty state ─────────────────────────────────────────── */
.empty-state {
  text-align: center;
  color: var(--text-muted);
  background: var(--card-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 44px 32px;
  font-size: 14px;
}

.empty-state p { margin: 8px 0 20px; }

/* ── Buttons ─────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  padding: 11px 22px;
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  text-decoration: none;
}

.btn.primary {
  background: var(--green);
  color: #fff;
  box-shadow: 0 2px 8px rgba(22,163,74,0.30);
}

.btn.primary:hover:not(:disabled) {
  background: var(--green-hover);
  box-shadow: 0 4px 14px rgba(22,163,74,0.40);
  transform: translateY(-1px);
}

.btn.primary:active:not(:disabled) { transform: none; }

.btn.ghost {
  background: var(--card-bg);
  color: var(--text-body);
  border: 1px solid var(--border);
}

.btn.ghost:hover:not(:disabled) {
  border-color: var(--green-border);
  color: var(--green);
  background: var(--green-tint);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* ── Mode toggle ─────────────────────────────────────────── */
.mode-toggle {
  display: inline-flex;
  gap: 4px;
  margin: 0 0 22px;
  padding: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.mode-btn {
  border: none;
  background: transparent;
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 8px 20px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.mode-btn.active {
  background: var(--green);
  color: #fff;
  box-shadow: 0 2px 8px rgba(22,163,74,0.30);
}

/* ── Workflow / steps ────────────────────────────────────── */
.workflow { margin-top: 4px; }

.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 860px) { .steps { grid-template-columns: 1fr; } }

.step {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.step:hover {
  border-color: var(--green-border);
  box-shadow: var(--shadow-md);
}

.step-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.step-num {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: #fff;
  font-family: var(--display);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(22,163,74,0.35);
}

.step-head h2 {
  font-family: var(--display);
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.step-head p {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.req, .opt {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 2px 7px;
  border-radius: 999px;
  margin-left: 2px;
}

.req { color: var(--danger); background: var(--danger-tint); }
.opt { color: var(--amber);  background: var(--amber-tint); }

/* ── Dropzone ────────────────────────────────────────────── */
.dropzone {
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  background: var(--main-bg);
  transition: all 0.18s ease;
}

.dropzone:hover,
.dropzone.dragover {
  border-color: var(--green);
  background: var(--green-tint);
}

.dz-icon { font-size: 26px; margin-bottom: 8px; }

.dz-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-body);
}

.dz-label span {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── File list ───────────────────────────────────────────── */
.file-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  color: var(--text-body);
  font-size: 12.5px;
  border-radius: var(--radius-sm);
  padding: 7px 12px;
}

.file-list .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.file-list button {
  flex: none;
  border: none;
  background: none;
  color: var(--danger);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

/* ── Bulk ────────────────────────────────────────────────── */
.bulk-step .dropzone { padding: 44px 16px; }

.bulk-notice {
  background: var(--amber-tint);
  color: var(--amber);
  border: 1px solid #fcd34d;
  border-radius: var(--radius-sm);
  padding: 13px 18px;
  font-size: 13.5px;
  margin-bottom: 16px;
}

/* ── Actions ─────────────────────────────────────────────── */
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 22px;
}

/* ── Status / loading ────────────────────────────────────── */
.status-msg {
  min-height: 20px;
  font-size: 14px;
  color: var(--text-muted);
  margin: 12px 0 0;
}

.status-msg.error { color: var(--danger); font-weight: 500; }

.loading {
  margin: 40px 0;
  text-align: center;
  color: var(--text-muted);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  animation: spin 0.85s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@keyframes riseIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Results ─────────────────────────────────────────────── */
.results { padding-bottom: 20px; }

.results:not(.hidden) .memo,
.results:not(.hidden) .summary-grid,
.results:not(.hidden) .findings-title,
.results:not(.hidden) #findings-list,
.results:not(.hidden) .legal {
  animation: riseIn 0.5s cubic-bezier(0.22,1,0.36,1) both;
}

.results:not(.hidden) .summary-grid  { animation-delay: 0.07s; }
.results:not(.hidden) .findings-title { animation-delay: 0.12s; }
.results:not(.hidden) #findings-list  { animation-delay: 0.16s; }
.results:not(.hidden) .legal          { animation-delay: 0.22s; }

/* ── Memo ────────────────────────────────────────────────── */
.memo {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-left: 4px solid var(--green);
  border-radius: var(--radius);
  padding: 24px 28px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
}

.memo-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.memo-stamp {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--green);
  background: var(--green-tint);
  border-radius: 999px;
  padding: 4px 11px;
}

.memo-download { margin-left: auto; padding: 8px 18px; font-size: 13px; }

.memo h2 {
  font-family: var(--display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-primary);
}

.memo p { font-size: 15.5px; line-height: 1.7; margin: 0; color: var(--text-body); }

/* ── Summary metrics grid ────────────────────────────────── */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 28px;
}

@media (max-width: 760px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } }

.metric {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s, border-color 0.2s;
}

.metric:hover { transform: translateY(-2px); border-color: var(--green-border); }

.metric.accent { background: var(--green); border-color: var(--green-hover); }
.metric.accent .metric-label,
.metric.accent .metric-value { color: #fff; }

.metric-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  margin-bottom: 7px;
}

.metric-value {
  font-family: var(--display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.metric-value.danger { color: var(--danger); }

/* ── Findings ────────────────────────────────────────────── */
.findings-title {
  font-family: var(--display);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 14px;
  color: var(--text-primary);
}

#findings-list { display: flex; flex-direction: column; gap: 12px; }

.finding {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-left: 4px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 20px 22px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s;
}

.finding:hover { transform: translateX(2px); }
.finding.critical { border-left-color: var(--danger); }
.finding.moderate { border-left-color: var(--amber); }
.finding.minor    { border-left-color: var(--green); }

.finding-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}

.finding-title {
  font-family: var(--display);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--text-primary);
}

.finding-impact {
  font-family: var(--display);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--danger);
  white-space: nowrap;
}

.badges { display: flex; gap: 7px; margin-top: 9px; flex-wrap: wrap; }

.badge {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.badge.sev-critical { color: var(--danger); background: var(--danger-tint); border-color: #fca5a5; }
.badge.sev-moderate { color: var(--amber);  background: var(--amber-tint);  border-color: #fcd34d; }
.badge.sev-minor    { color: var(--green);  background: var(--green-tint);  border-color: var(--green-border); }

.finding-desc { margin: 11px 0 0; color: var(--text-body); font-size: 14px; }

.evidence {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

@media (max-width: 640px) { .evidence { grid-template-columns: 1fr; } }

.evidence > div {
  background: var(--main-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-body);
}

.evidence .label,
.action-row .label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  margin-bottom: 4px;
}

.action-row {
  margin-top: 12px;
  background: var(--green-tint);
  border: 1px solid var(--green-border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 13.5px;
  color: #166534;
}

.action-row .label { color: var(--green); }

/* ── Legal advisory ──────────────────────────────────────── */
.legal {
  margin-top: 24px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 26px 28px;
  box-shadow: var(--shadow-sm);
}

.legal-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.legal-icon { font-size: 26px; line-height: 1.2; }

.legal-head h2 {
  font-family: var(--display);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-primary);
}

.legal-head p { margin: 3px 0 0; font-size: 13px; color: var(--text-muted); }

.status-pill {
  margin-left: auto;
  align-self: center;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 5px 13px;
  border-radius: 999px;
  background: var(--main-bg);
  border: 1px solid var(--border);
  color: var(--text-muted);
  white-space: nowrap;
}

.status-pill.st-expired_holdover,
.status-pill.st-expiring_soon { color: var(--danger); background: var(--danger-tint); border-color: #fca5a5; }
.status-pill.st-active         { color: var(--green);  background: var(--green-tint);  border-color: var(--green-border); }
.status-pill.st-auto_renewed   { color: var(--amber);  background: var(--amber-tint);  border-color: #fcd34d; }

.legal-status-expl { font-size: 15px; line-height: 1.65; margin: 0 0 16px; color: var(--text-body); }

.legal-block { margin-top: 18px; }

.legal-block h3 {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-faint);
  margin: 0 0 8px;
}

.legal-block p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--text-body); }

.legal-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

@media (max-width: 700px) { .legal-cols { grid-template-columns: 1fr; } }

.risk-list,
.leverage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13.5px;
  color: var(--text-body);
}

.risk-list li { display: flex; align-items: baseline; gap: 8px; }

.risk-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
  transform: translateY(-1px);
}

.risk-dot.high   { background: var(--danger); }
.risk-dot.medium { background: var(--amber); }
.risk-dot.low    { background: var(--green); }

.leverage-list li::before { content: "→ "; color: var(--green); font-weight: 700; }

.path-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-body);
}

.path-list strong { color: var(--text-primary); }

.disclaimer {
  margin-top: 24px;
  font-size: 12px;
  color: var(--text-faint);
  text-align: center;
  line-height: 1.6;
}

/* ── History list ────────────────────────────────────────── */
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 18px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.18s;
}

.history-item:hover {
  border-color: var(--green-border);
  box-shadow: var(--shadow-md);
  transform: translateX(2px);
}

.history-item > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.history-vendor { font-family: var(--display); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.history-meta   { font-size: 11.5px; color: var(--text-muted); }

.history-impact {
  flex: none;
  font-family: var(--display);
  font-size: 16px;
  font-weight: 700;
  color: var(--green);
  white-space: nowrap;
}

.history-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px; }

/* ── Billing / plans ─────────────────────────────────────── */
.billing-msg {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-body);
  background: var(--green-tint);
  border: 1px solid var(--green-border);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
}

.billing-msg:empty { display: none; }

.billing-msg.error {
  color: var(--danger);
  background: var(--danger-tint);
  border-color: #fca5a5;
}

.pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }

@media (max-width: 760px) { .pricing-grid { grid-template-columns: 1fr; } }

.plan-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
}

.plan-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

.plan-card.current {
  border-color: var(--green);
  box-shadow: 0 0 0 1px var(--green), var(--shadow-sm);
}

.plan-name  { font-family: var(--display); font-size: 17px; font-weight: 600; color: var(--text-primary); }

.plan-price {
  font-family: var(--display);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.plan-price span { font-size: 13px; font-weight: 500; color: var(--text-muted); }
.plan-blurb { font-size: 13px; color: var(--text-muted); }

.plan-features {
  list-style: none;
  margin: 6px 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13.5px;
  color: var(--text-body);
  flex: 1;
}

.plan-features li::before { content: "✓ "; color: var(--green); font-weight: 700; }
.plan-action { margin-top: auto; }

.plan-action .btn {
  width: 100%;
  text-align: center;
  padding: 11px 16px;
  font-size: 13.5px;
}

.plan-current-tag {
  display: block;
  text-align: center;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--green);
  background: var(--green-tint);
  border-radius: var(--radius-sm);
  padding: 10px;
}

.pricing-actions { margin-top: 20px; display: flex; justify-content: center; }

/* ── Vendor cards (bulk results) ─────────────────────────── */
.vendor-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.vendor-card:hover { border-color: var(--green-border); }

.vendor-card-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--sans);
}

.vendor-card-title h3 {
  font-family: var(--display);
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.vendor-card-files { margin: 3px 0 0; font-size: 12px; color: var(--text-muted); }
.vendor-card-head .badge { flex: none; margin-left: auto; }
.vendor-card-arrow { flex: none; color: var(--text-muted); font-size: 12px; }

.vendor-card-body {
  padding: 20px 22px 24px;
  border-top: 1px solid var(--border);
}

.vendor-card-reason { color: var(--text-muted); font-size: 13.5px; margin: 0; }
```

- [ ] **Step 2: Verify the file saved correctly**

Run: `wc -l contract-leakage-recovery/public/style.css`
Expected: ~600-650 lines (no error)

- [ ] **Step 3: Commit**

```bash
git add contract-leakage-recovery/public/style.css
git commit -m "style: full rewrite — silver/forest-green dashboard palette"
```

---

### Task 3: Update app.js — element references and view routing

**Files:**
- Modify: `contract-leakage-recovery/public/app.js`

Replace the top block of element references (lines 1–47) and add `showView()`, updated `showApp()`, updated `showAuth()`, and sidebar nav wiring. All existing functions from line 49 onward are **untouched** except where noted in Tasks 4 and 5.

- [ ] **Step 1: Replace the element-reference block at the top of app.js (lines 1–47)**

The existing block references `app-main`, `user-bar`, `history-btn`, `history-panel`, `history-close`, `plans-btn`, `pricing-panel`, `pricing-close` — all of which no longer exist in the new HTML. Replace with:

```javascript
const form = document.getElementById('analyze-form');
const analyzeBtn = document.getElementById('analyze-btn');
const sampleBtn = document.getElementById('sample-btn');
const statusMsg = document.getElementById('status-msg');
const loading = document.getElementById('loading');
const loadingStep = document.getElementById('loading-step');
const results = document.getElementById('results');
const findingsList = document.getElementById('findings-list');
const downloadBtn = document.getElementById('download-pdf-btn');

const modeButtons = document.querySelectorAll('.mode-btn');
const bulkSection = document.getElementById('bulk-section');
const bulkAnalyzeBtn = document.getElementById('bulk-analyze-btn');
const bulkResults = document.getElementById('bulk-results');

// Auth elements
const appShell = document.getElementById('app-shell');
const authScreen = document.getElementById('auth-screen');
const authForm = document.getElementById('auth-form');
const authName = document.getElementById('auth-name');
const authCompany = document.getElementById('auth-company');
const regOnlyFields = document.querySelectorAll('.reg-only');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const authTabs = document.querySelectorAll('.auth-tab');
const ubEmail = document.getElementById('ub-email');
const ubUsage = document.getElementById('ub-usage');
const logoutBtn = document.getElementById('logout-btn');

// Sidebar nav
const navItems = document.querySelectorAll('.nav-item');
const newAuditCta = document.getElementById('new-audit-cta');
const runAnotherBtn = document.getElementById('run-another-btn');
const billingNavItem = document.getElementById('billing-nav-item');

// Dashboard
const statsRow = document.getElementById('stats-row');
const recentAudits = document.getElementById('recent-audits');
const dashboardWelcome = document.getElementById('dashboard-welcome');
const dashboardSub = document.getElementById('dashboard-sub');

// History / billing (IDs unchanged — same elements, now inside view panels)
const historyList = document.getElementById('history-list');
const pricingGrid = document.getElementById('pricing-grid');
const pricingActions = document.getElementById('pricing-actions');
const billingMsg = document.getElementById('billing-msg');

let lastAnalysis = null;
let authMode = 'login';
let currentPlan = 'free';
let billingEnabled = false;
let cachedUser = null;
let cachedUsage = null;
```

- [ ] **Step 2: Add `showView()` function after the variable declarations block**

Insert this function immediately after the variable declarations (before the `fmtUsd` definition):

```javascript
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.remove('hidden');
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === name));
  if (name === 'history') loadHistory();
  if (name === 'billing') openPlans();
  if (name === 'dashboard') renderDashboard();
}
```

- [ ] **Step 3: Wire sidebar nav items and CTA buttons**

Insert these event listeners right after the `showView` function:

```javascript
navItems.forEach((item) => {
  item.addEventListener('click', () => showView(item.dataset.view));
});

newAuditCta.addEventListener('click', () => showView('new-audit'));
runAnotherBtn.addEventListener('click', () => showView('new-audit'));
```

- [ ] **Step 4: Replace the `showApp` function**

Find the existing `showApp` function (around line 765 in the original file) and replace it entirely:

```javascript
function showApp(user, usage) {
  cachedUser = user;
  cachedUsage = usage;
  document.body.classList.remove('logged-out');
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  ubEmail.textContent = user.name ? `${user.name} · ${user.email}` : user.email;
  if (usage) {
    setUsage(usage);
    currentPlan = usage.plan;
  }
  billingNavItem.classList.toggle('hidden', !billingEnabled);
  showView('dashboard');
}
```

- [ ] **Step 5: Replace the `showAuth` function**

Find the existing `showAuth` function and replace it entirely:

```javascript
function showAuth() {
  document.body.classList.add('logged-out');
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  results.classList.add('hidden');
  bulkResults.classList.add('hidden');
}
```

- [ ] **Step 6: Remove the old panel event listeners**

Find and delete these four lines (they reference elements that no longer exist):

```javascript
historyBtn.addEventListener('click', loadHistory);
historyClose.addEventListener('click', () => historyPanel.classList.add('hidden'));
plansBtn.addEventListener('click', openPlans);
pricingClose.addEventListener('click', () => pricingPanel.classList.add('hidden'));
```

- [ ] **Step 7: Commit**

```bash
git add contract-leakage-recovery/public/app.js
git commit -m "feat(js): add showView() router, update showApp/showAuth, wire sidebar nav"
```

---

### Task 4: Update app.js — analysis flow and panel functions

**Files:**
- Modify: `contract-leakage-recovery/public/app.js`

After analysis completes, navigate to the results view instead of scrolling. Update `loadHistory()` and `openPlans()` to not reference the old panel show/scroll logic. Update `viewAudit()` to use `showView('results')`.

- [ ] **Step 1: Update `runAnalysis` to switch to results view**

Find this line inside `runAnalysis` (the success path after `renderResults(data)`):

```javascript
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

Replace it with:

```javascript
    showView('results');
```

- [ ] **Step 2: Update `runBulkAnalysis` to switch to results view**

Find this line inside `runBulkAnalysis`:

```javascript
    bulkResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

Replace it with:

```javascript
    showView('results');
```

- [ ] **Step 3: Replace `loadHistory` function**

Find the existing `loadHistory` function and replace it entirely (removes the panel show/scroll logic, panel is now always visible as a view):

```javascript
async function loadHistory() {
  historyList.innerHTML = '<li class="history-empty">Loading…</li>';
  try {
    const res = await fetch('/api/audits');
    if (res.status === 401) {
      showAuth();
      return;
    }
    const { audits = [] } = await res.json();
    renderHistory(audits);
  } catch {
    historyList.innerHTML = '<li class="history-empty">Could not load history.</li>';
  }
}
```

- [ ] **Step 4: Replace `openPlans` function**

Find the existing `openPlans` function and replace it entirely:

```javascript
async function openPlans() {
  billingMsg.textContent = '';
  pricingGrid.innerHTML = '<p class="history-empty">Loading…</p>';
  pricingActions.innerHTML = '';
  try {
    const res = await fetch('/api/plans');
    const { plans = [] } = await res.json();
    renderPlans(plans);
  } catch {
    pricingGrid.innerHTML = '<p class="history-empty">Could not load plans.</p>';
  }
}
```

- [ ] **Step 5: Update `viewAudit` to use `showView('results')`**

Find the existing `viewAudit` function and replace it entirely:

```javascript
async function viewAudit(id) {
  try {
    const res = await fetch(`/api/audits/${id}`);
    if (res.status === 401) {
      showAuth();
      return;
    }
    if (!res.ok) throw new Error('Could not load that audit.');
    const audit = await res.json();
    showView('results');
    if (audit.mode === 'bulk') {
      results.classList.add('hidden');
      renderBulkResults(audit.result);
    } else {
      bulkResults.classList.add('hidden');
      renderResults(audit.result);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add contract-leakage-recovery/public/app.js
git commit -m "feat(js): navigate to results view after analysis; remove panel scroll logic"
```

---

### Task 5: Add `renderDashboard` and `loadDashboardData` to app.js

**Files:**
- Modify: `contract-leakage-recovery/public/app.js`

Add the two dashboard functions. Insert them after the `setUsage` function definition.

- [ ] **Step 1: Add `renderDashboard` and `loadDashboardData` after `setUsage`**

Find the `setUsage` function:

```javascript
function setUsage(usage) {
  const limit = usage.limit == null ? '∞' : usage.limit;
  ubUsage.textContent = `${usage.used} / ${limit} audits · ${usage.planLabel}`;
}
```

Insert these two functions immediately after it:

```javascript
function renderDashboard() {
  if (!cachedUser) return;
  const name = cachedUser.name ? cachedUser.name.split(' ')[0] : 'there';
  dashboardWelcome.textContent = `Welcome back, ${name}`;
  if (cachedUsage) {
    const limit = cachedUsage.limit == null ? '∞' : cachedUsage.limit;
    dashboardSub.textContent = `${cachedUsage.used} of ${limit} audits used · ${cachedUsage.planLabel} plan`;
  }
  loadDashboardData();
}

async function loadDashboardData() {
  statsRow.innerHTML = '';
  recentAudits.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';

  try {
    const res = await fetch('/api/audits');
    if (res.status === 401) {
      showAuth();
      return;
    }
    const { audits = [] } = await res.json();

    const totalAnnual = audits.reduce((sum, a) => sum + (a.annualImpact || 0), 0);
    const planLabel = cachedUsage?.planLabel || 'Free';

    statsRow.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Audits</div>
        <div class="stat-value">${audits.length}</div>
      </div>
      <div class="stat-card green-accent">
        <div class="stat-label">Total Recoverable</div>
        <div class="stat-value">${fmtUsd(totalAnnual)}/yr</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current Plan</div>
        <div class="stat-value" style="font-size:20px">${planLabel}</div>
      </div>
    `;

    if (audits.length === 0) {
      recentAudits.innerHTML = `
        <div class="empty-state">
          <p>No audits yet — run your first one.</p>
          <button type="button" class="btn primary" onclick="showView('new-audit')">+ New audit</button>
        </div>
      `;
      return;
    }

    const container = document.createElement('div');
    container.className = 'audit-cards';
    for (const a of audits.slice(0, 8)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'audit-card';
      const date = new Date(a.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      const mode = a.mode === 'bulk' ? 'Bulk' : 'Single';
      card.innerHTML = `
        <div class="audit-card-main">
          <span class="audit-card-vendor">${escapeHtml(a.vendor || 'Untitled audit')}</span>
          <span class="audit-card-meta">${date} · ${mode} · ${a.findingCount} finding${a.findingCount === 1 ? '' : 's'}</span>
        </div>
        <div class="audit-card-right">
          <span class="audit-card-impact">${fmtUsd(a.annualImpact)}/yr</span>
          <span class="audit-card-findings">${a.findingCount} finding${a.findingCount === 1 ? '' : 's'}</span>
        </div>
      `;
      card.addEventListener('click', () => viewAudit(a.id));
      container.appendChild(card);
    }
    recentAudits.innerHTML = '';
    recentAudits.appendChild(container);
  } catch {
    recentAudits.innerHTML = '<div class="empty-state"><p>Could not load audits.</p></div>';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add contract-leakage-recovery/public/app.js
git commit -m "feat(js): add renderDashboard and loadDashboardData"
```

---

### Task 6: Verify visually and push

**Files:** none

- [ ] **Step 1: Open the app in the browser**

The deployed URL is `https://speakiq-production.up.railway.app`. After Railway redeploys (triggered by the git push), load the URL.

Expected logged-out state:
- Silver-to-white gradient background
- Centered "◈ ClauseGuard" brand mark in green
- Auth card with green Sign In / Create Account tabs
- No sidebar visible

- [ ] **Step 2: Sign in and verify the dashboard**

Expected logged-in state:
- Left sidebar visible: silver background, green "◈ ClauseGuard" brand, nav items (Dashboard / New Audit / History / Billing), user email + usage at bottom
- "Dashboard" nav item is active (green left border + green tint background)
- Main content: "Welcome back, [name]" heading + sub text, 3 stats cards, recent audits list (or empty state with green CTA)

- [ ] **Step 3: Verify navigation**

- Click "New Audit" in sidebar → upload form appears with green step numbers, mode toggle, dropzones
- Click "History" → history list loads
- Click "Billing" → plan cards load (Pro card has green CTA button)
- Click "Dashboard" → returns to dashboard

- [ ] **Step 4: Run a sample audit**

On the New Audit view, click "Try sample data". Expected:
- Loading spinner appears (green spinning border)
- After completion, app navigates to Results view automatically
- Results view shows memo card (green left border), metrics row, findings list
- "← New audit" button in page header returns to New Audit view

- [ ] **Step 5: Push to remote**

```bash
git push -u origin claude/prompt-usage-puhjfi
```

Expected: push succeeds, Railway triggers a new deployment.
