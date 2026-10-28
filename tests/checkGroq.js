import dotenv from 'dotenv';
dotenv.config();

async function checkGroqChatModels() {
  const groqKey = process.env.GROQ_KEY;
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${groqKey}` }
  });
  const data = await res.json();
  const chatModels = (data.data || []).map(m => m.id);
  console.log('All Groq models:', chatModels);
}

checkGroqChatModels();
