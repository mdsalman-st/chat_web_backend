import dotenv from 'dotenv';
dotenv.config();

async function testKeys() {
  console.log('Testing Groq key...');
  const groqKey = process.env.GROQ_KEY;
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Say hello in 3 words' }],
          max_tokens: 10
        })
      });
      const data = await res.json();
      console.log('Groq status:', res.status, data.choices?.[0]?.message?.content || data);
    } catch (e) {
      console.log('Groq error:', e.message);
    }
  }

  console.log('Testing Gemini Key 1...');
  const gKey1 = process.env.GEMINI_KEY_1;
  if (gKey1) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${gKey1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello' }] }]
        })
      });
      const data = await res.json();
      console.log('Gemini 1 status:', res.status, data.candidates?.[0]?.content?.parts?.[0]?.text || data);
    } catch (e) {
      console.log('Gemini 1 error:', e.message);
    }
  }
}

testKeys();
