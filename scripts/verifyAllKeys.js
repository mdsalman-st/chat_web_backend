import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { executeAiJsonWithFailover } from '../utils/aiClient.js';

async function verifyAllKeys() {
  console.log('Testing AI generation with updated independent multi-key setup...');
  const res = await executeAiJsonWithFailover({
    prompt: 'Return a JSON test question: {"q": "What is accounting?", "ans": "Tracking money"}',
    systemInstruction: 'You must return strictly valid JSON.',
    taskType: 'heavy',
    timeoutMs: 15000,
  });
  console.log('Provider used:', res.providerName);
  console.log('Result:', JSON.stringify(res.result));
}

verifyAllKeys().catch(console.error);
