import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import AiKeyUsage from '../models/AiKeyUsage.js';
import {
  executeAiJsonWithFailover,
  getGroqQuotaCooldownMs,
  getProviderRetryDelayMs,
} from '../utils/aiClient.js';

const originalFetch = globalThis.fetch;
const originalUsageUpdate = AiKeyUsage.findOneAndUpdate;
const originalUsageFind = AiKeyUsage.find;
const originalKeys = Object.fromEntries(
  ['GROQ_KEY', 'GEMINI_KEY_1', 'GEMINI_KEY_2', 'GEMINI_KEY_3'].map((key) => [key, process.env[key]]),
);

afterEach(() => {
  globalThis.fetch = originalFetch;
  AiKeyUsage.findOneAndUpdate = originalUsageUpdate;
  AiKeyUsage.find = originalUsageFind;
  for (const [key, value] of Object.entries(originalKeys)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('AI providers respect Retry-After, Gemini retryDelay, and temporary outage defaults', () => {
  const now = Date.parse('2026-11-06T12:00:00.000Z');
  assert.equal(
    getProviderRetryDelayMs({
      status: 429,
      headers: new Headers({ 'retry-after': '45' }),
      now,
    }),
    45_000,
  );
  assert.equal(
    getProviderRetryDelayMs({
      status: 503,
      headers: new Headers(),
      body: '{"error":{"details":[{"retryDelay":"1m2s"}]}}',
      now,
    }),
    62_000,
  );
  assert.equal(
    getProviderRetryDelayMs({ status: 503, headers: new Headers(), now }),
    30_000,
  );
});

test('Groq cooldown is derived from exhausted request or token quota headers', () => {
  const requestHeaders = new Headers({
    'x-ratelimit-remaining-requests': '0',
    'x-ratelimit-reset-requests': '1m2.5s',
    'x-ratelimit-remaining-tokens': '10000',
  });
  assert.equal(getGroqQuotaCooldownMs(requestHeaders, 500, 500), 62_500);

  const tokenHeaders = new Headers({
    'x-ratelimit-remaining-requests': '12',
    'x-ratelimit-remaining-tokens': '500',
    'x-ratelimit-reset-tokens': '10s',
  });
  assert.equal(getGroqQuotaCooldownMs(tokenHeaders, 1000, 1000), 10_000);

  assert.equal(getGroqQuotaCooldownMs(new Headers(), 1000, 1000), 0);
});

test('rate-limited providers are skipped on subsequent generation requests', async () => {
  process.env.GROQ_KEY = 'test-groq';
  process.env.GEMINI_KEY_1 = 'test-gemini-1';
  process.env.GEMINI_KEY_2 = 'test-gemini-2';
  process.env.GEMINI_KEY_3 = 'test-gemini-3';
  const persistedCooldowns = new Map();
  AiKeyUsage.findOneAndUpdate = async (query, update) => {
    if (update.$set.cooldownUntil) {
      persistedCooldowns.set(query.keyIdentifier, {
        keyIdentifier: query.keyIdentifier,
        cooldownUntil: update.$set.cooldownUntil,
      });
    }
    return null;
  };
  AiKeyUsage.find = () => ({
    select() {
      return this;
    },
    lean: async () => [...persistedCooldowns.values()],
  });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes('groq.com')) {
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '60' } });
    }
    return new Response('temporarily unavailable', { status: 503, headers: { 'retry-after': '60' } });
  };

  await assert.rejects(
    executeAiJsonWithFailover({ prompt: 'generate one question' }),
    (error) => error.retryAfterMs >= 59_000,
  );
  assert.equal(requests.length, 2);
  assert.match(requests[0], /groq\.com/);
  assert.match(requests[1], /key=test-gemini-1/);
  assert.ok(persistedCooldowns.has('groq'));
  assert.ok(persistedCooldowns.has('gemini_1'));

  await assert.rejects(
    executeAiJsonWithFailover({ prompt: 'generate another question' }),
    (error) => error.retryAfterMs > 0,
  );
  assert.equal(requests.length, 2);
});
