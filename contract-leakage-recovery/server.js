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
import { draftDisputeLetter } from './lib/matcher.js';
import { buildReportPdf } from './lib/report.js';
import { hasDb, runMigrations } from './db/index.js';
import {
  SESSION_COOKIE,
  attachUser,
  requireAuth,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByStripeCustomer,
  updateUser,
  verifyPassword,
  createSession,
  destroySession,
  sessionCookieOptions,
} from './lib/auth.js';
import { saveAudit, listAudits, getAudit, auditsThisMonth } from './lib/audits.js';
import { planFor, publicPlans } from './lib/plans.js';
import {
  stripe,
  WEBHOOK_SECRET,
  billingEnabled,
  priceIdForPlan,
  planForPriceId,
} from './lib/billing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Railway's proxy: trust X-Forwarded-Proto so req.protocol is https
// (used to build Stripe redirect URLs) and rate-limiting sees the real IP.
app.set('trust proxy', 1);

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

// Stripe webhook — must run BEFORE the JSON body parser (it needs the raw body
// for signature verification) and BEFORE the Basic Auth gate (Stripe can't send
// credentials). Registered as a route so it only intercepts its own path.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// Optional HTTP Basic Auth gate (defence in depth; leave unset to disable).
app.use(basicAuth);

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use('/samples', express.static(join(__dirname, 'samples')));

// Attach req.user (or null) from the session cookie on every request.
app.use(attachUser);

// Only accept the document types the extractors can actually read.
const ALLOWED_UPLOAD_EXT = /\.(pdf|docx|txt|csv)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_EXT.test(file.originalname || '')) return cb(null, true);
    cb(new Error('UNSUPPORTED_FILE_TYPE'));
  },
});

// Caps OpenAI-backed spend: per-IP limit on the expensive analysis endpoints.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.ANALYZE_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests. Please try again later.' },
});

// Slows credential stuffing / brute force and free-account farming.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Letter drafting is cheaper than a full audit but still an OpenAI call.
const letterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.LETTER_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many letter requests. Please try again later.' },
});

// ── /api/status ───────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ ready: hasApiKey(), accounts: hasDb() });
});

