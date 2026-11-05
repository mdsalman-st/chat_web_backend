import Chapter from '../models/Chapter.js';
import { executeAiJsonWithFailover } from '../utils/aiClient.js';
import { getResolvedBoardConfig } from '../utils/boardEngine.js';

export async function autoGenerateChapters(boardCode, classLevel, subjectCode, stream = null) {
  try {
    const boardConfig = await getResolvedBoardConfig(boardCode);
    
    // AI ko bolo chapters ki list generate kare
    const prompt = `List all the official chapters for Class ${classLevel} ${subjectCode} for ${boardConfig.name}. 
    Return ONLY a JSON array of objects. No extra text.
    Format:
    [
      { "chapterNumber": 1, "title": "English Title", "hindiTitle": "Hindi Title" },
      { "chapterNumber": 2, "title": "English Title", "hindiTitle": "Hindi Title" }
    ]`;

    const aiRes = await executeAiJsonWithFailover({
      prompt,
      systemInstruction: 'You are an expert curriculum designer. Output strictly JSON array.',
      taskType: 'heavy',
    });

    // AI response parse karo (sometimes AI sends { chapters: [...] } or just [...])
    let chaptersList = aiRes.result;
    if (chaptersList.chapters) chaptersList = chaptersList.chapters;
    if (!Array.isArray(chaptersList)) throw new Error('AI did not return an array');

    // Database me save karo
    const savedChapters = [];
    for (const ch of chaptersList) {
      const newCh = await Chapter.findOneAndUpdate(
        {
          boardCode: boardCode.toLowerCase(),
          classLevel: String(classLevel),
          subjectCode: subjectCode.toLowerCase(),
          chapterNumber: ch.chapterNumber,
          medium: 'Both',
        },
        {
          $set: {
            title: ch.title,
            hindiTitle: ch.hindiTitle || ch.title,
            medium: 'Both',
            stream: stream,
            phaseCutoff: 'annual', // Default to annual
            isLive: true,
            questionCount: 0,
            verifiedQuestionCount: 0
          }
        },
        { upsert: true, new: true }
      );
      savedChapters.push(newCh);
    }
    
    console.log(`✨ Auto-generated ${savedChapters.length} chapters for ${boardCode} - ${subjectCode}`);
    return savedChapters;
  } catch (err) {
    console.error('Auto chapter generation failed:', err);
    return []; // Return empty array on failure so it doesn't crash
  }
}