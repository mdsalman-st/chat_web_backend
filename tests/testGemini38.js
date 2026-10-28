import dotenv from 'dotenv';
dotenv.config();

async function testGemini38() {
  const gKey1 = process.env.GEMINI_KEY_1;
  const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${gKey1}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Return JSON: {"status": "gemini_38_working"}' }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const gemData = await gemRes.json();
  console.log('Gemini 3.8 Flash response:', gemData.candidates?.[0]?.content?.parts?.[0]?.text || gemData);
}

testGemini38();
