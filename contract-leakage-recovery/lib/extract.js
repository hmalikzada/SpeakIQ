/**
 * Turns uploaded files (PDF / CSV / plain text) into raw text, then uses
 * GPT-4o in JSON mode to pull out the structured fields the matcher needs.
 */
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { chatJSON } from './openai.js';
import { transcribePdf, hasClaude } from './claude.js';

// Cap how much raw text we send per document to keep requests fast/cheap.
const MAX_CHARS = 60000;

// Below this many characters, a PDF almost certainly has no real text layer
// (i.e. it's a scan/image), so we fall back to GPT-4o vision to read it.
const SCANNED_TEXT_THRESHOLD = 200;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function fileToText(file) {
  const name = (file.originalname || '').toLowerCase();
  const isPDF = file.mimetype === 'application/pdf' || name.endsWith('.pdf');
  const isDocx = file.mimetype === DOCX_MIME || name.endsWith('.docx');

  // Word documents are binary (zipped XML) — extract their real text, never
  // toString('utf8') the raw bytes (which produces garbage the model can't read).
  if (isDocx) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value || '';
  }

  if (isPDF) {
    let text = '';
    try {
      ({ text } = await pdfParse(file.buffer));
    } catch {
      text = '';
    }
    if ((text || '').trim().length >= SCANNED_TEXT_THRESHOLD) return text;

    // Little/no extractable text → likely a scanned/image PDF, which GPT-4o reads
    // poorly. Claude reads scans far better, so use it ONLY here (keeps Claude usage
    // minimal). On any failure, fall back to whatever pdf-parse got so behaviour
    // never regresses below today's.
    if (hasClaude()) {
      try {
        const transcript = await transcribePdf(file.buffer);
        if (transcript && transcript.trim().length > (text || '').trim().length) return transcript;
      } catch (err) {
        console.error(`Claude OCR fallback failed for ${file.originalname}:`, err.message);
      }
    }
    return text;
  }

  return file.buffer.toString('utf8');
}

const CONTRACT_SYSTEM_PROMPT = `You are a contract analysis assistant for a financial audit tool.
Read the supplied vendor contract text — which may be followed by supporting documents such as
MOUs, amendments, side letters, or renewal notices — and extract every term that affects pricing
or billing. Terms in a later amendment/MOU override the base contract; capture the final effective
terms and note in "notes" when an amendment changed something.

Return a single JSON object with this shape:
{
  "vendor": "string",
  "customer": "string",
  "contract_term": {
    "start": "YYYY-MM-DD or null",
    "end": "YYYY-MM-DD or null",
    "auto_renewal": true/false,
    "renewal_notice_days": number or null
  },
  "pricing": [
    { "item": "string description of the priced item/service", "unit": "e.g. per seat per month", "rate": number, "tier_min": number or null, "tier_max": number or null, "currency": "USD" }
  ],
  "usage_allowances": [
    { "item": "e.g. B&W images, Color images, GB of data", "included_per_month": number or null, "excess_rate": number or null, "applies": "pooled across all devices | per device | unclear" }
  ],
  "escalator_cap_pct": number or null,
  "discounts": [
    { "description": "string", "condition": "string describing when it applies" }
  ],
  "fees": [
    { "description": "string", "amount": number, "condition": "string describing when/how often it is billed" }
  ],
  "late_fee": {
    "allowed": true/false/null,
    "terms": "the exact late-fee and interest terms the vendor may charge the customer — lateness threshold (e.g. 'more than 10 days late'), the fee (e.g. 'greater of 15% or $29'), interest (e.g. '1.5% per month'), and any returned-check fee; null if the contract is silent",
    "threshold_days": number or null
  },
  "notes": "any other clause that could affect whether an invoice is correct"
}

For usage_allowances "applies": if the contract states a SINGLE combined allowance, treats multiple machines as one "System" or "Equipment", or bundles ONE base payment covering all the devices, set it to "pooled across all devices". Set "per device" ONLY when the contract explicitly grants a separate allowance to each unit. Use "unclear" only when the contract genuinely does not say.

Use null where a field is not present in the contract. Quote or closely paraphrase the source clauses so they can be cited as evidence later.`;

