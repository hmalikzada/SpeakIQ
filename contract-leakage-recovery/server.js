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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { timingSafeEqual } from 'crypto';
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

// Security headers. CSP allows the Google Fonts the UI loads and the inline
// SVG data-URI used as the desk-texture background.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// CORS: locked to an allowlist when ALLOWED_ORIGINS is set; otherwise no
// cross-origin headers are sent (the same-origin UI keeps working regardless).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));

// Optional HTTP Basic Auth gate. When BASIC_AUTH_USER/PASS are set, the whole
// app sits behind a browser login — a zero-frontend-change stopgap until real
// accounts land. Left open when the vars are unset.
app.use(basicAuth);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use('/samples', express.static(join(__dirname, 'samples')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
});

// Caps OpenAI-backed spend: per-IP limit on the expensive analysis endpoints.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.ANALYZE_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests. Please try again later.' },
});

// ── /api/status ───────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ ready: hasApiKey() });
});

// ── /api/analyze — extract + cross-reference contract vs invoices ──
app.post(
  '/api/analyze',
  analyzeLimiter,
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
      res.status(500).json({ error: 'Something went wrong while processing your request. Please try again.' });
    }
  }
);

// ── /api/analyze-sample — run the bundled demo contract + invoice ──
app.post('/api/analyze-sample', analyzeLimiter, async (req, res) => {
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
    res.status(500).json({ error: 'Something went wrong while processing your request. Please try again.' });
  }
});

// ── /api/analyze-bulk — auto-sort a pile of files by vendor, then audit each ──
app.post('/api/analyze-bulk', analyzeLimiter, upload.array('files', 30), async (req, res) => {
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
    res.status(500).json({ error: 'Something went wrong while processing your request. Please try again.' });
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
    res.status(500).json({ error: 'Something went wrong while processing your request. Please try again.' });
  }
});

// ── Optional Basic Auth middleware ────────────────────────────
const BASIC_USER = process.env.BASIC_AUTH_USER;
const BASIC_PASS = process.env.BASIC_AUTH_PASS;

function basicAuth(req, res, next) {
  if (!BASIC_USER || !BASIC_PASS) return next(); // gating disabled

  const header = req.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user = '', pass = ''] = Buffer.from(encoded, 'base64').toString().split(':');
    if (safeEqual(user, BASIC_USER) && safeEqual(pass, BASIC_PASS)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="ClauseGuard"');
  return res.status(401).send('Authentication required.');
}

// Constant-time string compare to avoid leaking match length via timing.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

app.listen(PORT, () => {
  console.log(`\n✅  ClauseGuard running at http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${hasApiKey() ? '✓ loaded from .env' : '✗ NOT SET — add OPENAI_API_KEY to .env'}`);
  console.log(`   Auth gate:  ${BASIC_USER && BASIC_PASS ? '✓ Basic Auth enabled' : '✗ open (set BASIC_AUTH_USER/PASS to lock down)'}`);
  console.log(`   Rate limit: ${Number(process.env.ANALYZE_RATE_LIMIT) || 20} analyses / IP / hour\n`);
});
