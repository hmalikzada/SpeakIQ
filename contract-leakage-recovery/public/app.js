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

// Auth + history elements
const appMain = document.getElementById('app-main');
const authScreen = document.getElementById('auth-screen');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const authTabs = document.querySelectorAll('.auth-tab');
const userBar = document.getElementById('user-bar');
const ubEmail = document.getElementById('ub-email');
const ubUsage = document.getElementById('ub-usage');
const historyBtn = document.getElementById('history-btn');
const logoutBtn = document.getElementById('logout-btn');
const historyPanel = document.getElementById('history-panel');
const historyClose = document.getElementById('history-close');
const historyList = document.getElementById('history-list');

let lastAnalysis = null;
let authMode = 'login';

const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

/* ── Dropzones ──────────────────────────────────────────────── */
// kind -> { files, input, listEl, multiple, max }
const zones = {
  contract: { files: [], input: document.getElementById('contract-file'), listEl: document.getElementById('list-contract'), multiple: false, max: 1 },
  supporting: { files: [], input: document.getElementById('supporting-files'), listEl: document.getElementById('list-supporting'), multiple: true, max: 10 },
  invoices: { files: [], input: document.getElementById('invoice-files'), listEl: document.getElementById('list-invoices'), multiple: true, max: 10 },
  bulk: { files: [], input: document.getElementById('bulk-files'), listEl: document.getElementById('list-bulk'), multiple: true, max: 30 },
};

for (const [kind, zone] of Object.entries(zones)) {
  const dz = document.getElementById(`dz-${kind}`);

  dz.addEventListener('click', () => zone.input.click());
  zone.input.addEventListener('change', () => {
    addFiles(kind, zone.input.files);
    zone.input.value = '';
  });

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('dragover');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    addFiles(kind, e.dataTransfer.files);
  });
}

function addFiles(kind, fileList) {
  const zone = zones[kind];
  for (const file of fileList) {
    if (!zone.multiple) zone.files = [];
    if (zone.files.length >= zone.max) {
      setStatus(`You can add at most ${zone.max} file${zone.max > 1 ? 's' : ''} there.`, true);
      break;
    }
    zone.files.push(file);
  }
  renderFileList(kind);
  setStatus('');
}

function renderFileList(kind) {
  const zone = zones[kind];
  zone.listEl.innerHTML = '';
  zone.files.forEach((file, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      zone.files.splice(i, 1);
      renderFileList(kind);
    });
    li.append(name, remove);
    zone.listEl.appendChild(li);
  });
}

/* ── Mode toggle ────────────────────────────────────────────── */
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    modeButtons.forEach((b) => b.classList.toggle('active', b === btn));

    const isBulk = btn.dataset.mode === 'bulk';
    form.classList.toggle('hidden', isBulk);
    bulkSection.classList.toggle('hidden', !isBulk);
    results.classList.add('hidden');
    bulkResults.classList.add('hidden');
    setStatus('');
  });
});

/* ── Analysis ───────────────────────────────────────────────── */
const LOADING_STEPS = [
  'Reading contract & supporting documents…',
  'Parsing invoice line items…',
  'Cross-referencing terms against billing…',
  'Writing the audit memo…',
];

const BULK_LOADING_STEPS = [
  'Reading every uploaded file…',
  'Sorting documents by vendor…',
  "Cross-referencing each vendor's contract against its invoices…",
  'Writing audit memos…',
];

let loadingTimer = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (zones.contract.files.length === 0 || zones.invoices.files.length === 0) {
    setStatus('Please add the contract (step 1) and at least one invoice (step 3).', true);
    return;
  }

  const formData = new FormData();
  formData.append('contract', zones.contract.files[0]);
  for (const f of zones.supporting.files) formData.append('supporting', f);
  for (const f of zones.invoices.files) formData.append('invoices', f);

  await runAnalysis('/api/analyze', { method: 'POST', body: formData });
});

