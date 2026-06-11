/**
 * Thin wrapper around the OpenAI Chat Completions API for structured
 * (JSON-mode) extraction and analysis calls.
 */
import fetch from 'node-fetch';

const KEY = process.env.OPENAI_API_KEY;

export function hasApiKey() {
  return Boolean(KEY);
}

/**
 * Calls the chat completions API in JSON mode and returns the parsed object.
 */
export async function chatJSON(messages, { model = 'gpt-4o', temperature = 0 } = {}) {
  if (!KEY) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    throw new Error(`OpenAI API error (${upstream.status}): ${body}`);
  }

  const data = await upstream.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response.');
  }

  return JSON.parse(content);
}
