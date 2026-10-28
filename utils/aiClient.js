import dotenv from 'dotenv';
import AiKeyUsage from '../models/AiKeyUsage.js';

dotenv.config();

/**
 * AI Provider Service with Failover Chain
 * Gemini 1 -> Gemini 2 -> Gemini 3 -> Groq -> User-friendly fallback
 */

const GEMINI_MODEL = 'gemini-3.8-flash';
const GROQ_MODEL = 'openai/gpt-oss-120b';

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

async function recordKeyUsage(keyId, isRateLimit = false, isError = false) {
  try {
    const today = getTodayString();
    const inc = { requestCount: 1 };
    if (isRateLimit) inc.rateLimitCount = 1;
    if (isError) inc.errorCount = 1;

    await AiKeyUsage.findOneAndUpdate(
      { keyIdentifier: keyId, date: today },
      { $inc: inc, $set: { lastUsedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    // Non-blocking usage tracking
  }
}

/**
 * Call Gemini API with a specific key
 */
async function callGemini(apiKey, keyIdentifier, prompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000), // 45s timeout
  });

  if (res.status === 429) {
    await recordKeyUsage(keyIdentifier, true, true);
    throw new Error(`Gemini ${keyIdentifier} Rate Limit (429)`);
  }

  if (!res.ok) {
    await recordKeyUsage(keyIdentifier, false, true);
    const errText = await res.text();
    throw new Error(`Gemini ${keyIdentifier} HTTP ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  await recordKeyUsage(keyIdentifier, false, false);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini ${keyIdentifier} returned empty content`);
  }

  return JSON.parse(text);
}

/**
 * Call Groq API with Groq key
 */
async function callGroq(apiKey, prompt, systemInstruction) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30000), // 30s timeout
  });

  if (res.status === 429) {
    await recordKeyUsage('groq', true, true);
    throw new Error('Groq Rate Limit (429)');
  }

  if (!res.ok) {
    await recordKeyUsage('groq', false, true);
    const errText = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  await recordKeyUsage('groq', false, false);

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq returned empty content');
  }

  return JSON.parse(text);
}

/**
 * Unified AI JSON caller with full failover rotation
 */
export async function executeAiJsonWithFailover({ prompt, systemInstruction = '', taskType = 'heavy' }) {
  const providers = [];

  // For fast/short tasks (explanations), Groq can be first, otherwise Gemini 1 -> 2 -> 3 -> Groq
  const gemini1 = process.env.GEMINI_KEY_1;
  const gemini2 = process.env.GEMINI_KEY_2;
  const gemini3 = process.env.GEMINI_KEY_3;
  const groq = process.env.GROQ_KEY;

  if (taskType === 'fast' && groq) {
    providers.push({ name: 'groq', fn: () => callGroq(groq, prompt, systemInstruction) });
  }

  if (gemini1) providers.push({ name: 'gemini_1', fn: () => callGemini(gemini1, 'gemini_1', prompt, systemInstruction) });
  if (gemini2) providers.push({ name: 'gemini_2', fn: () => callGemini(gemini2, 'gemini_2', prompt, systemInstruction) });
  if (gemini3) providers.push({ name: 'gemini_3', fn: () => callGemini(gemini3, 'gemini_3', prompt, systemInstruction) });

  if (taskType !== 'fast' && groq) {
    providers.push({ name: 'groq', fn: () => callGroq(groq, prompt, systemInstruction) });
  }

  const errors = [];

  for (const provider of providers) {
    try {
      console.log(`🤖 Invoking AI provider: ${provider.name} for task: ${taskType}`);
      const result = await provider.fn();
      return { result, providerName: provider.name };
    } catch (err) {
      console.warn(`⚠️ Provider ${provider.name} failed: ${err.message}. Rotating to next in chain…`);
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  const friendlyError = new Error('The AI question engine is experiencing high demand right now. Please try again in a little while.');
  friendlyError.details = errors;
  friendlyError.status = 503;
  throw friendlyError;
}
