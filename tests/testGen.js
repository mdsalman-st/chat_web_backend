import dotenv from 'dotenv';
dotenv.config();

async function testGeneration() {
  const gKey1 = process.env.GEMINI_KEY_1;
  const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gKey1}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Return JSON: {"hello": "world"}' }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const gemData = await gemRes.json();
  console.log('Gemini 2.5 response:', gemData.candidates?.[0]?.content?.parts?.[0]?.text);

  const groqKey = process.env.GROQ_KEY;
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'Return JSON: {"groq": "works"}' }],
      response_format: { type: 'json_object' }
    })
  });
  const groqData = await groqRes.json();
  console.log('Groq response:', groqData.choices?.[0]?.message?.content);
}

testGeneration();
