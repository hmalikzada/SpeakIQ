/**
 * Cross-references extracted contract terms against extracted invoices and
 * asks GPT-4o to flag every place an invoice contradicts the contract.
 */
import { chatJSON } from './openai.js';

const MATCH_SYSTEM_PROMPT = `You are a senior contract-compliance auditor with 20 years of experience recovering money for clients from vendor billing errors.
You will be given:
  - "contract": structured terms extracted from a vendor contract (which may include MOUs, amendments, and side letters)
  - "invoices": an array of structured invoices from the same vendor

Find every place where an invoice does not match what the contract specifies. Look specifically for:
  - Overcharges: a rate or fee billed above what the contract's pricing/tier allows
  - Escalator violations: a rate increase larger than "escalator_cap_pct" allows, comparing against the contract's base rate
  - Missed discounts: a discount the contract (or any MOU/amendment) entitles the customer to that isn't reflected on the invoice
  - Duplicate or out-of-window fees: one-time fees (e.g. setup fees) billed more than once, or billed outside the window the contract allows
  - Auto-renewal risk: contract is near its end date with an auto-renewal clause and a notice deadline that may be approaching
  - Any other discrepancy between contract terms and invoiced amounts

Return a single JSON object: { "executive_summary": "...", "findings": [ ... ] }

"executive_summary" is a 2-4 sentence professional audit memo paragraph, written in the voice of a senior auditor addressing the client's CFO: what was reviewed, the headline dollar exposure, and the single most urgent action. Be specific with names and numbers.

Each finding must have this shape:
{
  "type": "overcharge | escalator_violation | missed_discount | duplicate_fee | auto_renewal_risk | other",
  "severity": "critical | moderate | minor",
  "title": "short headline for the finding, max 10 words",
  "description": "plain-English explanation of the issue",
  "contract_basis": "the relevant contract term/clause that proves this",
  "invoice_evidence": "the relevant invoice line item/amount that proves this",
  "monthly_impact_usd": number (your best estimate of the recurring monthly $ at stake; 0 if one-time),
  "one_time_impact_usd": number (for one-time issues like duplicate fees; 0 if recurring),
  "confidence": "high | medium | low",
  "recommended_action": "what the customer should do to recover this"
}

Severity guide: "critical" = recurring leakage or a large one-time loss that demands immediate vendor contact; "moderate" = clear money at stake but smaller or needs verification; "minor" = housekeeping or risk that costs nothing yet.

If you find nothing, return { "executive_summary": "...", "findings": [] } with a summary stating the invoices appear consistent with the contract. Do not invent issues that aren't supported by the data — only report what the evidence shows.`;

export async function findDiscrepancies(contract, invoices) {
  const result = await chatJSON([
    { role: 'system', content: MATCH_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ contract, invoices }) },
  ]);

  return {
    executiveSummary: typeof result.executive_summary === 'string' ? result.executive_summary : '',
    findings: Array.isArray(result.findings) ? result.findings : [],
  };
}

export function summarize(findings) {
  const totalMonthly = findings.reduce((sum, f) => sum + (Number(f.monthly_impact_usd) || 0), 0);
  const totalOneTime = findings.reduce((sum, f) => sum + (Number(f.one_time_impact_usd) || 0), 0);
  const totalAnnual = totalMonthly * 12 + totalOneTime;
  const contingencyRate = 0.25;

  return {
    findingCount: findings.length,
    totalMonthlyImpactUsd: round2(totalMonthly),
    totalOneTimeImpactUsd: round2(totalOneTime),
    totalAnnualImpactUsd: round2(totalAnnual),
    contingencyRate,
    suggestedFeeUsd: round2(totalAnnual * contingencyRate),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
