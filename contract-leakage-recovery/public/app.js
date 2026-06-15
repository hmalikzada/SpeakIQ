const form = document.getElementById('analyze-form');
const analyzeBtn = document.getElementById('analyze-btn');
const sampleBtn = document.getElementById('sample-btn');
const statusMsg = document.getElementById('status-msg');
const loading = document.getElementById('loading');
const loadingStep = document.getElementById('loading-step');
const results = document.getElementById('results');
const findingsList = document.getElementById('findings-list');
const downloadBtn = document.getElementById('download-pdf-btn');

let lastAnalysis = null;

const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

/* ── Dropzones ──────────────────────────────────────────────── */
// kind -> { files, input, listEl, multiple, max }
const zones = {
  contract: { files: [], input: document.getElementById('contract-file'), listEl: document.getElementById('list-contract'), multiple: false, max: 1 },
  supporting: { files: [], input: document.getElementById('supporting-files'), listEl: document.getElementById('list-supporting'), multiple: true, max: 10 },
  invoices: { files: [], input: document.getElementById('invoice-files'), listEl: document.getElementById('list-invoices'), multiple: true, max: 10 },
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

/* ── Analysis ───────────────────────────────────────────────── */
const LOADING_STEPS = [
  'Reading contract & supporting documents…',
  'Parsing invoice line items…',
  'Cross-referencing terms against billing…',
  'Writing the audit memo…',
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

async function runAnalysis(url, options) {
  setBusy(true);
  setStatus('');
  results.classList.add('hidden');
  startLoading();

  try {
    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    renderResults(data);
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    stopLoading();
    setBusy(false);
  }
}

function startLoading() {
  let i = 0;
  loadingStep.textContent = LOADING_STEPS[0];
  loading.classList.remove('hidden');
  loadingTimer = setInterval(() => {
    i = Math.min(i + 1, LOADING_STEPS.length - 1);
    loadingStep.textContent = LOADING_STEPS[i];
  }, 6000);
}

function stopLoading() {
  clearInterval(loadingTimer);
  loading.classList.add('hidden');
}

function setBusy(busy) {
  analyzeBtn.disabled = busy;
  sampleBtn.disabled = busy;
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
    executiveSummary || 'Analysis complete — see the detailed findings below.';
  document.getElementById('sum-monthly').textContent = fmtUsd(summary.totalMonthlyImpactUsd);
  document.getElementById('sum-annual').textContent = fmtUsd(summary.totalAnnualImpactUsd);
  document.getElementById('sum-fee').textContent = fmtUsd(summary.suggestedFeeUsd);
  document.getElementById('sum-count').textContent = summary.findingCount;

  findingsList.innerHTML = '';

  if (findings.length === 0) {
    findingsList.innerHTML =
      '<div class="empty-state">No discrepancies found — this contract and invoice set look clean.</div>';
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
