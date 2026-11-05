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
    const count = await Question.countDocuments({ boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium: normMedium, isActive: true, status: 'verified' });
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
  const { boardCode, classLevel, subjectCode, chapterNumber, medium, isHardMode } = job;
  const boardConfig = await getResolvedBoardConfig(boardCode);
  
  const pattern = boardConfig.paperPattern || { mcq: 50, twoMarks: 20, fiveMarks: 10 };
  const reqMcq = pattern.mcq > 0 ? pattern.mcq : 50;
  const reqSubj = (pattern.twoMarks > 0 ? pattern.twoMarks : 20) + (pattern.fiveMarks > 0 ? pattern.fiveMarks : 10);
  const totalRequired = reqMcq + reqSubj;

  const chapter = await getChapterForMedium({ boardCode, classLevel, subjectCode, chapterNumber, medium });
  const chapterTitle = chapter ? chapterTitleForMedium(chapter, medium) : `Chapter ${chapterNumber}`;
  const baseQ = { boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium };

  // ==========================================
  // 🚨 PHASE 1: SIRF MCQ GENERATE KARO (FAST)
  // ==========================================
  let dbMcq = await Question.countDocuments({ ...baseQ, type: 'mcq', status: 'verified' });
  let loops = 0;

  while (dbMcq < reqMcq && loops < 30) {
    loops++;
    const batchSize = Math.min(3, reqMcq - dbMcq); // Ek baar mein 3 MCQ

    const prompt = `Generate EXACTLY ${batchSize} MCQs for:
Class ${classLevel} | ${subjectCode} | Chapter ${chapterNumber} (${chapterTitle}) | Lang: ${medium}
Return JSON: { "questions": [ { "type": "mcq", "questionText": "...", "hindiQuestionText": "...", "options": [{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}], "correctOption": "A", "explanation": "...", "marks": 1, "difficulty": "Medium", "subtopic": "..." } ] }`;

    try {
      const aiRes = await executeAiJsonWithFailover({ prompt, systemInstruction: `Expert exam creator for ${boardConfig.name}.`, taskType: 'heavy' });
      const candidates = aiRes.result?.questions || [];
      
      for (const c of candidates) {
        await Question.findOneAndUpdate(
          { ...baseQ, questionText: c.questionText.trim() },
          { $set: { hindiQuestionText: c.hindiQuestionText, difficulty: c.difficulty || 'Medium', subtopic: c.subtopic || '', chapterTitle, type: 'mcq', marks: 1, isAiGenerated: true, sourceLabel: 'AI-generated', status: 'verified', isActive: true, options: c.options, correctOption: c.correctOption, explanation: c.explanation } },
          { upsert: true }
        );
        dbMcq++;
      }
    } catch (err) { await new Promise(r => setTimeout(r, 2000)); }
    
    // Progress update
    await GenerationJob.findByIdAndUpdate(job._id, { $set: { progressPercent: Math.min(50, 10 + Math.round((dbMcq / totalRequired) * 40)), progressMessage: `Generated ${dbMcq}/${reqMcq} MCQs...`, verifiedCount: dbMcq } });
    await new Promise(r => setTimeout(r, 1000)); 
  }

  // ==========================================
  // 🚨 PHASE 2: SUBJECTIVE GENERATE KARO (BACKGROUND)
  // ==========================================
  let dbSubj = await Question.countDocuments({ ...baseQ, type: 'subjective', status: 'verified' });
  loops = 0;

  while (dbSubj < reqSubj && loops < 20) {
    loops++;
    const batchSize = 1; // Ek baar mein 1 Subjective (kyunki isme modelAnswer lamba hota hai)

    const prompt = `Generate EXACTLY ${batchSize} Subjective Question for:
Class ${classLevel} | ${subjectCode} | Chapter ${chapterNumber} (${chapterTitle}) | Lang: ${medium}
Return JSON: { "questions": [ { "type": "subjective", "questionText": "...", "hindiQuestionText": "...", "modelAnswer": "...", "marks": 2, "difficulty": "Medium", "subtopic": "..." } ] }`;

    try {
      const aiRes = await executeAiJsonWithFailover({ prompt, systemInstruction: `Expert exam creator for ${boardConfig.name}.`, taskType: 'heavy' });
      const candidates = aiRes.result?.questions || [];
      
      for (const c of candidates) {
        await Question.findOneAndUpdate(
          { ...baseQ, questionText: c.questionText.trim() },
          { $set: { hindiQuestionText: c.hindiQuestionText, difficulty: c.difficulty || 'Medium', subtopic: c.subtopic || '', chapterTitle, type: 'subjective', marks: c.marks || 2, isAiGenerated: true, sourceLabel: 'AI-generated', status: 'verified', isActive: true, modelAnswer: c.modelAnswer || '' } },
          { upsert: true }
        );
        dbSubj++;
      }
    } catch (err) { await new Promise(r => setTimeout(r, 2000)); }
    
    await GenerationJob.findByIdAndUpdate(job._id, { $set: { progressPercent: Math.min(90, 50 + Math.round((dbSubj / reqSubj) * 40)), progressMessage: `Generated ${dbSubj}/${reqSubj} Subjective Qs...`, verifiedCount: dbMcq + dbSubj } });
    await new Promise(r => setTimeout(r, 1000)); 
  }

  // DONE
  const finalCount = dbMcq + dbSubj;
  if (chapter) await Chapter.updateOne({ _id: chapter._id }, { $set: { questionCount: finalCount, verifiedQuestionCount: finalCount, isLive: true } });
  await GenerationJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', progressPercent: 100, progressMessage: `Ready! ${finalCount} questions.`, verifiedCount: finalCount, completedAt: new Date() } });
}