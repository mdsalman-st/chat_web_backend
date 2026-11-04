import { executeAiJsonWithFailover } from '../utils/aiClient.js';

export async function parseTextToQuestions(text, subjectName, boardCode, classLevel) {
  const prompt = `You are an expert board exam paper parser for ${boardCode.toUpperCase()} Board, Class ${classLevel}, Subject: ${subjectName}.
Read the following extracted text from an official board paper PDF.
Extract ALL questions from this text.
For each question, strictly identify if it is an MCQ (Multiple Choice, having options A, B, C, D) or Subjective (written answers).
Return STRICT JSON matching this schema:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "English question text",
      "hindiQuestionText": "Hindi translation (if present, else empty string)",
      "questionType": "mcq" | "subjective",
      "options": [ { "key": "A", "text": "Option A" }, { "key": "B", "text": "Option B" } ],
      "correctOption": "A", 
      "modelAnswer": "Detailed model answer if it is a subjective question (leave empty for MCQ)",
      "marks": 1,
      "difficulty": "Easy" | "Medium" | "Hard"
    }
  ]
}

Rules:
- If it's an MCQ, populate "options" array and "correctOption" (find from answer key in text if available). Leave "modelAnswer" empty.
- If it's Subjective, leave "options" empty and populate "modelAnswer" (derive a standard model answer if not given in text).
- Be accurate. Do not invent questions if the text is empty.

Extracted Text from PDF:
"""
${text.substring(0, 15000)}
"""`;

  try {
    const response = await executeAiJsonWithFailover({
      prompt,
      systemInstruction: 'You are a strict educational data extractor. Output only JSON.',
      taskType: 'heavy',
    });

    return response.result?.questions || [];
  } catch (error) {
    console.error('[AI PDF Parsing Failed]', error);
    return []; // Agar AI fail ho toh empty array return karo taaki server crash na ho
  }
}