sampleBtn.addEventListener('click', async () => {
  await runAnalysis('/api/analyze-sample', { method: 'POST' });
});

bulkAnalyzeBtn.addEventListener('click', async () => {
  if (zones.bulk.files.length < 2) {
    setStatus('Add at least one contract and one invoice file.', true);
    return;
  }

  const formData = new FormData();
  for (const f of zones.bulk.files) formData.append('files', f);

  await runBulkAnalysis(formData);
});

async function runAnalysis(url, options) {
  setBusy(true);
  setStatus('');
  results.classList.add('hidden');
  startLoading(LOADING_STEPS);

  try {
    const res = await fetch(url, options);
    const data = await res.json();

    if (res.status === 401) {
      showAuth();
      throw new Error('Your session expired. Please sign in again.');
    }
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    renderResults(data);
    if (data.usage) setUsage(data.usage);
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    stopLoading();
    setBusy(false);
  }
}

async function runBulkAnalysis(formData) {
  setBusy(true);
  setStatus('');
  bulkResults.classList.add('hidden');
  startLoading(BULK_LOADING_STEPS);

  try {
    const res = await fetch('/api/analyze-bulk', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.status === 401) {
      showAuth();
      throw new Error('Your session expired. Please sign in again.');
    }
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    renderBulkResults(data);
    if (data.usage) setUsage(data.usage);
    bulkResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    stopLoading();
    setBusy(false);
  }
}

function startLoading(steps) {
  let i = 0;
  loadingStep.textContent = steps[0];
  loading.classList.remove('hidden');
  loadingTimer = setInterval(() => {
    i = Math.min(i + 1, steps.length - 1);
    loadingStep.textContent = steps[i];
  }, 6000);
}

function stopLoading() {
  clearInterval(loadingTimer);
  loading.classList.add('hidden');
}

function setBusy(busy) {
  analyzeBtn.disabled = busy;
  sampleBtn.disabled = busy;
  bulkAnalyzeBtn.disabled = busy;
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.classList.toggle('error', isError);
}