// ── Auth ──────────────────────────────────────────────────────
app.post('/api/auth/register', requireDb, sameOrigin, authLimiter, async (req, res) => {
  try {
    const { email, password, name, company } = req.body || {};
    if (!validEmail(email) || !validPassword(password)) {
      return res
        .status(400)
        .json({ error: 'Enter a valid email and a password of 8–72 characters.' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const user = await createUser({
      email,
      password,
      name: String(name).slice(0, 120),
      company: company ? String(company).slice(0, 120) : company,
    });
    await startSession(res, user.id);
    res.json({ user: publicUser(user), usage: await usageFor(user) });
  } catch (e) {
    console.error('/api/auth/register error:', e);
    res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', requireDb, sameOrigin, authLimiter, async (req, res) => {
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
  if (!req.user) return res.json({ user: null, billingEnabled: billingEnabled() });
  res.json({
    user: publicUser(req.user),
    usage: await usageFor(req.user),
    billingEnabled: billingEnabled(),
  });
});

// ── Billing ───────────────────────────────────────────────────
app.get('/api/plans', (req, res) => {
  res.json({ plans: publicPlans(), billingEnabled: billingEnabled() });
});

// Start a Stripe Checkout session to subscribe to a paid plan.
app.post('/api/billing/checkout', requireDb, sameOrigin, requireAuth, async (req, res) => {
  if (!billingEnabled()) {
    return res.status(503).json({ error: 'Billing is not configured on this server.' });
  }
  try {
    const { plan } = req.body || {};
    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      return res.status(400).json({ error: 'That plan is not available for checkout.' });
    }

    // A second Checkout would create a second, parallel subscription (double
    // billing). Existing subscribers switch plans through the Customer Portal.
    if (
      req.user.stripeSubscriptionId &&
      ['active', 'trialing', 'past_due'].includes(req.user.subscriptionStatus)
    ) {
      return res.status(409).json({
        error: 'You already have an active subscription — use "Manage billing" to change plans.',
      });
    }

    const customerId = await ensureStripeCustomer(req.user);
    const base = baseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.user.id,
      metadata: { userId: req.user.id, plan },
      success_url: `${base}/?upgraded=1`,
      cancel_url: `${base}/?canceled=1`,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('/api/billing/checkout error:', e);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Open the Stripe Customer Portal so users manage/cancel their subscription.
app.post('/api/billing/portal', requireDb, sameOrigin, requireAuth, async (req, res) => {
  if (!billingEnabled()) {
    return res.status(503).json({ error: 'Billing is not configured on this server.' });
  }
  try {
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account yet — subscribe to a plan first.' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: baseUrl(req),
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('/api/billing/portal error:', e);
    res.status(500).json({ error: 'Could not open the billing portal. Please try again.' });
  }
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

// ── /api/dispute-letter — draft a vendor dispute email from a finding ──
app.post('/api/dispute-letter', requireDb, sameOrigin, requireAuth, letterLimiter, async (req, res) => {
  if (!hasApiKey()) {
    return res.status(503).json({ error: 'Server has no OpenAI key configured.' });
  }
  try {
    const { vendor, contract, finding } = req.body || {};
    if (!finding || typeof finding !== 'object') {
      return res.status(400).json({ error: 'Missing finding to dispute.' });
    }
    const letter = await draftDisputeLetter({
      vendor,
      contract,
      finding,
      sender: { name: req.user.name, company: req.user.company },
    });
    res.json({ letter });
  } catch (e) {
    console.error('/api/dispute-letter error:', e);
    res
      .status(500)
      .json({ error: 'Something went wrong while drafting the letter. Please try again.' });
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

function baseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// Reuse the user's Stripe customer, creating one on first checkout.
async function ensureStripeCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id },
  });
  await updateUser(user.id, { stripeCustomerId: customer.id });
  user.stripeCustomerId = customer.id;
  return customer.id;
}

// Stripe webhook: keep the user's plan in sync with their subscription.
async function stripeWebhook(req, res) {
  if (!billingEnabled() || !WEBHOOK_SECRET) return res.status(503).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), WEBHOOK_SECRET);
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const userId = s.client_reference_id || s.metadata?.userId;
        if (userId) {
          await updateUser(userId, {
            stripeCustomerId: idOf(s.customer),
            stripeSubscriptionId: idOf(s.subscription),
            subscriptionStatus: 'active',
            ...(s.metadata?.plan ? { plan: s.metadata.plan } : {}),
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const user = await findUserByStripeCustomer(idOf(sub.customer));
        if (user) {
          const plan = planForPriceId(sub.items?.data?.[0]?.price?.id);
          const active = ['active', 'trialing'].includes(sub.status);
          await updateUser(user.id, {
            stripeSubscriptionId: sub.id,
            subscriptionStatus: sub.status,
            plan: active && plan ? plan : active ? user.plan : 'free',
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const user = await findUserByStripeCustomer(idOf(sub.customer));
        if (user) {
          await updateUser(user.id, {
            plan: 'free',
            subscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
          });
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Stripe webhook handler error:', e);
    res.status(500).end();
  }
}

// Stripe fields can be an id string or an expanded object.
function idOf(v) {
  if (!v) return undefined;
  return typeof v === 'string' ? v : v.id;
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
  return (
    typeof email === 'string' &&
    email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

// Upper bound matches bcrypt's 72-byte input limit (it silently truncates past that).
function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && Buffer.byteLength(pw, 'utf8') <= 72;
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

// ── Error handler — keep upload/body-parser failures as clean JSON ──
// Without this, an oversized file or malformed JSON body falls through to
// Express's default handler and returns an HTML stack page.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'One of your files is larger than the 15MB limit.'
        : `Upload error: ${err.message}.`;
    return res.status(400).json({ error: msg });
  }
  if (err.message === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ error: 'Unsupported file type — upload PDF, DOCX, TXT, or CSV files.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

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

const server = app.listen(PORT, () => {
  console.log(`\n✅  ClauseGuard running at http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${hasApiKey() ? '✓ loaded from .env' : '✗ NOT SET — add OPENAI_API_KEY to .env'}`);
  console.log(`   Auth gate:  ${BASIC_USER && BASIC_PASS ? '✓ Basic Auth enabled' : '✗ open (set BASIC_AUTH_USER/PASS to lock down)'}`);
  console.log(`   Billing:    ${billingEnabled() ? '✓ Stripe connected' : '✗ not configured (set STRIPE_SECRET_KEY)'}`);
  console.log(`   Rate limit: ${Number(process.env.ANALYZE_RATE_LIMIT) || 20} analyses / IP / hour\n`);
});

// Railway sends SIGTERM on redeploy — stop accepting connections, let
// in-flight requests finish, then exit.
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
});
