const form = document.getElementById('analyze-form');
const analyzeBtn = document.getElementById('analyze-btn');
const sampleBtn = document.getElementById('sample-btn');
const statusMsg = document.getElementById('status-msg');
const results = document.getElementById('results');
const findingsList = document.getElementById('findings-list');

const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const contractFile = document.getElementById('contract-file').files[0];
  const invoiceFiles = document.getElementById('invoice-files').files;

  if (!contractFile || invoiceFiles.length === 0) {
    setStatus('Please choose a contract file and at least one invoice file.', true);
    return;
  }

  const formData = new FormData();
  formData.append('contract', contractFile);
  for (const f of invoiceFiles) formData.append('invoices', f);

  await runAnalysis('/api/analyze', { method: 'POST', body: formData });
});

sampleBtn.addEventListener('click', async () => {
  await runAnalysis('/api/analyze-sample', { method: 'POST' });
});

async function runAnalysis(url, options) {
  setBusy(true);
  setStatus('Analyzing… this can take 10-30 seconds.');
  results.classList.add('hidden');

  try {
    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    renderResults(data);
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  analyzeBtn.disabled = busy;
  sampleBtn.disabled = busy;
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.classList.toggle('error', isError);
}

function renderResults(data) {
  const { findings, summary } = data;

  document.getElementById('sum-monthly').textContent = fmtUsd(summary.totalMonthlyImpactUsd);
  document.getElementById('sum-annual').textContent = fmtUsd(summary.totalAnnualImpactUsd);
  document.getElementById('sum-fee').textContent = fmtUsd(summary.suggestedFeeUsd);
  document.getElementById('sum-count').textContent = summary.findingCount;

  findingsList.innerHTML = '';

  if (findings.length === 0) {
    findingsList.innerHTML = '<div class="empty-state">No discrepancies found — this contract and invoice set look clean.</div>';
  } else {
    for (const f of findings) {
      findingsList.appendChild(renderFinding(f));
    }
  }

  results.classList.remove('hidden');
}

function renderFinding(f) {
  const impact = (f.monthly_impact_usd || 0) > 0
    ? `${fmtUsd(f.monthly_impact_usd)}/mo`
    : fmtUsd(f.one_time_impact_usd);

  const el = document.createElement('div');
  el.className = 'finding';
  el.innerHTML = `
    <div class="finding-header">
      <span class="finding-type">${escapeHtml(f.type || 'other')}</span>
      <span class="finding-impact">${impact}</span>
    </div>
    <p class="finding-desc">${escapeHtml(f.description || '')}</p>
    <div class="finding-meta">
      <div>
        <div class="label">Contract basis</div>
        ${escapeHtml(f.contract_basis || '—')}
      </div>
      <div>
        <div class="label">Invoice evidence</div>
        ${escapeHtml(f.invoice_evidence || '—')}
      </div>
      <div>
        <div class="label">Recommended action</div>
        ${escapeHtml(f.recommended_action || '—')}
      </div>
      <div>
        <div class="label">Confidence</div>
        <span class="confidence ${escapeHtml(f.confidence || 'low')}">${escapeHtml((f.confidence || 'low').toUpperCase())}</span>
      </div>
    </div>
  `;
  return el;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