/* ── Rendering ──────────────────────────────────────────────── */
downloadBtn.addEventListener('click', async () => {
  if (!lastAnalysis) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Generating…';

  try {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastAnalysis),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const vendor = (lastAnalysis.contract?.vendor || 'vendor').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `clauseguard-${vendor}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download PDF report';
  }
});

function renderResults(data) {
  lastAnalysis = data;
  const { findings, summary, executiveSummary, legal } = data;

  document.getElementById('exec-summary').textContent =
    executiveSummary || 'Analysis complete. See the detailed findings below.';
  document.getElementById('sum-monthly').textContent = fmtUsd(summary.totalMonthlyImpactUsd);
  document.getElementById('sum-annual').textContent = fmtUsd(summary.totalAnnualImpactUsd);
  document.getElementById('sum-fee').textContent = fmtUsd(summary.suggestedFeeUsd);
  document.getElementById('sum-count').textContent = summary.findingCount;

  findingsList.innerHTML = '';

  if (findings.length === 0) {
    findingsList.innerHTML =
      '<div class="empty-state">No discrepancies found. This contract and invoice set looks clean.</div>';
  } else {
    const order = { critical: 0, moderate: 1, minor: 2 };
    const sorted = [...findings].sort(
      (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    );
    for (const f of sorted) {
      findingsList.appendChild(renderFinding(f));
    }
  }

  renderLegal(legal);

  results.classList.remove('hidden');
}

const STATUS_LABELS = {
  active: 'Contract active',
  expired_holdover: 'Expired — billing continues',
  auto_renewed: 'Auto-renewed',
  expiring_soon: 'Expiring soon',
  unclear: 'Status unclear',
};

function renderLegal(legal) {
  const section = document.getElementById('legal');
  if (!legal) {
    section.classList.add('hidden');
    return;
  }

  const statusEl = document.getElementById('legal-status');
  const status = legal.contractStatus || 'unclear';
  statusEl.textContent = STATUS_LABELS[status] || STATUS_LABELS.unclear;
  statusEl.className = `status-pill st-${status}`;

  document.getElementById('legal-status-expl').textContent = legal.statusExplanation || '';
  document.getElementById('legal-governing').textContent = legal.governingAnalysis || '—';

  const risksEl = document.getElementById('legal-risks');
  risksEl.innerHTML = '';
  for (const r of legal.risks || []) {
    const li = document.createElement('li');
    const sev = ['high', 'medium', 'low'].includes(r.severity) ? r.severity : 'low';
    li.innerHTML = `<span class="risk-dot ${sev}"></span>`;
    li.append(document.createTextNode(r.risk || ''));
    risksEl.appendChild(li);
  }
  if (!risksEl.children.length) risksEl.innerHTML = '<li>None identified.</li>';

  const levEl = document.getElementById('legal-leverage');
  levEl.innerHTML = '';
  for (const point of legal.leveragePoints || []) {
    const li = document.createElement('li');
    li.textContent = point;
    levEl.appendChild(li);
  }
  if (!levEl.children.length) levEl.innerHTML = '<li>None identified.</li>';

  const pathEl = document.getElementById('legal-path');
  pathEl.innerHTML = '';
  const steps = [...(legal.recommendedPath || [])].sort(
    (a, b) => (a.step || 0) - (b.step || 0)
  );
  for (const s of steps) {
    const li = document.createElement('li');
    const action = document.createElement('strong');
    action.textContent = s.action || '';
    const detail = document.createElement('span');
    detail.textContent = s.detail ? ` — ${s.detail}` : '';
    li.append(action, detail);
    pathEl.appendChild(li);
  }

  section.classList.remove('hidden');
}

function renderFinding(f) {
  const severity = ['critical', 'moderate', 'minor'].includes(f.severity) ? f.severity : 'minor';
  const impact = (f.monthly_impact_usd || 0) > 0
    ? `${fmtUsd(f.monthly_impact_usd)}/mo`
    : fmtUsd(f.one_time_impact_usd);

  const el = document.createElement('div');
  el.className = `finding ${severity}`;
  el.innerHTML = `
    <div class="finding-top">
      <h3 class="finding-title">${escapeHtml(f.title || f.type || 'Finding')}</h3>
      <span class="finding-impact">${impact}</span>
    </div>
    <div class="badges">
      <span class="badge sev-${severity}">${severity}</span>
      <span class="badge">${escapeHtml((f.type || 'other').replaceAll('_', ' '))}</span>
      <span class="badge">${escapeHtml(f.confidence || 'low')} confidence</span>
    </div>
    <p class="finding-desc">${escapeHtml(f.description || '')}</p>
    <div class="evidence">
      <div>
        <div class="label">What the contract says</div>
        ${escapeHtml(f.contract_basis || '—')}
      </div>
      <div>
        <div class="label">What the invoice shows</div>
        ${escapeHtml(f.invoice_evidence || '—')}
      </div>
    </div>
    <div class="action-row">
      <div class="label">Recommended action</div>
      ${escapeHtml(f.recommended_action || '—')}
    </div>
  `;
  return el;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/* ── Bulk results ───────────────────────────────────────────── */
function renderBulkResults(data) {
  const { results: groups = [], unmatchedFiles = [] } = data;
  bulkResults.innerHTML = '';

  if (unmatchedFiles.length) {
    const notice = document.createElement('div');
    notice.className = 'bulk-notice';
    notice.textContent = `Couldn't confidently sort: ${unmatchedFiles.join(', ')}. These weren't included in any audit below.`;
    bulkResults.appendChild(notice);
  }

  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No vendor contracts and invoices could be matched up from the uploaded files.';
    bulkResults.appendChild(empty);
  } else {
    groups.forEach((group, i) => bulkResults.appendChild(buildVendorCard(group, i)));
  }

  bulkResults.classList.remove('hidden');
}

function buildVendorCard(group, index) {
  const card = document.createElement('article');
  card.className = 'vendor-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'vendor-card-head';

  const title = document.createElement('div');
  title.className = 'vendor-card-title';
  const h3 = document.createElement('h3');
  h3.textContent = group.vendor || `Vendor ${index + 1}`;
  const fileNames = [
    ...(group.files?.contracts || []),
    ...(group.files?.amendments || []),
    ...(group.files?.invoices || []),
  ];
  const fileSummary = document.createElement('p');
  fileSummary.className = 'vendor-card-files';
  fileSummary.textContent = fileNames.join(', ');
  title.append(h3, fileSummary);
  header.appendChild(title);

  const chip = document.createElement('span');
  if (group.incomplete) {
    chip.className = 'badge sev-moderate';
    chip.textContent = 'Incomplete';
  } else {
    chip.className = 'badge sev-critical';
    chip.textContent = `${fmtUsd(group.summary?.totalAnnualImpactUsd)}/yr at stake`;
  }
  header.appendChild(chip);

  const arrow = document.createElement('span');
  arrow.className = 'vendor-card-arrow';
  arrow.textContent = '▾';
  header.appendChild(arrow);

  const body = document.createElement('div');
  body.className = 'vendor-card-body';

  if (group.incomplete) {
    const p = document.createElement('p');
    p.className = 'vendor-card-reason';
    p.textContent = group.reason || 'Not enough documents to run a full audit for this vendor.';
    body.appendChild(p);
  } else {
    body.appendChild(buildMemo(group));
    body.appendChild(buildSummaryGrid(group.summary));
    body.appendChild(buildFindingsSection(group.findings));
    const legalEl = buildLegalSection(group.legal);
    if (legalEl) body.appendChild(legalEl);
  }

  header.addEventListener('click', () => {
    const collapsed = body.classList.toggle('hidden');
    arrow.textContent = collapsed ? '▸' : '▾';
  });

  card.append(header, body);
  return card;
}

function buildMemo(group) {
  const memo = document.createElement('article');
  memo.className = 'memo';

  const head = document.createElement('div');
  head.className = 'memo-head';

  const stamp = document.createElement('span');
  stamp.className = 'memo-stamp';
  stamp.textContent = 'Audit memo';

  const h2 = document.createElement('h2');
  h2.textContent = 'Executive summary';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'btn primary memo-download';
  download.textContent = 'Download PDF report';
  download.addEventListener('click', () => downloadGroupReport(group, download));

  head.append(stamp, h2, download);

  const p = document.createElement('p');
  p.textContent = group.executiveSummary || 'Analysis complete. See the detailed findings below.';

  memo.append(head, p);
  return memo;
}

function buildSummaryGrid(summary) {
  const grid = document.createElement('div');
  grid.className = 'summary-grid';

  const metrics = [
    ['Monthly leakage', fmtUsd(summary?.totalMonthlyImpactUsd), 'metric'],
    ['Annual recoverable', fmtUsd(summary?.totalAnnualImpactUsd), 'metric'],
    ['Our fee (25% of recovery)', fmtUsd(summary?.suggestedFeeUsd), 'metric accent'],
    ['Findings', String(summary?.findingCount ?? 0), 'metric'],
  ];
  const valueClasses = ['metric-value', 'metric-value danger', 'metric-value', 'metric-value'];

  metrics.forEach(([label, value, metricClass], i) => {
    const m = document.createElement('div');
    m.className = metricClass;
    const l = document.createElement('div');
    l.className = 'metric-label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = valueClasses[i];
    v.textContent = value;
    m.append(l, v);
    grid.appendChild(m);
  });

  return grid;
}

function buildFindingsSection(findings) {
  const wrap = document.createElement('div');

  const title = document.createElement('h2');
  title.className = 'findings-title';
  title.textContent = 'Detailed findings';
  wrap.appendChild(title);

  const list = document.createElement('div');
  if (!findings || findings.length === 0) {
    list.innerHTML =
      '<div class="empty-state">No discrepancies found. This contract and invoice set looks clean.</div>';
  } else {
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '14px';
    const order = { critical: 0, moderate: 1, minor: 2 };
    const sorted = [...findings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
    for (const f of sorted) list.appendChild(renderFinding(f));
  }
  wrap.appendChild(list);

  return wrap;
}

function buildLegalSection(legal) {
  if (!legal) return null;

  const section = document.createElement('section');
  section.className = 'legal';

  const head = document.createElement('div');
  head.className = 'legal-head';

  const icon = document.createElement('span');
  icon.className = 'legal-icon';
  icon.textContent = '⚖';

  const titleWrap = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = 'Legal advisory';
  const sub = document.createElement('p');
  sub.textContent = 'Where this relationship stands legally, and how to move forward.';
  titleWrap.append(h2, sub);

  const status = legal.contractStatus || 'unclear';
  const statusPill = document.createElement('span');
  statusPill.className = `status-pill st-${status}`;
  statusPill.textContent = STATUS_LABELS[status] || STATUS_LABELS.unclear;

  head.append(icon, titleWrap, statusPill);
  section.appendChild(head);

  const statusExpl = document.createElement('p');
  statusExpl.className = 'legal-status-expl';
  statusExpl.textContent = legal.statusExplanation || '';
  section.appendChild(statusExpl);

  const governingBlock = document.createElement('div');
  governingBlock.className = 'legal-block';
  const gh3 = document.createElement('h3');
  gh3.textContent = 'What governs the relationship now';
  const gp = document.createElement('p');
  gp.textContent = legal.governingAnalysis || '—';
  governingBlock.append(gh3, gp);
  section.appendChild(governingBlock);

  const cols = document.createElement('div');
  cols.className = 'legal-cols';

  const risksBlock = document.createElement('div');
  risksBlock.className = 'legal-block';
  const rh3 = document.createElement('h3');
  rh3.textContent = 'Risks of continuing as-is';
  const risksList = document.createElement('ul');
  risksList.className = 'risk-list';
  for (const r of legal.risks || []) {
    const li = document.createElement('li');
    const sev = ['high', 'medium', 'low'].includes(r.severity) ? r.severity : 'low';
    const dot = document.createElement('span');
    dot.className = `risk-dot ${sev}`;
    li.append(dot, document.createTextNode(r.risk || ''));
    risksList.appendChild(li);
  }
  if (!risksList.children.length) risksList.innerHTML = '<li>None identified.</li>';
  risksBlock.append(rh3, risksList);

  const leverageBlock = document.createElement('div');
  leverageBlock.className = 'legal-block';
  const lh3 = document.createElement('h3');
  lh3.textContent = 'Your leverage';
  const leverageList = document.createElement('ul');
  leverageList.className = 'leverage-list';
  for (const point of legal.leveragePoints || []) {
    const li = document.createElement('li');
    li.textContent = point;
    leverageList.appendChild(li);
  }
  if (!leverageList.children.length) leverageList.innerHTML = '<li>None identified.</li>';
  leverageBlock.append(lh3, leverageList);

  cols.append(risksBlock, leverageBlock);
  section.appendChild(cols);

  const pathBlock = document.createElement('div');
  pathBlock.className = 'legal-block';
  const ph3 = document.createElement('h3');
  ph3.textContent = 'Recommended path forward';
  const pathList = document.createElement('ol');
  pathList.className = 'path-list';
  const steps = [...(legal.recommendedPath || [])].sort((a, b) => (a.step || 0) - (b.step || 0));
  for (const s of steps) {
    const li = document.createElement('li');
    const action = document.createElement('strong');
    action.textContent = s.action || '';
    const detail = document.createElement('span');
    detail.textContent = s.detail ? ` — ${s.detail}` : '';
    li.append(action, detail);
    pathList.appendChild(li);
  }
  pathBlock.append(ph3, pathList);
  section.appendChild(pathBlock);

  return section;
}

async function downloadGroupReport(group, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Generating…';

  try {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(group),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const vendor = (group.contract?.vendor || group.vendor || 'vendor').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `clauseguard-${vendor}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ── Auth + session ─────────────────────────────────────────── */
function showApp(user, usage) {
  authScreen.classList.add('hidden');
  appMain.classList.remove('hidden');
  userBar.classList.remove('hidden');
  ubEmail.textContent = user.email;
  if (usage) setUsage(usage);
}

function showAuth() {
  appMain.classList.add('hidden');
  userBar.classList.add('hidden');
  authScreen.classList.remove('hidden');
  results.classList.add('hidden');
  bulkResults.classList.add('hidden');
  historyPanel.classList.add('hidden');
}

function setUsage(usage) {
  const limit = usage.limit == null ? '∞' : usage.limit;
  ubUsage.textContent = `${usage.used} / ${limit} audits · ${usage.planLabel}`;
}

async function refreshSession() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.user) showApp(data.user, data.usage);
    else showAuth();
  } catch {
    showAuth();
  }
}

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.auth;
    authTabs.forEach((t) => t.classList.toggle('active', t === tab));
    authSubmit.textContent = authMode === 'register' ? 'Create account' : 'Sign in';
    authPassword.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
    authError.textContent = '';
  });
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  authSubmit.disabled = true;
  const original = authSubmit.textContent;
  authSubmit.textContent = 'Please wait…';

  try {
    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail.value, password: authPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    authForm.reset();
    showApp(data.user, data.usage);
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = original;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  showAuth();
});

