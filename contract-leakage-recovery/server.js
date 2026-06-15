/**
 * ClauseGuard — server
 *
 * Upload a vendor contract plus one or more invoices from that vendor.
 * The server extracts structured terms/line-items with GPT-4o, then
 * cross-references them to flag overcharges, missed discounts, escalator
 * violations, duplicate fees, and auto-renewal risk.
 *
 * Accounts, audit history, and per-plan monthly limits are backed by Postgres
 * (or PGlite in tests). See db/ and lib/auth.js, lib/audits.js, lib/plans.js.
 *
 * Usage:
 *   npm install
 *   cp .env.example .env   (then fill in OPENAI_API_KEY and DATABASE_URL)
 *   npm start
 *   Open: http://localhost:3001
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

import { hasApiKey } from './lib/openai.js';
import { fileToText, classifyAndGroup } from './lib/extract.js';
import { runAudit } from './lib/pipeline.js';
import { buildReportPdf } from './lib/report.js';
import { hasDb, runMigrations } from './db/index.js';
import {
  SESSION_COOKIE,
  attachUser,
  requireAuth,
  createUser,
  findUserByEmail,
  verifyPassword,
  createSession,
  destroySession,
  sessionCookieOptions,
} from './lib/auth.js';
import { saveAudit, listAudits, getAudit, auditsThisMonth } from './lib/audits.js';
import { planFor } from './lib/plans.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

if (!hasApiKey()) {
  console.error('\n⚠️  OPENAI_API_KEY is not set in .env — analysis will not work.\n');
}

// ── Security headers ─────────────────────────────────────────
// CSP allows the Google Fonts the UI loads and the inline SVG data-URI used
// as the desk-texture background.
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
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));

// Optional HTTP Basic Auth gate (defence in depth; leave unset to disable).
app.use(basicAuth);

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use('/samples', express.static(join(__dirname, 'samples')));

// Attach req.user (or null) from the session cookie on every request.
app.use(attachUser);

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
  res.json({ ready: hasApiKey(), accounts: hasDb() });
});

// ── Auth ──────────────────────────────────────────────────────
app.post('/api/auth/register', requireDb, sameOrigin, async (req, res) => {
  try {
    const { email, password, name, company } = req.body || {};
    if (!validEmail(email) || !validPassword(password)) {
      return res
        .status(400)
        .json({ error: 'Enter a valid email and a password of at least 8 characters.' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const user = await createUser({ email, password, name, company });
    await startSession(res, user.id);
    res.json({ user: publicUser(user), usage: await usageFor(user) });
  } catch (e) {
    console.error('/api/auth/register error:', e);
    res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', requireDb, sameOrigin, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await findUserByEmail(email || '');
    if (!user || !(await verifyPassword(password || '', user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    await startSession(res, user.id);
    res.json({ user: publicUser(user), usage: await usageFor(user) });
  } catch (e) {
    console.error('/api/auth/login error:', e);
    res.status(500).json({ error: 'Could not sign you in. Please try again.' });
  }
});

app.post('/api/auth/logout', sameOrigin, async (req, res) => {
  try {
    await destroySession(req.cookies?.[SESSION_COOKIE]);
  } catch (e) {
    console.error('/api/auth/logout error:', e);
  }
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), usage: await usageFor(req.user) });
});

// ── /api/analyze — extract + cross-reference contract vs invoices ──
app.post(
  '/api/analyze',
  requireDb,
  sameOrigin,
  requireAuth,
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

      if (!(await withinQuota(req, res))) return;

      let contractText = await fileToText(contractFile);
      for (const file of supportingFiles) {
        const text = await fileToText(file);
        contractText += `\n\n===== SUPPORTING DOCUMENT: ${file.originalname} =====\n\n${text}`;
      }

      const invoiceTexts = [];
      for (const file of invoiceFiles) {
        invoiceTexts.push(await fileToText(file));
      }

      const data = await runAudit(contractText, invoiceTexts);
      await saveAudit(req.user.id, {
        vendor: data.contract?.vendor,
        mode: 'single',
        summary: data.summary,
        result: data,
      });

      res.json({ ...data, usage: await usageFor(req.user) });
    } catch (e) {
      console.error('/api/analyze error:', e);
      res
        .status(500)
        .json({ error: 'Something went wrong while processing your request. Please try again.' });
    }
  }
);

// ── /api/analyze-sample — run the bundled demo contract + invoice ──
app.post('/api/analyze-sample', requireDb, sameOrigin, requireAuth, analyzeLimiter, async (req, res) => {
  if (!hasApiKey()) {
    return res.status(503).json({ error: 'Server has no OpenAI key configured.' });
  }

  try {
    if (!(await withinQuota(req, res))) return;

    const contractText = await readFile(join(__dirname, 'samples', 'contract.txt'), 'utf8');
    const mouText = await readFile(join(__dirname, 'samples', 'mou.txt'), 'utf8');
    const invoiceText = await readFile(join(__dirname, 'samples', 'invoice.txt'), 'utf8');

    const combinedContract = `${contractText}\n\n===== SUPPORTING DOCUMENT: mou.txt =====\n\n${mouText}`;
    const data = await runAudit(combinedContract, [invoiceText]);
    await saveAudit(req.user.id, {
      vendor: data.contract?.vendor,
      mode: 'single',
      summary: data.summary,
      result: data,
    });

    res.json({ ...data, usage: await usageFor(req.user) });
  } catch (e) {
    console.error('/api/analyze-sample error:', e);
    res
      .status(500)
      .json({ error: 'Something went wrong while processing your request. Please try again.' });
  }
});

// ── /api/analyze-bulk — auto-sort a pile of files by vendor, then audit each ──
app.post(
  '/api/analyze-bulk',
  requireDb,
  sameOrigin,
  requireAuth,
  analyzeLimiter,
  upload.array('files', 30),
  async (req, res) => {
    if (!hasApiKey()) {
      return res.status(503).json({ error: 'Server has no OpenAI key configured.' });
    }

    const plan = planFor(req.user.plan);
    if (!plan.bulk) {
      return res
        .status(403)
        .json({ error: `Bulk upload is available on the Pro plan. You're on ${plan.label}.` });
    }

    try {
      const files = req.files || [];
      if (files.length < 2) {
        return res
          .status(400)
          .json({ error: 'Please upload at least one contract and one invoice.' });
      }

      if (!(await withinQuota(req, res))) return;

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

          const data = await runAudit(
            contractText,
            invoiceDocs.map((d) => d.text)
          );

          return { vendor: group.vendor, files: fileNames, ...data };
        })
      );

      const unmatchedFiles = unmatched.map((i) => docs[i]?.filename).filter(Boolean);

      const completed = results.filter((r) => !r.incomplete);
      const aggregate = {
        totalAnnualImpactUsd: completed.reduce(
          (s, r) => s + (Number(r.summary?.totalAnnualImpactUsd) || 0),
          0
        ),
        findingCount: completed.reduce((s, r) => s + (Number(r.summary?.findingCount) || 0), 0),
      };
      await saveAudit(req.user.id, {
        vendor: `${results.length} vendor${results.length === 1 ? '' : 's'}`,
        mode: 'bulk',
        summary: aggregate,
        result: { results, unmatchedFiles },
      });

      res.json({ results, unmatchedFiles, usage: await usageFor(req.user) });
    } catch (e) {
      console.error('/api/analyze-bulk error:', e);
      res
        .status(500)
        .json({ error: 'Something went wrong while processing your request. Please try again.' });
    }
  }
);

// ── /api/audits — list & re-view past audits ──────────────────
app.get('/api/audits', requireDb, requireAuth, async (req, res) => {
  try {
    const audits = (await listAudits(req.user.id)).map((a) => ({
      ...a,
      annualImpact: Number(a.annualImpact) || 0,
    }));
    res.json({ audits });
  } catch (e) {
    console.error('/api/audits error:', e);
    res.status(500).json({ error: 'Could not load your audit history.' });
  }
});

app.get('/api/audits/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const audit = await getAudit(req.user.id, req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found.' });
    res.json({
      id: audit.id,
      vendor: audit.vendor,
      mode: audit.mode,
      createdAt: audit.createdAt,
      result: audit.result,
    });
  } catch (e) {
    console.error('/api/audits/:id error:', e);
    res.status(500).json({ error: 'Could not load that audit.' });
  }
});

// ── /api/report — render an analysis result as a PDF audit report ──
app.post('/api/report', requireAuth, sameOrigin, (req, res) => {
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
    res
      .status(500)
      .json({ error: 'Something went wrong while processing your request. Please try again.' });
  }
});

// ── Helpers ───────────────────────────────────────────────────
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, company: u.company, plan: u.plan };
}

async function usageFor(user) {
  const plan = planFor(user.plan);
  const used = await auditsThisMonth(user.id);
  return {
    plan: plan.key,
    planLabel: plan.label,
    bulk: plan.bulk,
    used,
    limit: plan.monthlyAudits === Infinity ? null : plan.monthlyAudits,
  };
}

// Returns true if the user is under their monthly quota; otherwise writes a
// 402 response and returns false.
async function withinQuota(req, res) {
  const plan = planFor(req.user.plan);
  const used = await auditsThisMonth(req.user.id);
  if (used >= plan.monthlyAudits) {
    res.status(402).json({
      error: `You've used all ${plan.monthlyAudits} audits on the ${plan.label} plan this month. Upgrade for more.`,
    });
    return false;
  }
  return true;
}

async function startSession(res, userId) {
  const { token } = await createSession(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function requireDb(req, res, next) {
  if (!hasDb()) {
    return res.status(503).json({ error: 'Accounts are not configured on this server.' });
  }
  next();
}

// Lightweight CSRF guard: reject browser POSTs whose Origin isn't same-origin.
// Combined with the SameSite=Lax session cookie. Non-browser callers (no
// Origin header) pass through.
function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.get('host')) return next();
  } catch {
    /* fall through */
  }
  return res.status(403).json({ error: 'Cross-origin request blocked.' });
}

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8;
}

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

// ── Boot ──────────────────────────────────────────────────────
if (hasDb()) {
  try {
    await runMigrations();
    console.log('🗄️   Database: ✓ connected, migrations applied');
  } catch (e) {
    console.error('🗄️   Database: ✗ migration failed —', e.message);
  }
} else {
  console.warn('🗄️   Database: ✗ DATABASE_URL not set — accounts & history disabled');
}

app.listen(PORT, () => {
  console.log(`\n✅  ClauseGuard running at http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${hasApiKey() ? '✓ loaded from .env' : '✗ NOT SET — add OPENAI_API_KEY to .env'}`);
  console.log(`   Auth gate:  ${BASIC_USER && BASIC_PASS ? '✓ Basic Auth enabled' : '✗ open (set BASIC_AUTH_USER/PASS to lock down)'}`);
  console.log(`   Rate limit: ${Number(process.env.ANALYZE_RATE_LIMIT) || 20} analyses / IP / hour\n`);
});
