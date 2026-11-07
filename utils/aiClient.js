import dotenv from 'dotenv';
import AiKeyUsage from '../models/AiKeyUsage.js';

dotenv.config();

/**
 * AI Provider Service with Smart Failover & Correct Models
 */

// ✅ Sahi aur Naye Models
const GEMINI_MODEL = 'gemini-3.8-flash'; 
const GROQ_MODEL = 'openai/gpt-oss-120b'; 
const providerCooldowns = new Map();
const providerFamilyCooldowns = new Map();
const providerTokenAverages = new Map();
let nextProviderIndex = 0;
const MAX_INLINE_COOLDOWN_WAIT_MS = 10_000;

function providerFamily(providerName) {
  return providerName.startsWith('gemini_') ? 'gemini' : providerName;
}

function providerMinIntervalMs(providerName) {
  const variable = providerFamily(providerName) === 'gemini'
    ? 'AI_GEMINI_MIN_INTERVAL_MS'
    : 'AI_GROQ_MIN_INTERVAL_MS';
  const configured = Number(process.env[variable]);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return providerFamily(providerName) === 'gemini' ? 7_000 : 3_000;
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
    console.error(`[AiClient] Failed to persist usage for ${keyId}:`, error);
  }
}

async function restorePersistedCooldowns(providerNames) {
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
}

// 🚨 Timeout 60 seconds (taaki heavy questions generate ho sakein)
const TIMEOUT_MS = 60000; 

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
    await recordKeyUsage(
      keyIdentifier,
      isRateLimit,
      true,
      retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs) : null,
    );
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
  if (!text) throw new Error(`Gemini ${keyIdentifier} returned empty content`);

  return JSON.parse(text);
}

async function callGroq(apiKey, prompt, systemInstruction, timeoutMs = TIMEOUT_MS) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
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
    await recordKeyUsage(
      'groq',
      isRateLimit,
      true,
      retryAfterMs > 0 ? new Date(Date.now() + retryAfterMs) : null,
    );
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
  if (!text) throw new Error('Groq returned empty content');

  return JSON.parse(text);
}

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
  if (!text) throw new Error(`Gemini Vision ${keyIdentifier} returned empty content`);

  return JSON.parse(text);
}

/**
 * Unified AI JSON caller with SMART failover rotation
 */
export async function executeAiJsonWithFailover({
  prompt,
  systemInstruction = '',
  taskType = 'heavy',
  timeoutMs = TIMEOUT_MS,
}) {
  const providers = [];
  const gemini1 = process.env.GEMINI_KEY_1;
  const gemini2 = process.env.GEMINI_KEY_2;
  const gemini3 = process.env.GEMINI_KEY_3;
  const groq = process.env.GROQ_KEY;

  if (groq) {
    providers.push({ name: 'groq', fn: () => callGroq(groq, prompt, systemInstruction, timeoutMs) });
  }
  
  if (gemini1) providers.push({ name: 'gemini_1', fn: () => callGemini(gemini1, 'gemini_1', prompt, systemInstruction, timeoutMs) });
  if (gemini2) providers.push({ name: 'gemini_2', fn: () => callGemini(gemini2, 'gemini_2', prompt, systemInstruction, timeoutMs) });
  if (gemini3) providers.push({ name: 'gemini_3', fn: () => callGemini(gemini3, 'gemini_3', prompt, systemInstruction, timeoutMs) });

  const errors = [];
  if (!providers.length) {
    const error = new Error('No AI question-generation providers are configured.');
    error.status = 503;
    throw error;
  }

  await restorePersistedCooldowns(providers.map((provider) => provider.name));
  let now = Date.now();
  let availableProviders = providers.filter((provider) => providerReadyAt(provider.name) <= now);
  if (!availableProviders.length) {
    const earliestReadyAt = Math.min(...providers.map((provider) => providerReadyAt(provider.name)));
    const waitMs = earliestReadyAt - now;
    if (waitMs > 0 && waitMs <= MAX_INLINE_COOLDOWN_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      now = Date.now();
      availableProviders = providers.filter((provider) => providerReadyAt(provider.name) <= now);
    }
  }
  if (!availableProviders.length) {
    const retryAfterMs = Math.max(1_000, Math.min(
      ...providers.map((provider) => providerReadyAt(provider.name) - now),
    ));
    const error = new Error('All AI providers are cooling down after rate limits or temporary outages.');
    error.status = 503;
    error.retryAfterMs = retryAfterMs;
    throw error;
  }

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
        message: 'Provider request paced to stay within its rate limit.',
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
      
      if (orderedProviders.slice(i + 1).some((nextProvider) => providerReadyAt(nextProvider.name) <= Date.now())) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  nextProviderIndex = (rotationStart + 1) % providers.length;
  const retryDelays = errors.map((error) => error.retryAfterMs).filter((delay) => delay > 0);
  const retryAfterMs = retryDelays.length ? Math.min(...retryDelays) : 0;
  const friendlyError = new Error('The AI question engine is experiencing high demand right now. Please try again in a little while.');
  friendlyError.details = errors.map((error) => `${error.name}: ${error.message}`);
  friendlyError.status = 503;
  friendlyError.retryAfterMs = retryAfterMs;
  throw friendlyError;
}

/**
 * Unified AI Vision JSON caller with failover
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
      console.log(`🤖 Invoking Vision AI: ${provider.name}`);
      const result = await provider.fn();
      return { result, providerName: provider.name };
    } catch (err) {
      console.warn(`⚠️ Vision provider ${provider.name} failed: ${err.message}.`);
      errors.push(`${provider.name}: ${err.message}`);
      if (i < providers.length - 1) await new Promise(r => setTimeout(r, 1500));
    }
  }

  const err = new Error('Handwriting Vision OCR failed across all API providers');
  err.details = errors;
  throw err;
}