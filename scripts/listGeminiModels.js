import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function listGeminiModels() {
  const key = process.env.GEMINI_KEY_2;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  const res = await fetch(url);
  console.log('List models status:', res.status);
  const data = await res.json();
  const models = data.models?.map(m => m.name.replace('models/', '')).filter(m => m.includes('flash') || m.includes('gemini'));
  console.log('Available Gemini models:', models);
}

listGeminiModels().catch(console.error);
