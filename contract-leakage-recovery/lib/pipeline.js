/**
 * The core extract → match → legal → summarize pipeline, shared by the
 * single, sample, and bulk analysis endpoints.
 */
import { extractContractTerms, extractInvoice } from './extract.js';
import { findDiscrepancies, legalAdvisory, summarize } from './matcher.js';

export async function runAudit(contractText, invoiceTexts) {
  const contract = await extractContractTerms(contractText);

  const invoices = [];
  for (const text of invoiceTexts) {
    invoices.push(await extractInvoice(text));
  }

  const [{ executiveSummary, findings, lineReview }, legal] = await Promise.all([
    findDiscrepancies(contract, invoices),
    legalAdvisory(contract, invoices),
  ]);
  const summary = summarize(findings);

  return { contract, invoices, findings, lineReview, executiveSummary, legal, summary };
}
