/**
 * Turns uploaded files (PDF / CSV / plain text) into raw text, then uses
 * GPT-4o in JSON mode to pull out the structured fields the matcher needs.
 */
import pdfParse from 'pdf-parse';
import { chatJSON } from './openai.js';

// Cap how much raw text we send per document to keep requests fast/cheap.
const MAX_CHARS = 60000;

export async function fileToText(file) {
  const isPDF =
    file.mimetype === 'application/pdf' ||
    file.originalname.toLowerCase().endsWith('.pdf');

  if (isPDF) {
    const { text } = await pdfParse(file.buffer);
    return text;
  }

  return file.buffer.toString('utf8');
}

const CONTRACT_SYSTEM_PROMPT = `You are a contract analysis assistant for a financial audit tool.
Read the supplied vendor contract text and extract every term that affects pricing or billing.

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
  "escalator_cap_pct": number or null,
  "discounts": [
    { "description": "string", "condition": "string describing when it applies" }
  ],
  "fees": [
    { "description": "string", "amount": number, "condition": "string describing when/how often it is billed" }
  ],
  "notes": "any other clause that could affect whether an invoice is correct"
}

Use null where a field is not present in the contract. Quote or closely paraphrase the source clauses so they can be cited as evidence later.`;

const INVOICE_SYSTEM_PROMPT = `You are an invoice parsing assistant for a financial audit tool.
Read the supplied invoice text (it may be a PDF extract or CSV dump) and extract its contents.

Return a single JSON object with this shape:
{
  "vendor": "string",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "billing_period": { "start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null" },
  "line_items": [
    { "description": "string", "quantity": number or null, "unit_price": number or null, "amount": number }
  ],
  "total": number or null
}

If quantity/unit_price aren't broken out, leave them null but still record "amount".`;

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