/* ── Audit history ──────────────────────────────────────────── */
historyBtn.addEventListener('click', loadHistory);
historyClose.addEventListener('click', () => historyPanel.classList.add('hidden'));

async function loadHistory() {
  historyList.innerHTML = '<li class="history-empty">Loading…</li>';
  historyPanel.classList.remove('hidden');
  historyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

function renderHistory(audits) {
  historyList.innerHTML = '';
  if (!audits.length) {
    historyList.innerHTML = '<li class="history-empty">No audits yet. Run your first one below.</li>';
    return;
  }
  for (const a of audits) {
    const li = document.createElement('li');
    li.className = 'history-item';

    const main = document.createElement('div');
    const vendor = document.createElement('span');
    vendor.className = 'history-vendor';
    vendor.textContent = a.vendor || 'Untitled audit';
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    const date = new Date(a.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const mode = a.mode === 'bulk' ? 'Bulk' : 'Single';
    meta.textContent = `${date} · ${mode} · ${a.findingCount} finding${a.findingCount === 1 ? '' : 's'}`;
    main.append(vendor, meta);

    const impact = document.createElement('span');
    impact.className = 'history-impact';
    impact.textContent = `${fmtUsd(a.annualImpact)}/yr`;

    li.append(main, impact);
    li.addEventListener('click', () => viewAudit(a.id));
    historyList.appendChild(li);
  }
}

async function viewAudit(id) {
  try {
    const res = await fetch(`/api/audits/${id}`);
    if (res.status === 401) {
      showAuth();
      return;
    }
    if (!res.ok) throw new Error('Could not load that audit.');
    const audit = await res.json();
    historyPanel.classList.add('hidden');

    if (audit.mode === 'bulk') {
      results.classList.add('hidden');
      renderBulkResults(audit.result);
      bulkResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      bulkResults.classList.add('hidden');
      renderResults(audit.result);
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

/* ── Boot ───────────────────────────────────────────────────── */
refreshSession();
