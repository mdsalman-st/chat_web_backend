import dotenv from 'dotenv';
import AiKeyUsage from '../models/AiKeyUsage.js';

dotenv.config();

/**
 * AI Provider Service with Multi-Provider Failover & New Model Support
 * Providers: Groq, Gemini (3 keys), Cloudflare Workers AI, NVIDIA NIM
 */

// Model Configurations
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/muse-glimmer-30b';

const providerCooldowns = new Map();
const providerFamilyCooldowns = new Map();
const providerTokenAverages = new Map();
let nextProviderIndex = 0;
const MAX_INLINE_COOLDOWN_WAIT_MS = 10_000;
const TIMEOUT_MS = 60000; // 60s for question generation

function providerFamily(providerName) {
  if (providerName.startsWith('gemini_')) return 'gemini';
  if (providerName.startsWith('cloudflare')) return 'cloudflare';
  if (providerName.startsWith('nvidia')) return 'nvidia';
  return providerName;
}

function providerMinIntervalMs(providerName) {
  const family = providerFamily(providerName);
  if (family === 'gemini') return Number(process.env.AI_GEMINI_MIN_INTERVAL_MS) || 7_000;
  if (family === 'groq') return Number(process.env.AI_GROQ_MIN_INTERVAL_MS) || 3_000;
  if (family === 'cloudflare') return Number(process.env.AI_CLOUDFLARE_MIN_INTERVAL_MS) || 1_000;
  if (family === 'nvidia') return Number(process.env.AI_NVIDIA_MIN_INTERVAL_MS) || 2_000;
  return 2_000;
}

function providerReadyAt(providerName) {
  return Math.max(
    providerCooldowns.get(providerName) || 0,
    providerFamilyCooldowns.get(providerFamily(providerName)) || 0,
  );
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) && retryAt > now ? retryAt - now : null;
}

function parseResetDuration(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const match = String(value).match(/^(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  return (Number(match[1] || 0) * 60 + Number(match[2] || 0)) * 1000;
}

export function getProviderRetryDelayMs({ status, headers, body = '', now = Date.now() }) {
  const headerDelay = parseRetryAfter(headers?.get?.('retry-after'), now);
  if (headerDelay) return headerDelay;

  const retryDelay = body.match(/"retryDelay"\s*:\s*"([^"]+)"/i)?.[1];
  if (retryDelay) {
    const parsedDelay = parseResetDuration(retryDelay);
    if (parsedDelay) return parsedDelay;
  }

  if (status === 429) return 60_000;
  if ([502, 503, 504].includes(status)) return 30_000;
  return 0;
}

function applyProviderCooldown(providerName, delayMs) {
  if (delayMs > 0) {
    const readyAt = Date.now() + delayMs;
    providerCooldowns.set(providerName, Math.max(providerCooldowns.get(providerName) || 0, readyAt));
    const family = providerFamily(providerName);
    providerFamilyCooldowns.set(family, Math.max(providerFamilyCooldowns.get(family) || 0, readyAt));
  }
}

async function fetchFromProvider(providerName, url, options) {
  const waitMs = providerReadyAt(providerName) - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  try {
    return await fetch(url, options);
  } finally {
    applyProviderCooldown(providerName, providerMinIntervalMs(providerName));
  }
}

export function getGroqQuotaCooldownMs(headers, totalTokens, averageTokens = totalTokens) {
  const rawRequestRemaining = headers.get('x-ratelimit-remaining-requests');
  const rawTokenRemaining = headers.get('x-ratelimit-remaining-tokens');
  const requestRemaining = rawRequestRemaining === null ? NaN : Number(rawRequestRemaining);
  const tokenRemaining = rawTokenRemaining === null ? NaN : Number(rawTokenRemaining);
  const requestResetMs = parseResetDuration(headers.get('x-ratelimit-reset-requests'));
  const tokenResetMs = parseResetDuration(headers.get('x-ratelimit-reset-tokens'));
  const cooldowns = [];
  if (requestRemaining === 0) cooldowns.push(requestResetMs || 60_000);
  if (Number.isFinite(tokenRemaining) && tokenRemaining <= averageTokens * 1.2) {
    cooldowns.push(tokenResetMs || 60_000);
  }
  return cooldowns.length ? Math.max(...cooldowns) : 0;
}

async function recordGroqQuotaCooldown(headers, totalTokens) {
  const previousAverage = providerTokenAverages.get('groq') || totalTokens;
  const averageTokens = Math.max(1, Math.round(previousAverage * 0.7 + totalTokens * 0.3));
  providerTokenAverages.set('groq', averageTokens);
  const cooldownMs = getGroqQuotaCooldownMs(headers, totalTokens, averageTokens);
  applyProviderCooldown('groq', cooldownMs);
  if (cooldownMs > 0) {
    await recordKeyUsage('groq', false, false, new Date(Date.now() + cooldownMs));
  }
}

function createProviderError(message, status, retryAfterMs) {
  const error = new Error(message);
  error.status = status;
  error.retryAfterMs = retryAfterMs;
  return error;
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

async function recordKeyUsage(keyId, isRateLimit = false, isError = false, cooldownUntil = null) {
  try {
    if (!AiKeyUsage) return;
    const today = getTodayString();
    const inc = { requestCount: 1 };
    if (isRateLimit) inc.rateLimitCount = 1;
    if (isError) inc.errorCount = 1;
    const set = { lastUsedAt: new Date() };
    if (cooldownUntil) set.cooldownUntil = cooldownUntil;

    await AiKeyUsage.findOneAndUpdate(
      { keyIdentifier: keyId, date: today },
      { $inc: inc, $set: set },
      { upsert: true }
    );
  } catch (error) {
    // Non-fatal logging
  }
}

async function restorePersistedCooldowns(providerNames) {
  try {
    if (!AiKeyUsage) return;
    const now = new Date();
    const records = await AiKeyUsage.find({
      keyIdentifier: { $in: providerNames },
      cooldownUntil: { $gt: now },
    })
      .select('keyIdentifier cooldownUntil')
      .lean();

    for (const record of records) {
      const readyAt = new Date(record.cooldownUntil).getTime();
      const providerName = record.keyIdentifier;
      providerCooldowns.set(providerName, Math.max(providerCooldowns.get(providerName) || 0, readyAt));
      const family = providerFamily(providerName);
      providerFamilyCooldowns.set(family, Math.max(providerFamilyCooldowns.get(family) || 0, readyAt));
    }
  } catch (e) {
    // Non-fatal
  }
}

// Clean helper to safely extract JSON from LLM output (handles codeblocks ```json ... ```)
function extractJson(text) {
  if (text && typeof text === 'object') return text;
  if (!text) throw new Error('AI returned empty response');
  const clean = typeof text === 'string' ? text.trim() : JSON.stringify(text);
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      return JSON.parse(match[1].trim());
    }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
    }
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
    }
    throw new Error(`Failed to parse AI response as JSON: ${clean.slice(0, 150)}`);
  }
}

