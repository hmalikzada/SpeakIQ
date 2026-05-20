/**
 * SpeakIQ — Backend Proxy Server
 *
 * Keeps the OpenAI key server-side so it is never exposed to the browser.
 * The frontend talks to /api/* routes; this server proxies to OpenAI.
 *
 * Usage:
 *   npm install
 *   cp .env.example .env   (then fill in OPENAI_API_KEY)
 *   npm start
 *   Open: http://localhost:3000
 */

import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import fetch   from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;
const KEY  = process.env.OPENAI_API_KEY;

if (!KEY) {
  console.error('\n⚠️  OPENAI_API_KEY is not set in .env — AI features will not work.\n');
}

app.use(cors({ origin: `http://localhost:${PORT}` }));
app.use(express.json({ limit: '4mb' }));

// Serve the static SpeakIQ frontend from the same folder
app.use(express.static(__dirname));

// ── /api/chat — GPT-4o coaching feedback (streaming) ─────────
app.post('/api/chat', async (req, res) => {
  if (!KEY) return res.status(503).json({ error: { message: 'Server has no OpenAI key configured.' } });
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body:    JSON.stringify(req.body),
    });
    // Pass status + headers through, then pipe the stream
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    upstream.body.pipe(res);
  } catch (e) {
    console.error('/api/chat error:', e.message);
    res.status(502).json({ error: { message: 'Proxy error: ' + e.message } });
  }
});

// ── /api/tts — OpenAI TTS (gpt-4o-mini-tts audio) ────────────
app.post('/api/tts', async (req, res) => {
  if (!KEY) return res.status(503).json({ error: { message: 'Server has no OpenAI key configured.' } });
  try {
    const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body:    JSON.stringify(req.body),
    });
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    upstream.body.pipe(res);
  } catch (e) {
    console.error('/api/tts error:', e.message);
    res.status(502).json({ error: { message: 'Proxy error: ' + e.message } });
  }
});

// ── /api/transcribe — Whisper transcription (for non-Chrome browsers) ──
app.post('/api/transcribe', async (req, res) => {
  if (!KEY) return res.status(503).json({ error: { message: 'Server has no OpenAI key configured.' } });
  try {
    // req.body should be forwarded as multipart from the client
    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': req.headers['content-type'] },
      body:    req,
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    console.error('/api/transcribe error:', e.message);
    res.status(502).json({ error: { message: 'Proxy error: ' + e.message } });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅  SpeakIQ running at http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${KEY ? '✓ loaded from .env' : '✗ NOT SET — add OPENAI_API_KEY to .env'}\n`);
});
