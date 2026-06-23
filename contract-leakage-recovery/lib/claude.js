/**
 * Minimal Anthropic (Claude) client. Used ONLY to read scanned/image PDFs that
 * pdf-parse and GPT-4o can't make out — Claude transcribes them to plain text,
 * which the existing GPT-4o pipeline then extracts and analyses. This keeps
 * Claude usage to the bare minimum (no text PDFs, .docx, .txt or .csv ever hit it).
 */

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const REQUEST_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS) || 60000;
const MAX_RETRIES = Number(process.env.ANTHROPIC_MAX_RETRIES) || 2;

export function hasClaude() {
  return Boolean(KEY);
}

const TRANSCRIBE_PROMPT =
  'Transcribe this document VERBATIM as plain text. Preserve every number, date, ' +
  'line item, label, balance-forward / charges-table row, and reference number exactly ' +
  'as printed — especially small amounts inside dense tables. Do not summarise, interpret, ' +
  'reorder, or omit anything. Output only the transcription.';

/**
 * Sends a PDF to Claude (which reads scanned/image PDFs well) and returns a
 * verbatim plain-text transcription.
 */
export async function transcribePdf(buffer) {
  if (!KEY) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const data = buffer.toString('base64');
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
                { type: 'text', text: TRANSCRIBE_PROMPT },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          lastError = new Error(`Anthropic API error (${res.status})`);
          continue;
        }
        throw new Error(`Anthropic API error (${res.status}): ${body}`);
      }

      const json = await res.json();
      const text = json.content?.find((b) => b.type === 'text')?.text;
      if (!text) throw new Error('Anthropic returned an empty response.');
      return text;
    } catch (err) {
      const retryable = err.name === 'AbortError' || err.name === 'TypeError';
      if (retryable && attempt < MAX_RETRIES) {
        lastError = err;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Anthropic request failed after retries.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
