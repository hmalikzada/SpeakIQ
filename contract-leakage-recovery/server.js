/**
 * ClauseGuard — prototype server
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
import { fileToText, extractContractTerms, extractInvoice, classifyAndGroup } from './lib/extract.js';
import { findDiscrepancies, legalAdvisory, summarize } from './lib/matcher.js';
import { buildReportPdf } from './lib/report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

if (!hasApiKey()) {
  console.error('\n⚠️  OPENAI_API_KEY is not set in .env — analysis will not work.\n');
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
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

      const [{ executiveSummary, findings }, legal] = await Promise.all([
        findDiscrepancies(contract, invoices),
        legalAdvisory(contract, invoices),
      ]);
      const summary = summarize(findings);

      res.json({ contract, invoices, findings, executiveSummary, legal, summary });
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

    const [{ executiveSummary, findings }, legal] = await Promise.all([
      findDiscrepancies(contract, invoices),
      legalAdvisory(contract, invoices),
    ]);
    const summary = summarize(findings);

    res.json({ contract, invoices, findings, executiveSummary, legal, summary });
  } catch (e) {
    console.error('/api/analyze-sample error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/analyze-bulk — auto-sort a pile of files by vendor, then audit each ──
app.post('/api/analyze-bulk', upload.array('files', 30), async (req, res) => {
  if (!hasApiKey()) {
    return res.status(503).json({ error: 'Server has no OpenAI key configured.' });
  }

  try {
    const files = req.files || [];
    if (files.length < 2) {
      return res
        .status(400)
        .json({ error: 'Please upload at least one contract and one invoice.' });
    }

    const docs = await Promise.all(
      files.map(async (file, index) => ({
        index,
        filename: file.originalname,
        text: await fileToText(file),
      }))
    );

    const { groups, unmatched } = await classifyAndGroup(docs);

    const results = await Promise.all(
      groups.map(async (group) => {
        const contractDocs = group.contractIndices.map((i) => docs[i]).filter(Boolean);
        const amendmentDocs = group.amendmentIndices.map((i) => docs[i]).filter(Boolean);
        const invoiceDocs = group.invoiceIndices.map((i) => docs[i]).filter(Boolean);

        const fileNames = {
          contracts: contractDocs.map((d) => d.filename),
          amendments: amendmentDocs.map((d) => d.filename),
          invoices: invoiceDocs.map((d) => d.filename),
        };

        if (contractDocs.length === 0 || invoiceDocs.length === 0) {
          return {
            vendor: group.vendor,
            files: fileNames,
            incomplete: true,
            reason:
              contractDocs.length === 0
                ? 'No contract was found for these invoices — upload the contract to run a full audit.'
                : 'No invoices were found for this contract — upload invoices to run a full audit.',
          };
        }

        let contractText = contractDocs.map((d) => d.text).join('\n\n');
        for (const doc of amendmentDocs) {
          contractText += `\n\n===== SUPPORTING DOCUMENT: ${doc.filename} =====\n\n${doc.text}`;
        }
        const contract = await extractContractTerms(contractText);

        const invoices = [];
        for (const doc of invoiceDocs) {
          invoices.push(await extractInvoice(doc.text));
        }

        const [{ executiveSummary, findings }, legal] = await Promise.all([
          findDiscrepancies(contract, invoices),
          legalAdvisory(contract, invoices),
        ]);
        const summary = summarize(findings);

        return {
          vendor: group.vendor,
          files: fileNames,
          contract,
          invoices,
          findings,
          executiveSummary,
          legal,
          summary,
        };
      })
    );

    const unmatchedFiles = unmatched.map((i) => docs[i]?.filename).filter(Boolean);

    res.json({ results, unmatchedFiles });
  } catch (e) {
    console.error('/api/analyze-bulk error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/report — render an analysis result as a PDF audit report ──
app.post('/api/report', (req, res) => {
  try {
    const { contract, findings, executiveSummary, legal, summary } = req.body || {};
    if (!summary) {
      return res.status(400).json({ error: 'Missing analysis result.' });
    }

    const doc = buildReportPdf({ contract, findings, executiveSummary, legal, summary });

    const vendor = (contract?.vendor || 'vendor').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="clauseguard-${vendor}.pdf"`);

    doc.pipe(res);
    doc.end();
  } catch (e) {
    console.error('/api/report error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅  ClauseGuard running at http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${hasApiKey() ? '✓ loaded from .env' : '✗ NOT SET — add OPENAI_API_KEY to .env'}\n`);
});
