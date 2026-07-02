/**
 * Renders an analysis result (findings + legal advisory + summary) as a
 * branded PDF audit report, suitable for emailing to a client.
 */
import PDFDocument from 'pdfkit';

const INK = '#1c2a25';
const SOFT = '#5b6b64';
const GREEN = '#0e6b4f';
const GOLD = '#b98a2f';
const RED = '#b3402f';
const LINE = '#d8d2c2';

const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );

const SEVERITY_COLOR = { critical: RED, moderate: GOLD, minor: GREEN };

const STATUS_LABELS = {
  active: 'Contract active',
  expired_holdover: 'Expired — billing continues',
  auto_renewed: 'Auto-renewed',
  expiring_soon: 'Expiring soon',
  unclear: 'Status unclear',
};

export function buildReportPdf({ contract, findings, executiveSummary, legal, summary }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 54 });

  // ── Header ───────────────────────────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(GREEN)
    .text('ClauseGuard', { continued: false });

  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(INK)
    .text('Vendor Contract Audit Report', { paragraphGap: 2 });

  const vendor = contract?.vendor || 'Unknown vendor';
  const customer = contract?.customer ? `  •  ${contract.customer}` : '';
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(SOFT)
    .text(`${vendor}${customer}`)
    .text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);

  hr(doc);

  // ── Executive summary ───────────────────────────────────
  sectionTitle(doc, 'Executive Summary');
  doc.font('Helvetica').fontSize(11).fillColor(INK).text(executiveSummary || 'No summary available.', {
    align: 'left',
  });
  doc.moveDown(0.6);

  // ── Financial summary ───────────────────────────────────
  sectionTitle(doc, 'Financial Summary');
  const metrics = [
    ['Monthly leakage found', fmtUsd(summary?.totalMonthlyImpactUsd)],
    ['Annual recoverable', fmtUsd(summary?.totalAnnualImpactUsd)],
    ['One-time recoverable', fmtUsd(summary?.totalOneTimeImpactUsd)],
    ['Findings', String(summary?.findingCount ?? 0)],
  ];
  metrics.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(label.toUpperCase());
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(value);
    doc.moveDown(0.3);
  });

  hr(doc);

  // ── Findings ─────────────────────────────────────────────
  sectionTitle(doc, 'Detailed Findings');
  if (!findings || findings.length === 0) {
    doc.font('Helvetica').fontSize(11).fillColor(INK).text('No discrepancies found.');
  } else {
    const order = { critical: 0, moderate: 1, minor: 2 };
    const sorted = [...findings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    sorted.forEach((f, i) => {
      ensureSpace(doc, 120);
      const sevColor = SEVERITY_COLOR[f.severity] || SOFT;
      const impact =
        (f.monthly_impact_usd || 0) > 0
          ? `${fmtUsd(f.monthly_impact_usd)}/mo`
          : fmtUsd(f.one_time_impact_usd);

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(INK)
        .text(`${i + 1}. ${f.title || f.type || 'Finding'}`, { continued: true })
        .fillColor(sevColor)
        .text(`   ${impact}`, { align: 'left' });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(sevColor)
        .text(`${(f.severity || 'minor').toUpperCase()}  ·  ${(f.type || 'other').replaceAll('_', ' ')}  ·  ${f.confidence || 'low'} confidence`);

      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(f.description || '');

      doc.moveDown(0.2);
      labelValue(doc, 'Contract basis', f.contract_basis);
      labelValue(doc, 'Invoice evidence', f.invoice_evidence);
      labelValue(doc, 'Recommended action', f.recommended_action);

      doc.moveDown(0.6);
    });
  }

  // ── Legal advisory ───────────────────────────────────────
  if (legal) {
    doc.addPage();
    sectionTitle(doc, 'Legal Advisory');

    const status = STATUS_LABELS[legal.contractStatus] || STATUS_LABELS.unclear;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GREEN).text(status);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(legal.statusExplanation || '');
    doc.moveDown(0.5);

    subTitle(doc, 'What governs the relationship now');
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(legal.governingAnalysis || '—');
    doc.moveDown(0.5);

    subTitle(doc, 'Risks of continuing as-is');
    (legal.risks || []).forEach((r) => bullet(doc, `[${(r.severity || 'low').toUpperCase()}] ${r.risk}`));
    if (!legal.risks?.length) doc.font('Helvetica').fontSize(10.5).fillColor(INK).text('None identified.');
    doc.moveDown(0.5);

    subTitle(doc, 'Leverage points');
    (legal.leveragePoints || []).forEach((p) => bullet(doc, p));
    if (!legal.leveragePoints?.length) doc.font('Helvetica').fontSize(10.5).fillColor(INK).text('None identified.');
    doc.moveDown(0.5);

    subTitle(doc, 'Recommended path forward');
    const steps = [...(legal.recommendedPath || [])].sort((a, b) => (a.step || 0) - (b.step || 0));
    steps.forEach((s, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor(INK)
        .text(`${i + 1}. ${s.action || ''}`, { continued: false });
      if (s.detail) {
        doc.font('Helvetica').fontSize(10.5).fillColor(SOFT).text(s.detail, { indent: 14 });
      }
      doc.moveDown(0.2);
    });
  }

  // ── Footer disclaimer ───────────────────────────────────
  doc.moveDown(1);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8.5)
    .fillColor(SOFT)
    .text(
      'AI-generated analysis for informational purposes only — not legal or financial advice. ' +
        'Verify every finding against the original source documents and consult licensed counsel before acting.'
    );

  return doc;
}

function sectionTitle(doc, text) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor(GREEN).text(text);
  doc.moveDown(0.3);
}

function subTitle(doc, text) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(SOFT).text(text.toUpperCase());
  doc.moveDown(0.15);
}

function labelValue(doc, label, value) {
  if (!value) return;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(SOFT)
    .text(`${label.toUpperCase()}: `, { continued: true })
    .font('Helvetica')
    .fillColor(INK)
    .text(value);
}

function bullet(doc, text) {
  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(`•  ${text}`, { indent: 0 });
}

function hr(doc) {
  doc.moveDown(0.4);
  doc
    .strokeColor(LINE)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.6);
}

function ensureSpace(doc, minHeight) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + minHeight > bottom) {
    doc.addPage();
  }
}
