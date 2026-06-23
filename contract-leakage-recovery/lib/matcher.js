/**
 * Cross-references extracted contract terms against extracted invoices and
 * asks GPT-4o to flag every place an invoice contradicts the contract.
 */
import { chatJSON } from './openai.js';

const MATCH_SYSTEM_PROMPT = `You are a senior contract-compliance auditor with 20 years of experience recovering money for clients from vendor billing errors.
You will be given:
  - "contract": structured terms extracted from a vendor contract (which may include MOUs, amendments, and side letters)
  - "invoices": an array of structured invoices from the same vendor

Reconcile the invoice line by line: for EACH line item, identify which contract term governs it (base/recurring charge, usage/overage rate, late fee, interest, tax, or one-time fee) and check whether the billed amount is what the contract allows. Account for every charge. Look specifically for:
  - Overcharges: a rate or fee billed above what the contract's pricing/tier allows
  - Escalator violations: a rate increase larger than "escalator_cap_pct" allows, comparing against the contract's base rate
  - Missed discounts: a discount the contract (or any MOU/amendment) entitles the customer to that isn't reflected on the invoice
  - Late fees / interest billed beyond contract terms (see the rules below)
  - Unauthorized charges: any line item with no basis in the contract's pricing, fees, or terms
  - Duplicate fees: the SAME charge for the SAME period/service billed more than once (see the rules below)
  - Auto-renewal risk: contract is near its end date with an auto-renewal clause and a notice deadline that may be approaching
  - Any other discrepancy between contract terms and invoiced amounts

CRITICAL RECONCILIATION RULES — apply these before flagging anything:
  1. BILLING PERIODS / BALANCE FORWARD: A recurring charge (e.g. a monthly lease or contract payment) billed for DIFFERENT periods is legitimate and expected — it is NOT a duplicate. Invoices routinely show a prior period carried over as a "balance forward" or "past due" line PLUS the current period's charge: that is two different months, not a double-bill. Only flag a "duplicate_fee" when the identical charge for the SAME period/service appears more than once. Use each line item's dates/billing_period to tell periods apart; if two equal amounts cover different periods, do NOT flag them.
  2. LATE FEES & INTEREST: When the invoice has a late fee or interest charge, check it against the contract's late_fee terms, reading the formula PRECISELY. "Greater of 15% or $29" means the permitted fee is the LARGER of (15% of the overdue amount) or $29 — so $29 is a floor, NOT a cap, and a fee above $29 is NOT automatically an overcharge; it is allowed as long as it does not exceed 15% of the overdue amount. To judge a late fee you need the overdue principal it was computed on:
     - If that base is shown (e.g. a balance-forward line for the same vendor), compute permitted = greater of (rate × overdue) or the flat floor, and flag ONLY the excess (billed minus permitted).
     - If the overdue base is NOT shown on the invoice, do NOT assert a precise overcharge. Raise a "needs verification" finding instead (type "other", severity minor or moderate, confidence low/medium), recommend the customer request the overdue-balance breakdown, and set both dollar impacts to 0 — unless the billed fee exceeds even the most generous reading of the terms.
     - Only when the contract bars late fees entirely (late_fee.allowed = false) should you flag the whole fee.
     Always show the permitted-vs-billed math in "description" (e.g. "15% of the $1,527.51 balance = $229.13, so the $152.75 fee is within terms").

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
    {
      role: 'user',
      content: JSON.stringify({ today: todayISO(), contract, invoices }),
    },
  ]);

  return {
    executiveSummary: typeof result.executive_summary === 'string' ? result.executive_summary : '',
    findings: Array.isArray(result.findings) ? result.findings : [],
  };
}

const LEGAL_SYSTEM_PROMPT = `You are outside counsel advising a company on its commercial vendor relationships.
You will be given today's date, the structured terms of a vendor contract (possibly with amendments),
and the invoices the vendor has been sending.

A very common situation: the contract term has ENDED, no renewal was signed, and yet the vendor keeps
invoicing and the company keeps paying. Assess the legal posture of this relationship and advise the
company on how to move forward.

Return a single JSON object with this shape:
{
  "contract_status": "active | expired_holdover | auto_renewed | expiring_soon | unclear",
  "status_explanation": "2-3 sentences: compare the contract term dates against today's date and the invoice dates, state plainly whether the contract is live, auto-renewed, or expired with billing continuing",
  "governing_analysis": "3-5 sentences in plain English: what likely governs the relationship right now (e.g. the auto-renewal clause, a month-to-month implied contract on the old terms via continued performance and course of dealing), and what that means for which prices/discounts/caps the company can still hold the vendor to",
  "risks": [
    { "risk": "one-sentence risk of continuing as-is", "severity": "high | medium | low" }
  ],
  "leverage_points": [
    "one-sentence negotiation lever the company holds right now (e.g. no termination penalty applies after expiry, vendor needs the signed renewal more than you do, billing errors give grounds for credits)"
  ],
  "recommended_path": [
    { "step": 1, "action": "short imperative headline", "detail": "1-2 sentences on exactly what to do and why" }
  ]
}

Ground every statement in the supplied dates, terms, and invoices — do not invent facts. Where the
documents are silent, reason from general commercial-contract principles and say you are doing so.
Keep "recommended_path" to 3-5 concrete steps ordered by urgency (e.g. send a reservation-of-rights
letter, dispute the overcharges in writing, set the renewal deadline, renegotiate from documented
leverage). This is practical guidance for a business audience, not a legal memorandum.`;

export async function legalAdvisory(contract, invoices) {
  const result = await chatJSON([
    { role: 'system', content: LEGAL_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({ today: todayISO(), contract, invoices }),
    },
  ]);

  return {
    contractStatus: result.contract_status || 'unclear',
    statusExplanation: result.status_explanation || '',
    governingAnalysis: result.governing_analysis || '',
    risks: Array.isArray(result.risks) ? result.risks : [],
    leveragePoints: Array.isArray(result.leverage_points) ? result.leverage_points : [],
    recommendedPath: Array.isArray(result.recommended_path) ? result.recommended_path : [],
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
