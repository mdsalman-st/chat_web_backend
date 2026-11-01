import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

async function testGemini() {
  const gKey1 = process.env.GEMINI_KEY_1;
  const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gKey1}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Return JSON: {"status": "gemini_working"}' }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const gemData = await gemRes.json();
  console.log('Status:', gemRes.status);
  console.log('Gemini 2.5 response:', gemData.candidates?.[0]?.content?.parts?.[0]?.text || gemData);
}

testGemini();
