import Chapter from '../models/Chapter.js';
import Question from '../models/Question.js';
import GenerationJob from '../models/GenerationJob.js';
import OfficialPaper from '../models/OfficialPaper.js'; 
import { executeAiJsonWithFailover } from '../utils/aiClient.js';
import { getChapterForMedium, getResolvedBoardConfig } from '../utils/boardEngine.js';
import { chapterTitleForMedium, normalizeMedium } from '../utils/medium.js';

/**
 * Question Generator & Dual-Model Verification Service
 * Generates syllabus-locked questions and verifies them with an independent AI solver.
 */

export async function queueOrGetChapterJob({
  boardCode,
  classLevel,
  subjectCode,
  chapterNumber,
  medium = 'Hindi',
  isHardMode = false,
  targetCount = 10,
}) {
  const normMedium = normalizeMedium(medium);
  if (!normMedium) throw new Error(`Unsupported medium: ${medium}`);
  const jobKey = `${boardCode.toLowerCase()}_${classLevel}_${subjectCode.toLowerCase()}_${chapterNumber}_${normMedium.toLowerCase()}_${isHardMode ? 'hard' : 'normal'}`;

  let job = await GenerationJob.findOne({ jobKey });

  if (job) {
    if (job.status === 'running' || job.status === 'queued') {
      return job;
    }
    if (job.status === 'completed') {
      const existingCount = await Question.countDocuments({
        boardCode: boardCode.toLowerCase(),
        classLevel: String(classLevel),
        subjectCode: subjectCode.toLowerCase(),
        chapterNumber: Number(chapterNumber),
        medium: normMedium,
        isActive: true,
        status: 'verified',
      });
      if (existingCount >= targetCount) {
        return job;
      }
    }
  }

  job = await GenerationJob.findOneAndUpdate(
    { jobKey },
    {
      $set: {
        boardCode: boardCode.toLowerCase(),
        classLevel: String(classLevel),
        subjectCode: subjectCode.toLowerCase(),
        chapterNumber: Number(chapterNumber),
        medium: normMedium,
        isHardMode: !!isHardMode,
        status: 'running',
        progressPercent: 10,
        progressMessage: 'Initializing syllabus and textbook curriculum…',
        generatedCount: 0,
        verifiedCount: 0,
        targetCount,
        startedAt: new Date(),
        completedAt: null,
        error: null,
      },
    },
    { upsert: true, new: true }
  );

  setImmediate(async () => {
    try {
      await runGenerationAndVerification(job);
    } catch (err) {
      console.error(`❌ Generation job ${jobKey} failed:`, err);
      await GenerationJob.findByIdAndUpdate(job._id, {
        $set: {
          status: 'failed',
          error: err.message || 'Generation failed',
          progressMessage: 'Failed to generate questions. Please try again.',
        },
      });
    }
  });

  return job;
}

/**
 * Worker logic: Batch Generation (Max 5 questions per loop) + Verification
 */