// ==========================================
// 1. GROQ PROVIDER
// ==========================================
async function callGroq(apiKey, prompt, systemInstruction, timeoutMs = TIMEOUT_MS) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const messages = [];
  const sysContent = (systemInstruction ? `${systemInstruction}\n` : '') + 'You are an educational examination question generator. You must return strictly valid JSON matching the requested schema.';
  messages.push({ role: 'system', content: sysContent });
  messages.push({ role: 'user', content: prompt });

  const res = await fetchFromProvider('groq', url, {
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
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    const isRateLimit = res.status === 429;
    const retryAfterMs = getProviderRetryDelayMs({ status: res.status, headers: res.headers, body: errText });
    applyProviderCooldown('groq', retryAfterMs);
    await recordKeyUsage('groq', isRateLimit, true, retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs) : null);
    throw createProviderError(
      isRateLimit ? 'Groq Rate Limit (429)' : `Groq HTTP ${res.status}: ${errText.slice(0, 150)}`,
      res.status,
      retryAfterMs,
    );
  }

  const data = await res.json();
  const usageTokens = Number(data.usage?.total_tokens) || 1;
  await recordGroqQuotaCooldown(res.headers, usageTokens);
  await recordKeyUsage('groq', false, false);

  const text = data.choices?.[0]?.message?.content;
  return extractJson(text);
}

// ==========================================
// 2. GEMINI PROVIDER (with 3-key failover)
// ==========================================
async function callGemini(apiKey, keyIdentifier, prompt, systemInstruction, timeoutMs = TIMEOUT_MS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetchFromProvider(keyIdentifier, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    const isRateLimit = res.status === 429;
    const retryAfterMs = getProviderRetryDelayMs({ status: res.status, headers: res.headers, body: errText });
    applyProviderCooldown(keyIdentifier, retryAfterMs);
    await recordKeyUsage(keyIdentifier, isRateLimit, true, retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs) : null);
    throw createProviderError(
      isRateLimit
        ? `Gemini ${keyIdentifier} Rate Limit (429)`
        : `Gemini ${keyIdentifier} HTTP ${res.status}: ${errText.slice(0, 150)}`,
      res.status,
      retryAfterMs,
    );
  }

  const data = await res.json();
  await recordKeyUsage(keyIdentifier, false, false);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJson(text);
}

