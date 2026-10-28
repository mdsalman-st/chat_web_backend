import dotenv from 'dotenv';
dotenv.config();

async function checkModels() {
  const groqKey = process.env.GROQ_KEY;
  if (groqKey) {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${groqKey}` }
    });
    const data = await res.json();
    console.log('Groq models:', (data.data || []).map(m => m.id).slice(0, 10));
  }

  const gKey1 = process.env.GEMINI_KEY_1;
  if (gKey1) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${gKey1}`);
    const data = await res.json();
    console.log('Gemini models:', (data.models || []).map(m => m.name).slice(0, 10));
  }
}

checkModels();
