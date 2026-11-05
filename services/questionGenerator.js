import Chapter from '../models/Chapter.js';
import Question from '../models/Question.js';
import GenerationJob from '../models/GenerationJob.js';
import OfficialPaper from '../models/OfficialPaper.js'; 
import { executeAiJsonWithFailover } from '../utils/aiClient.js';
import { getChapterForMedium, getResolvedBoardConfig } from '../utils/boardEngine.js';
import { chapterTitleForMedium, normalizeMedium } from '../utils/medium.js';

export async function queueOrGetChapterJob({ boardCode, classLevel, subjectCode, chapterNumber, medium = 'Hindi', isHardMode = false, targetCount = 10 }) {
  const normMedium = normalizeMedium(medium);
  if (!normMedium) throw new Error(`Unsupported medium: ${medium}`);
  const jobKey = `${boardCode.toLowerCase()}_${classLevel}_${subjectCode.toLowerCase()}_${chapterNumber}_${normMedium.toLowerCase()}_${isHardMode ? 'hard' : 'normal'}`;

  let job = await GenerationJob.findOne({ jobKey });
  if (job && (job.status === 'running' || job.status === 'queued')) return job;
  
  if (job && job.status === 'completed') {
    const count = await Question.countDocuments({ boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium: normMedium, type: 'mcq', isActive: true, status: 'verified' });
    if (count >= targetCount) return job;
  }

  job = await GenerationJob.findOneAndUpdate({ jobKey }, {
    $set: { boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium: normMedium, isHardMode: !!isHardMode, status: 'running', progressPercent: 10, progressMessage: 'Initializing...', verifiedCount: 0, targetCount, startedAt: new Date(), completedAt: null, error: null }
  }, { upsert: true, new: true });

  setImmediate(async () => {
    try { await runGenerationAndVerification(job); } 
    catch (err) {
      await GenerationJob.findByIdAndUpdate(job._id, { $set: { status: 'failed', error: err.message, progressMessage: 'Failed to generate.' } });
    }
  });
  return job;
}

async function runGenerationAndVerification(job) {
  const { boardCode, classLevel, subjectCode, chapterNumber, medium, isHardMode, targetCount } = job;
  const boardConfig = await getResolvedBoardConfig(boardCode);
  const requiredCount = Math.max(1, Number(targetCount) || 10);
  
  const chapter = await getChapterForMedium({ boardCode, classLevel, subjectCode, chapterNumber, medium });
  const chapterTitle = chapter ? chapterTitleForMedium(chapter, medium) : `Chapter ${chapterNumber}`;
  const baseQ = { boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium };

  let dbMcq = await Question.countDocuments({ ...baseQ, type: 'mcq', status: 'verified' });
  let attempts = 0;

  while (dbMcq < requiredCount && attempts < 20) {
    attempts++;
    const batchSize = Math.min(3, requiredCount - dbMcq);

    const prompt = `Generate EXACTLY ${batchSize} MCQs for:
Class ${classLevel} | ${subjectCode} | Chapter ${chapterNumber} (${chapterTitle}) | Lang: ${medium}
Return JSON: { "questions": [ { "type": "mcq", "questionText": "...", "hindiQuestionText": "...", "options": [{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}], "correctOption": "A", "explanation": "...", "marks": 1, "difficulty": "Medium", "subtopic": "..." } ] }`;

    const aiRes = await executeAiJsonWithFailover({ prompt, systemInstruction: `Expert exam creator for ${boardConfig.name}.`, taskType: 'heavy' });
    const candidates = aiRes.result?.questions || [];
    if (candidates.length === 0) throw new Error('AI did not return any questions.');
    const previousCount = dbMcq;

    for (const c of candidates) {
      await Question.findOneAndUpdate(
        { ...baseQ, questionText: c.questionText.trim() },
        { $set: { hindiQuestionText: c.hindiQuestionText, difficulty: c.difficulty || 'Medium', subtopic: c.subtopic || '', chapterTitle, type: 'mcq', marks: 1, isAiGenerated: true, sourceLabel: 'AI-generated', status: 'verified', isActive: true, options: c.options, correctOption: c.correctOption, explanation: c.explanation } },
        { upsert: true }
      );
    }

    dbMcq = await Question.countDocuments({ ...baseQ, type: 'mcq', status: 'verified' });
    if (dbMcq <= previousCount) throw new Error('AI did not generate any new questions.');
    await GenerationJob.findByIdAndUpdate(job._id, { $set: {
      progressPercent: Math.min(95, 10 + Math.round((dbMcq / requiredCount) * 85)),
      progressMessage: `Generated ${dbMcq}/${requiredCount} MCQs...`,
      verifiedCount: dbMcq,
    } });
  }

  if (dbMcq < requiredCount) throw new Error(`Could only generate ${dbMcq} of ${requiredCount} requested questions.`);

  const finalCount = await Question.countDocuments({ ...baseQ, status: 'verified' });
  if (chapter) await Chapter.updateOne({ _id: chapter._id }, { $set: { questionCount: finalCount, verifiedQuestionCount: finalCount, isLive: true } });
  await GenerationJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', progressPercent: 100, progressMessage: `Ready! ${finalCount} questions.`, verifiedCount: finalCount, completedAt: new Date() } });
}