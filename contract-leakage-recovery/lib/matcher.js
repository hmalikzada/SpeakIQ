/**
 * Cross-references extracted contract terms against extracted invoices and
 * asks GPT-4o to flag every place an invoice contradicts the contract.
 */
import { chatJSON } from './openai.js';

const MATCH_SYSTEM_PROMPT = `You are a financial auditor AI specializing in vendor contract compliance.
You will be given:
  - "contract": structured terms extracted from a vendor contract
  - "invoices": an array of structured invoices from the same vendor

Find every place where an invoice does not match what the contract specifies. Look specifically for:
  - Overcharges: a rate or fee billed above what the contract's pricing/tier allows
  - Escalator violations: a rate increase larger than "escalator_cap_pct" allows, comparing against the contract's base rate
  - Missed discounts: a discount the contract entitles the customer to that isn't reflected on the invoice
  - Duplicate or out-of-window fees: one-time fees (e.g. setup fees) billed more than once, or billed outside the window the contract allows
  - Auto-renewal risk: contract is near its end date with an auto-renewal clause and a notice deadline that may be approaching
  - Any other discrepancy between contract terms and invoiced amounts

Return a single JSON object: { "findings": [ ... ] }

Each finding must have this shape:
{
  "type": "overcharge | escalator_violation | missed_discount | duplicate_fee | auto_renewal_risk | other",
  "description": "plain-English explanation of the issue",
  "contract_basis": "the relevant contract term/clause that proves this",
  "invoice_evidence": "the relevant invoice line item/amount that proves this",
  "monthly_impact_usd": number (your best estimate of the recurring monthly $ at stake; 0 if one-time),
  "one_time_impact_usd": number (for one-time issues like duplicate fees; 0 if recurring),
  "confidence": "high | medium | low",
  "recommended_action": "what the customer should do to recover this"
}

If you find nothing, return { "findings": [] }. Do not invent issues that aren't supported by the data — only report what the evidence shows.`;

export async function findDiscrepancies(contract, invoices) {
  const result = await chatJSON([
    { role: 'system', content: MATCH_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ contract, invoices }) },
  ]);

  return Array.isArray(result.findings) ? result.findings : [];
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
