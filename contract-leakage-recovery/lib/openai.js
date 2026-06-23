/**
 * Thin wrapper around the OpenAI Chat Completions API for structured
 * (JSON-mode) extraction and analysis calls.
 *
 * Uses the Node 18+ global fetch with an abort-based timeout and
 * exponential-backoff retries on rate-limit / transient upstream errors.
 */

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 60000;
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES) || 3;

export function hasApiKey() {
  return Boolean(KEY);
}

/**
 * Calls the chat completions API in JSON mode and returns the parsed object.
 */
export async function chatJSON(messages, opts = {}) {
  const content = await chatCompletion(messages, { ...opts, json: true });
  return JSON.parse(content);
}

/**
 * Calls the chat completions API for a plain-text response. Supports multimodal
 * content parts (e.g. a `{ type: 'file', file: { file_data } }` PDF part) so the
 * model can OCR scanned documents. Returns the raw string content.
 */
export async function chatText(messages, opts = {}) {
  return chatCompletion(messages, { ...opts, json: false });
}

/**
 * Shared request loop: abort-based timeout + exponential-backoff retries on
 * rate-limit / transient upstream errors. Returns the raw message content.
 */
async function chatCompletion(messages, { model = MODEL, temperature = 0, json = false } = {}) {
  if (!KEY) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff before retrying: 1s, 2s, 4s …
      await sleep(1000 * 2 ** (attempt - 1));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages,
        }),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        const body = await upstream.text();
        // Retry rate-limits and server errors; fail fast on 4xx client errors.
        if ((upstream.status === 429 || upstream.status >= 500) && attempt < MAX_RETRIES) {
          lastError = new Error(`OpenAI API error (${upstream.status})`);
          continue;
        }
        throw new Error(`OpenAI API error (${upstream.status}): ${body}`);
      }

      const data = await upstream.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned an empty response.');
      }

      return content;
    } catch (err) {
      // Timeouts (AbortError) and network failures (TypeError from fetch) are retryable.
      const retryable = err.name === 'AbortError' || err.name === 'TypeError';
      if (retryable && attempt < MAX_RETRIES) {
        lastError =
          err.name === 'AbortError'
            ? new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS}ms`)
            : err;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('OpenAI request failed after retries.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