// ==========================================
// 3. CLOUDFLARE WORKERS AI PROVIDER
// ==========================================
async function callCloudflare(apiKey, accountId, prompt, systemInstruction, timeoutMs = TIMEOUT_MS) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`;
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction + '\nOutput ONLY strictly valid JSON. Do not write explanations.' });
  } else {
    messages.push({ role: 'system', content: 'Output ONLY strictly valid JSON.' });
  }
  messages.push({ role: 'user', content: prompt });

  const res = await fetchFromProvider('cloudflare', url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages,
      max_tokens: 3000,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    const isRateLimit = res.status === 429;
    const retryAfterMs = getProviderRetryDelayMs({ status: res.status, headers: res.headers, body: errText });
    applyProviderCooldown('cloudflare', retryAfterMs);
    await recordKeyUsage('cloudflare', isRateLimit, true, retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs) : null);
    throw createProviderError(
      isRateLimit ? 'Cloudflare AI Rate Limit (429)' : `Cloudflare AI HTTP ${res.status}: ${errText.slice(0, 150)}`,
      res.status,
      retryAfterMs,
    );
  }

  const data = await res.json();
  await recordKeyUsage('cloudflare', false, false);
  const text = data.result?.choices?.[0]?.message?.content ?? data.result?.response ?? data.result;
  if (typeof text === 'object' && text !== null) return text;
  return extractJson(text);
}

// ==========================================
// 4. NVIDIA NIM PROVIDER
// ==========================================
async function callNvidia(apiKey, prompt, systemInstruction, timeoutMs = TIMEOUT_MS) {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction + '\nOutput ONLY valid JSON.' });
  }
  messages.push({ role: 'user', content: prompt });

  const res = await fetchFromProvider('nvidia', url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    const isRateLimit = res.status === 429;
    const retryAfterMs = getProviderRetryDelayMs({ status: res.status, headers: res.headers, body: errText });
    applyProviderCooldown('nvidia', retryAfterMs);
    await recordKeyUsage('nvidia', isRateLimit, true, retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs) : null);
    throw createProviderError(
      isRateLimit ? 'NVIDIA NIM Rate Limit (429)' : `NVIDIA NIM HTTP ${res.status}: ${errText.slice(0, 150)}`,
      res.status,
      retryAfterMs,
    );
  }

  const data = await res.json();
  await recordKeyUsage('nvidia', false, false);
  const msg = data.choices?.[0]?.message;
  const text = msg?.content || msg?.reasoning_content;
  return extractJson(text);
}

// ==========================================
// 5. GEMINI VISION (OCR for Handwriting)
// ==========================================
async function callGeminiVision(apiKey, keyIdentifier, imageBase64, mimeType, prompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 429) {
    await recordKeyUsage(keyIdentifier, true, true);
    throw new Error(`Gemini Vision ${keyIdentifier} Rate Limit (429)`);
  }

  if (!res.ok) {
    await recordKeyUsage(keyIdentifier, false, true);
    const errText = await res.text();
    throw new Error(`Gemini Vision ${keyIdentifier} HTTP ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  await recordKeyUsage(keyIdentifier, false, false);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJson(text);
}

// ==========================================
// UNIFIED EXECUTION FUNCTIONS
// ==========================================

/**
 * Unified AI JSON caller with SMART failover rotation across all available models
 */
