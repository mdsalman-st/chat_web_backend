import dotenv from 'dotenv';
dotenv.config();

async function inspectGemini() {
  const gKey1 = process.env.GEMINI_KEY_1;
  const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gKey1}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Return JSON: {"hello": "world"}' }] }]
    })
  });
  const gemData = await gemRes.json();
  console.log('Gemini raw response:', JSON.stringify(gemData, null, 2));
}

inspectGemini();