async function runGenerationAndVerification(job) {
  const { boardCode, classLevel, subjectCode, chapterNumber, medium, isHardMode } = job;

  const boardConfig = await getResolvedBoardConfig(boardCode);
  
  // 1. Board Config se Pattern nikaalo
  const pattern = boardConfig.paperPattern || { mcq: 50, twoMarks: 20, fiveMarks: 10 };
  const reqMcq = pattern.mcq || 0;
  const reqTwoMarks = pattern.twoMarks || 0;
  const reqFiveMarks = pattern.fiveMarks || 0;
  const totalRequired = reqMcq + reqTwoMarks + reqFiveMarks;

  const chapter = await getChapterForMedium({
    boardCode, classLevel, subjectCode, chapterNumber, medium,
  });

  const chapterTitle = chapter ? chapterTitleForMedium(chapter, medium) : `Chapter ${chapterNumber}`;
  const chapterHindi = chapter?.hindiTitle || '';
  const isHindi = medium === 'Hindi';

  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: { progressPercent: 20, progressMessage: `Fetching Official Board Papers for reference…` },
  });

  // 2. Reference Material lao
  let referenceContext = "";
  try {
    const pastPapers = await OfficialPaper.find({
      boardCode: boardCode.toLowerCase(),
      classLevel: String(classLevel),
      subjectCode: subjectCode.toLowerCase(),
      status: 'ingested',
      extractedText: { $ne: '' }
    }).limit(2).select('extractedText').lean();

    if (pastPapers.length > 0) {
      let combinedText = pastPapers.map(p => p.extractedText).join('\n\n--- NEXT PAPER ---\n\n');
      if (combinedText.length > 3000) combinedText = combinedText.substring(0, 3000) + '...[Truncated]...';
      referenceContext = combinedText;
    }
  } catch (err) {}

  // 3. Existing Questions count karo taaki duplicate na ho
  let existingMcqs = await Question.countDocuments({ boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium, type: 'mcq', status: 'verified' });
  let existingSubjs = await Question.countDocuments({ boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium, type: 'subjective', status: 'verified' });
  
  let verifiedCount = existingMcqs + existingSubjs;
  let loopCount = 0;
  let failedBatches = 0;

  // 4. LOOP: Jab tak pattern poora na ho jaye
  while (verifiedCount < totalRequired && loopCount < 30) {
    loopCount++;
    
    const neededMcq = Math.max(0, reqMcq - existingMcqs);
    const neededSubjTotal = Math.max(0, (reqTwoMarks + reqFiveMarks) - existingSubjs);
    
    if (neededMcq === 0 && neededSubjTotal === 0) break;

    // Ek batch mein max 5 questions (taaki AI ka token limit na toote)
    let batchMcq = Math.min(5, neededMcq);
    let batchSubj = Math.min(5, neededSubjTotal);
    
    if (batchMcq === 0 && batchSubj > 0) batchSubj = Math.min(5, neededSubjTotal);
    if (batchSubj === 0 && batchMcq > 0) batchMcq = Math.min(5, neededMcq);

    await GenerationJob.findByIdAndUpdate(job._id, {
      $set: {
        progressPercent: Math.min(90, 20 + Math.round((verifiedCount / totalRequired) * 70)),
        progressMessage: `Generating batch ${loopCount}... (${verifiedCount}/${totalRequired} done)`,
        verifiedCount,
      },
    });

    const prompt = `Generate a small batch of questions for:
Class: ${classLevel} | Subject: ${subjectCode} | Chapter: ${chapterNumber} - ${chapterTitle} (${chapterHindi})
Language: ${medium}

📌 BATCH REQUIREMENTS:
- ${batchMcq} Multiple Choice Questions (1 mark each)
- ${batchSubj} Subjective Questions (2 or 5 marks each)

${referenceContext ? `REFERENCE MATERIAL:\n"""\n${referenceContext}\n"""` : ''}

Return EXACT JSON format:
{
  "questions": [
    {
      "type": "mcq",
      "questionText": "Question in ${medium}",
      "hindiQuestionText": "Hindi translation",
      "options": [ { "key": "A", "text": "..." }, { "key": "B", "text": "..." }, { "key": "C", "text": "..." }, { "key": "D", "text": "..." } ],
      "correctOption": "A",
      "explanation": "Step-by-step reason",
      "marks": 1,
      "difficulty": "Medium",
      "subtopic": "Sub-concept"
    },
    {
      "type": "subjective",
      "questionText": "Question in ${medium}",
      "hindiQuestionText": "Hindi translation",
      "modelAnswer": "Detailed ideal answer",
      "marks": 2, 
      "difficulty": "Medium",
      "subtopic": "Sub-concept"
    }
  ]
}`;

    try {
      const genResponse = await executeAiJsonWithFailover({
        prompt,
        systemInstruction: `You are a senior board exam question creator for ${boardConfig.name}. Follow syllabus strictly.`,
        taskType: 'heavy',
      });

      const candidates = genResponse.result?.questions || [];
      
      if (candidates.length === 0) {
        failedBatches++;
        if (failedBatches > 3) throw new Error('AI is failing to generate questions. Please try again.');
        continue;
      }

      // Verification Loop for the batch
      for (const candidate of candidates) {
        if (candidate.type === 'mcq') {
          try {
            // Dual-model verification for MCQs
            const solverPrompt = `Solve this MCQ:\nQ: ${candidate.questionText}\nOptions:\n${candidate.options.map(o => `${o.key}) ${o.text}`).join('\n')}\nReturn JSON: { "selectedOption": "A" | "B" | "C" | "D" }`;
            const solverRes = await executeAiJsonWithFailover({
              prompt: solverPrompt,
              systemInstruction: 'You are an objective exam key verifier. Select only the correct option.',
              taskType: 'fast',
            });

            const solvedKey = String(solverRes.result?.selectedOption || '').trim().toUpperCase();
            const expectedKey = String(candidate.correctOption || '').trim().toUpperCase();

            if (solvedKey && solvedKey === expectedKey) {
              await Question.findOneAndUpdate(
                { boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), questionText: candidate.questionText.trim(), medium },
                { $set: { hindiQuestionText: candidate.hindiQuestionText, options: candidate.options, correctOption: candidate.correctOption, explanation: candidate.explanation, difficulty: candidate.difficulty || 'Medium', subtopic: candidate.subtopic || '', chapterTitle, type: 'mcq', marks: 1, isAiGenerated: true, sourceLabel: 'AI-generated', status: 'verified', isActive: true } },
                { upsert: true, new: true }
              );
              existingMcqs++;
              verifiedCount++;
            }
          } catch (vErr) { 
            console.warn(`MCQ Verification failed: ${vErr.message}`); 
          }
        } else if (candidate.type === 'subjective') {
          // Subjectives ko bina verification ke save karo
          await Question.findOneAndUpdate(
            { boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), questionText: candidate.questionText.trim(), medium },
            { $set: { hindiQuestionText: candidate.hindiQuestionText, modelAnswer: candidate.modelAnswer || '', difficulty: candidate.difficulty || 'Medium', subtopic: candidate.subtopic || '', chapterTitle, type: 'subjective', marks: candidate.marks || 2, isAiGenerated: true, sourceLabel: 'AI-generated', status: 'verified', isActive: true } },
            { upsert: true, new: true }
          );
          existingSubjs++;
          verifiedCount++;
        }
      }
    } catch (err) {
      console.warn(`[AI Gen] Batch ${loopCount} failed: ${err.message}`);
      failedBatches++;
      if (failedBatches > 5) {
        throw new Error('Too many failed batches. Stopping generation.');
      }
    }
    
    // Rate limit se bachne ke liye 2 second ka gap
    await new Promise(r => setTimeout(r, 2000));
  }

  // 5. Chapter question counters update karo
  const totalVerifiedInDb = await Question.countDocuments({
    boardCode: boardCode.toLowerCase(), classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber: Number(chapterNumber), medium, isActive: true, status: 'verified',
  });

  if (chapter) {
    await Chapter.updateOne({ _id: chapter._id }, { $set: { questionCount: totalVerifiedInDb, verifiedQuestionCount: totalVerifiedInDb, isLive: totalVerifiedInDb > 0 } });
  }

  // 6. Mark job completed
  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: { status: 'completed', progressPercent: 100, progressMessage: `Ready! ${totalVerifiedInDb} questions generated as per pattern.`, verifiedCount: totalVerifiedInDb, completedAt: new Date() },
  });

  console.log(`✅ [AI Gen] Job ${job.jobKey} finished. Verified: ${totalVerifiedInDb}`);
  return { verifiedCount: totalVerifiedInDb, totalVerifiedInDb };
}