export async function executeAiJsonWithFailover({
  prompt,
  systemInstruction = '',
  taskType = 'heavy',
  timeoutMs = TIMEOUT_MS,
}) {
  const providers = [];
  const groq = process.env.GROQ_KEY;
  const gemini1 = process.env.GEMINI_KEY_1;
  const gemini2 = process.env.GEMINI_KEY_2;
  const gemini3 = process.env.GEMINI_KEY_3;
  const cfKey = process.env.CLOUDFLARE_API_KEY;
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const nvidiaKey = process.env.NVIDIA_NIM_API_KEY;

  // 1. Groq (Fastest & Reliable)
  if (groq) {
    providers.push({ name: 'groq', fn: () => callGroq(groq, prompt, systemInstruction, timeoutMs) });
  }

  // 2. Gemini Multi-Keys (Smart & High Context)
  if (gemini1) providers.push({ name: 'gemini_1', fn: () => callGemini(gemini1, 'gemini_1', prompt, systemInstruction, timeoutMs) });
  if (gemini2) providers.push({ name: 'gemini_2', fn: () => callGemini(gemini2, 'gemini_2', prompt, systemInstruction, timeoutMs) });
  if (gemini3) providers.push({ name: 'gemini_3', fn: () => callGemini(gemini3, 'gemini_3', prompt, systemInstruction, timeoutMs) });

  // 3. Cloudflare Workers AI (Free Emergency Backup)
  if (cfKey && cfAccount) {
    providers.push({ name: 'cloudflare', fn: () => callCloudflare(cfKey, cfAccount, prompt, systemInstruction, timeoutMs) });
  }

  // 4. NVIDIA NIM (Bulk & Heavy Batching)
  if (nvidiaKey) {
    providers.push({ name: 'nvidia', fn: () => callNvidia(nvidiaKey, prompt, systemInstruction, Math.min(timeoutMs, 12000)) });
  }

  const errors = [];
  if (!providers.length) {
    const error = new Error('No AI question-generation providers are configured.');
    error.status = 503;
    throw error;
  }

  await restorePersistedCooldowns(providers.map((p) => p.name));
  let now = Date.now();
  let availableProviders = providers.filter((p) => providerReadyAt(p.name) <= now);

  if (!availableProviders.length) {
    const earliestReadyAt = Math.min(...providers.map((p) => providerReadyAt(p.name)));
    const waitMs = earliestReadyAt - now;
    if (waitMs > 0 && waitMs <= MAX_INLINE_COOLDOWN_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      now = Date.now();
      availableProviders = providers.filter((p) => providerReadyAt(p.name) <= now);
    }
  }

  if (!availableProviders.length) {
    const retryAfterMs = Math.max(1_000, Math.min(
      ...providers.map((p) => providerReadyAt(p.name) - now),
    ));
    const error = new Error('All AI providers are cooling down after rate limits or temporary outages.');
    error.status = 503;
    error.retryAfterMs = retryAfterMs;
    throw error;
  }

  // Fair Round-Robin Rotation
  const rotationStart = nextProviderIndex % providers.length;
  const orderedProviders = [...availableProviders].sort((a, b) => {
    const aIndex = (providers.indexOf(a) - rotationStart + providers.length) % providers.length;
    const bIndex = (providers.indexOf(b) - rotationStart + providers.length) % providers.length;
    return aIndex - bIndex;
  });

  for (let i = 0; i < orderedProviders.length; i++) {
    const provider = orderedProviders[i];
    const waitMs = providerReadyAt(provider.name) - Date.now();
    if (waitMs > 0) {
      errors.push({
        name: provider.name,
        message: 'Provider request paced to stay within rate limit.',
        retryAfterMs: waitMs,
      });
      continue;
    }

    try {
      console.log(`🤖 Invoking AI provider: ${provider.name} for task: ${taskType}`);
      const result = await provider.fn();
      nextProviderIndex = (providers.indexOf(provider) + 1) % providers.length;
      return { result, providerName: provider.name };
    } catch (err) {
      console.warn(`⚠️ Provider ${provider.name} failed: ${err.message}.`);
      errors.push({ name: provider.name, message: err.message, retryAfterMs: err.retryAfterMs || 0 });

      if (orderedProviders.slice(i + 1).some((next) => providerReadyAt(next.name) <= Date.now())) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  nextProviderIndex = (rotationStart + 1) % providers.length;
  const retryDelays = errors.map((e) => e.retryAfterMs).filter((d) => d > 0);
  const retryAfterMs = retryDelays.length ? Math.min(...retryDelays) : 0;
  const friendlyError = new Error('The AI question engine is experiencing high demand right now. Please try again shortly.');
  friendlyError.details = errors.map((e) => `${e.name}: ${e.message}`);
  friendlyError.status = 503;
  friendlyError.retryAfterMs = retryAfterMs;
  throw friendlyError;
}

/**
 * Unified AI Vision JSON caller with failover (for Answer sheet handwriting OCR)
 */
export async function executeGeminiVisionWithFailover({ imageBase64, mimeType = 'image/jpeg', prompt, systemInstruction = '' }) {
  const gemini1 = process.env.GEMINI_KEY_1;
  const gemini2 = process.env.GEMINI_KEY_2;
  const gemini3 = process.env.GEMINI_KEY_3;

  const providers = [];
  if (gemini1) providers.push({ name: 'gemini_1', fn: () => callGeminiVision(gemini1, 'gemini_1', imageBase64, mimeType, prompt, systemInstruction) });
  if (gemini2) providers.push({ name: 'gemini_2', fn: () => callGeminiVision(gemini2, 'gemini_2', imageBase64, mimeType, prompt, systemInstruction) });
  if (gemini3) providers.push({ name: 'gemini_3', fn: () => callGeminiVision(gemini3, 'gemini_3', imageBase64, mimeType, prompt, systemInstruction) });

  if (providers.length === 0) throw new Error('No Gemini API keys configured for Vision OCR');

  const errors = [];
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      console.log(`👁️ Invoking Vision AI: ${provider.name}`);
      const result = await provider.fn();
      return { result, providerName: provider.name };
    } catch (err) {
      console.warn(`⚠️ Vision provider ${provider.name} failed: ${err.message}.`);
      errors.push(`${provider.name}: ${err.message}`);
      if (i < providers.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const err = new Error('Handwriting Vision OCR failed across all API providers');
  err.details = errors;
  throw err;
}
