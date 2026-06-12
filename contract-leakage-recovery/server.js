/**
 * Contract Leakage Recovery — prototype server
 *
 * Upload a vendor contract plus one or more invoices from that vendor.
 * The server extracts structured terms/line-items with GPT-4o, then
 * cross-references them to flag overcharges, missed discounts, escalator
 * violations, duplicate fees, and auto-renewal risk.
 *
 * Usage:
 *   npm install
 *   cp .env.example .env   (then fill in OPENAI_API_KEY)
 *   npm start
 *   Open: http://localhost:3001
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

import { hasApiKey } from './lib/openai.js';
import { fileToText, extractContractTerms, extractInvoice } from './lib/extract.js';
import { findDiscrepancies, summarize } from './lib/matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

if (!hasApiKey()) {
  console.error('\n⚠️  OPENAI_API_KEY is not set in .env — analysis will not work.\n');
}

app.use(cors());
app.use(express.static(join(__dirname, 'public')));
app.use('/samples', express.static(join(__dirname, 'samples')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
});

// ── /api/status ───────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ ready: hasApiKey() });
});

// ── /api/analyze — extract + cross-reference contract vs invoices ──
app.post(
  '/api/analyze',
  upload.fields([
    { name: 'contract', maxCount: 1 },
    { name: 'supporting', maxCount: 10 },
    { name: 'invoices', maxCount: 10 },
  ]),
  async (req, res) => {
    if (!hasApiKey()) {
      return res.status(503).json({ error: 'Server has no OpenAI key configured.' });
    }

    try {
      const contractFile = req.files?.contract?.[0];
      const supportingFiles = req.files?.supporting || [];
      const invoiceFiles = req.files?.invoices || [];

      if (!contractFile || invoiceFiles.length === 0) {
        return res
          .status(400)
          .json({ error: 'Please upload one contract file and at least one invoice file.' });
      }

      let contractText = await fileToText(contractFile);
      for (const file of supportingFiles) {
        const text = await fileToText(file);
        contractText += `\n\n===== SUPPORTING DOCUMENT: ${file.originalname} =====\n\n${text}`;
      }
      const contract = await extractContractTerms(contractText);

      const invoices = [];
      for (const file of invoiceFiles) {
        const text = await fileToText(file);
        const invoice = await extractInvoice(text);
        invoices.push(invoice);
      }

      const { executiveSummary, findings } = await findDiscrepancies(contract, invoices);
      const summary = summarize(findings);

      res.json({ contract, invoices, findings, executiveSummary, summary });
    } catch (e) {
      console.error('/api/analyze error:', e);
      res.status(500).json({ error: e.message });
    }
  }
);

// ── /api/analyze-sample — run the bundled demo contract + invoice ──
app.post('/api/analyze-sample', async (req, res) => {
  if (!hasApiKey()) {
    return res.status(503).json({ error: 'Server has no OpenAI key configured.' });
  }

  try {
    const contractText = await readFile(join(__dirname, 'samples', 'contract.txt'), 'utf8');
    const mouText = await readFile(join(__dirname, 'samples', 'mou.txt'), 'utf8');
    const invoiceText = await readFile(join(__dirname, 'samples', 'invoice.txt'), 'utf8');

    const combinedContract = `${contractText}\n\n===== SUPPORTING DOCUMENT: mou.txt =====\n\n${mouText}`;
    const contract = await extractContractTerms(combinedContract);
    const invoice = await extractInvoice(invoiceText);
    const invoices = [invoice];

    const { executiveSummary, findings } = await findDiscrepancies(contract, invoices);
    const summary = summarize(findings);

    res.json({ contract, invoices, findings, executiveSummary, summary });
  } catch (e) {
    console.error('/api/analyze-sample error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅  Contract Leakage Recovery running at http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${hasApiKey() ? '✓ loaded from .env' : '✗ NOT SET — add OPENAI_API_KEY to .env'}\n`);
});