const INVOICE_SYSTEM_PROMPT = `You are an invoice parsing assistant for a financial audit tool.
Read the supplied invoice text (it may be a PDF extract or CSV dump) and extract its contents.
List EVERY charge as its own line item — including balance-forward / past-due lines, late charges,
interest, taxes, surcharges, and credits. Never collapse multiple charges into one line.

Return a single JSON object with this shape:
{
  "vendor": "string",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "billing_period": { "start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null" },
  "line_items": [
    {
      "description": "the exact line text, including its service/billing period and whether it is a prior-period 'balance forward' / past-due charge or a current charge",
      "period": "the billing or service dates for this specific line if shown (e.g. '05/10/2026-06/10/2026'), else null",
      "kind": "base_recurring | usage_overage | late_fee | interest | tax | surcharge | credit | other",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number
    }
  ],
  "meters": [
    { "device": "equipment/model the meter belongs to, or null", "meter_type": "B&W | Color | other", "begin": number or null, "end": number or null, "total_copies": number or null, "covered": number or null, "billable": number or null, "rate": number or null, "overage_amount": number or null }
  ],
  "overage_period": { "start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null" },
  "total": number or null
}

Preserve each line's period and any "balance forward" / "past due" / "current charges" label — these
distinguish legitimate charges for different months from true duplicates. If the invoice has a meter /
overage detail table (image or copy counts), capture EVERY row in "meters" with all of its numbers
(begin, end, total, covered, billable, per-unit rate, and the overage amount) exactly as printed — these
are what let the audit recompute usage overages. If quantity/unit_price aren't broken out, leave them
null but still record "amount".`;

export async function extractContractTerms(text) {
  return chatJSON([
    { role: 'system', content: CONTRACT_SYSTEM_PROMPT },
    { role: 'user', content: text.slice(0, MAX_CHARS) },
  ]);
}

export async function extractInvoice(text) {
  return chatJSON([
    { role: 'system', content: INVOICE_SYSTEM_PROMPT },
    { role: 'user', content: text.slice(0, MAX_CHARS) },
  ]);
}

// A short excerpt is enough to spot a document's type and vendor name.
const TRIAGE_EXCERPT_CHARS = 4000;

const TRIAGE_SYSTEM_PROMPT = `You are a document-triage assistant for a vendor-contract audit tool.
You will receive a JSON array of documents, each with an "index", "filename", and a (possibly
truncated) text "excerpt". Classify each document as one of:
  - "contract": a master service agreement / vendor contract that sets pricing and terms
  - "amendment": an MOU, amendment, side letter, renewal notice, or other document that modifies a contract
  - "invoice": a bill, invoice, or billing statement showing what was actually charged
  - "unknown": cannot be confidently classified as any of the above

For every document you classify as contract/amendment/invoice, also identify the vendor — the
company being paid (not the customer receiving the goods or services).

Then GROUP the documents into vendor relationships: documents about the same vendor belong in the
same group, even if the vendor's name is written slightly differently across documents (e.g. "Acme
Corp" vs "Acme Corporation, LLC" vs "ACME"). Each group should contain the contract(s)/amendment(s)
and invoice(s) for one vendor. Documents classified "unknown", or that you cannot confidently assign
to any vendor group, go in "unmatched" instead.

Return a single JSON object with this shape:
{
  "groups": [
    {
      "vendor": "canonical vendor name for this group",
      "contract_indices": [number, ...],
      "amendment_indices": [number, ...],
      "invoice_indices": [number, ...]
    }
  ],
  "unmatched": [number, ...]
}

Use the document "index" values exactly as given. Every index must appear exactly once across all
groups' arrays and "unmatched" combined.`;

export async function classifyAndGroup(docs) {
  const result = await chatJSON([
    { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify(
        docs.map((d) => ({
          index: d.index,
          filename: d.filename,
          excerpt: d.text.slice(0, TRIAGE_EXCERPT_CHARS),
        }))
      ),
    },
  ]);

  const groups = Array.isArray(result.groups) ? result.groups : [];
  const unmatched = Array.isArray(result.unmatched) ? result.unmatched : [];

  return {
    groups: groups.map((g) => ({
      vendor: g.vendor || 'Unknown vendor',
      contractIndices: Array.isArray(g.contract_indices) ? g.contract_indices : [],
      amendmentIndices: Array.isArray(g.amendment_indices) ? g.amendment_indices : [],
      invoiceIndices: Array.isArray(g.invoice_indices) ? g.invoice_indices : [],
    })),
    unmatched,
  };
}
