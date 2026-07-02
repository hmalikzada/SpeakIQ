/**
 * Cross-references extracted contract terms against extracted invoices and
 * asks GPT-4o to flag every place an invoice contradicts the contract.
 */
import { chatJSON, chatText } from './openai.js';

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

const LETTER_SYSTEM_PROMPT = `You draft professional vendor billing-dispute correspondence for a company's finance team.
You will be given a single audit finding (with the contract clause and invoice evidence that support it),
the vendor's name, optional contract context, and the sender's name/company.

Write a complete, ready-to-send business email to the vendor's billing/accounts team that:
  - has a clear subject line ("Subject: ..." as the first line)
  - states the specific billing discrepancy plainly, citing the contract term and the invoice line item as evidence
  - quantifies the amount at stake and requests a specific remedy (credit, refund, or corrected invoice)
  - asks for a written response by a reasonable date (14 days out)
  - reserves the sender's rights without being threatening — firm, courteous, professional
  - uses bracketed placeholders like [Invoice #], [Your name], or [Date] ONLY where the supplied data doesn't provide the detail

Keep it under 350 words. Output ONLY the letter text — no commentary, no markdown formatting.`;

/** Draft a dispute email for one finding. Returns plain letter text. */
export async function draftDisputeLetter({ vendor, contract, finding, sender }) {
  const payload = {
    today: todayISO(),
    vendor: vendor || contract?.vendor || 'the vendor',
    contract_term: contract?.contract_term,
    finding,
    sender,
  };
  return chatText([
    { role: 'system', content: LETTER_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(payload).slice(0, 12000) },
  ]);
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
