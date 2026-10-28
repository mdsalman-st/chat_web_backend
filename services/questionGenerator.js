import Chapter from '../models/Chapter.js';
import Question from '../models/Question.js';
import GenerationJob from '../models/GenerationJob.js';
import { executeAiJsonWithFailover } from '../utils/aiClient.js';
import { getResolvedBoardConfig } from '../utils/boardEngine.js';

/**
 * Question Generator & Dual-Model Verification Service
 * Generates syllabus-locked questions and verifies them with an independent AI solver.
 */

/**
 * Run background job with deduplication
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
  const normMedium = medium.toLowerCase() === 'english' ? 'English' : 'Hindi';
  const jobKey = `${boardCode.toLowerCase()}_${classLevel}_${subjectCode.toLowerCase()}_${chapterNumber}_${normMedium.toLowerCase()}_${isHardMode ? 'hard' : 'normal'}`;

  // Check if job already exists and is active
  let job = await GenerationJob.findOne({ jobKey });

  if (job) {
    if (job.status === 'running' || job.status === 'queued') {
      return job;
    }
    if (job.status === 'completed') {
      // Check if enough verified questions exist in DB
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

  // Create or reset job
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

  // Trigger generator asynchronously in background (non-blocking)
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
 * Worker logic: Call 1 (Generation) + Call 2 (Independent Verification)
 */
async function runGenerationAndVerification(job) {
  const { boardCode, classLevel, subjectCode, chapterNumber, medium, isHardMode, targetCount } = job;

  // 1. Fetch chapter & board metadata
  const boardConfig = await getResolvedBoardConfig(boardCode);
  const chapter = await Chapter.findOne({
    classLevel: String(classLevel),
    subjectCode: String(subjectCode).toLowerCase(),
    chapterNumber: Number(chapterNumber),
  }).lean();

  const chapterTitle = chapter?.title || `Chapter ${chapterNumber}`;
  const chapterHindi = chapter?.hindiTitle || '';
  const isHindi = medium === 'Hindi';

  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: {
      progressPercent: 25,
      progressMessage: `Analyzing chapter topics for ${chapterTitle}…`,
    },
  });

  // 2. Formulate generation prompt (Call 1)
  const systemInstruction = `You are a senior board exam question creator for ${boardConfig.name}.
STRICT RULES:
1. ONLY generate questions directly from the prescribed Class ${classLevel} ${subjectCode} NCERT and state textbook syllabus for Chapter ${chapterNumber} ("${chapterTitle}").
2. DO NOT use outside knowledge, university-level theories, or out-of-syllabus concepts.
3. Every question must have 4 clear, plausible options (A, B, C, D) with exactly one undeniably correct answer.
4. Difficulty mix: ${isHardMode ? '10% Easy, 40% Medium, 50% Hard' : '30% Easy, 50% Medium, 20% Hard'}. Focus on concept application and 2-step reasoning.
5. Language: Provide content in ${isHindi ? 'Hindi (with English technical terms in brackets if helpful)' : 'English'}.
6. Output MUST strictly match the requested JSON format.`;

  const prompt = `Generate ${targetCount} high-quality board-level practice MCQs for:
Board: ${boardConfig.name}
Class: ${classLevel}
Subject: ${subjectCode}
Chapter: ${chapterNumber} - ${chapterTitle} (${chapterHindi})
Language: ${isHindi ? 'Hindi' : 'English'}
Mode: ${isHardMode ? 'Hard Mode' : 'Standard Board Mode'}

Return JSON format:
{
  "questions": [
    {
      "questionText": "Question text in ${isHindi ? 'Hindi' : 'English'}",
      "hindiQuestionText": "Hindi translation or original",
      "options": [
        { "key": "A", "text": "Option A text" },
        { "key": "B", "text": "Option B text" },
        { "key": "C", "text": "Option C text" },
        { "key": "D", "text": "Option D text" }
      ],
      "correctOption": "A",
      "explanation": "Clear, concise step-by-step reason why this option is correct",
      "difficulty": "Easy" | "Medium" | "Hard",
      "subtopic": "Name of the sub-concept"
    }
  ]
}`;

  console.log(`[AI Gen] Initiating Call 1 (Question Generation) for ${job.jobKey}…`);
  const genResponse = await executeAiJsonWithFailover({
    prompt,
    systemInstruction,
    taskType: 'heavy',
  });

  const candidates = genResponse.result?.questions || [];
  if (candidates.length === 0) {
    throw new Error('AI generator returned 0 questions');
  }

  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: {
      progressPercent: 55,
      progressMessage: `Generated ${candidates.length} candidates. Initiating independent verification…`,
      generatedCount: candidates.length,
    },
  });

  // 3. Independent Verification Pipeline (Call 2)
  console.log(`[AI Gen] Initiating Call 2 (Dual-Model Independent Verification) for ${candidates.length} candidates…`);
  let verifiedCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Strip answer and explanation before sending to solver
    const solverPrompt = `You are an independent board exam evaluator. Solve the following question without bias.
Question: ${candidate.questionText}
Options:
${candidate.options.map((o) => `${o.key}) ${o.text}`).join('\n')}

Identify the single correct option (A, B, C, or D).
Return JSON format:
{
  "selectedOption": "A" | "B" | "C" | "D",
  "reason": "Brief verification reason"
}`;

    try {
      const solverRes = await executeAiJsonWithFailover({
        prompt: solverPrompt,
        systemInstruction: 'You are an objective exam key verifier. Select only the logically and scientifically correct option.',
        taskType: 'fast',
      });

      const solvedKey = String(solverRes.result?.selectedOption || '').trim().toUpperCase();
      const expectedKey = String(candidate.correctOption || '').trim().toUpperCase();

      if (solvedKey && solvedKey === expectedKey) {
        // Verification passed! Insert or update question in DB
        await Question.findOneAndUpdate(
          {
            boardCode: boardCode.toLowerCase(),
            classLevel: String(classLevel),
            subjectCode: subjectCode.toLowerCase(),
            chapterNumber: Number(chapterNumber),
            questionText: candidate.questionText.trim(),
            medium,
          },
          {
            $set: {
              hindiQuestionText: candidate.hindiQuestionText || candidate.questionText,
              options: candidate.options,
              correctOption: candidate.correctOption,
              explanation: candidate.explanation || '',
              difficulty: candidate.difficulty || 'Medium',
              subtopic: candidate.subtopic || '',
              chapterTitle,
              type: 'mcq',
              marks: 1,
              isAiGenerated: true,
              sourceLabel: 'AI-generated practice question',
              status: 'verified',
              verifiedBy: `dual-model (${genResponse.providerName} + ${solverRes.providerName})`,
              isActive: true,
            },
          },
          { upsert: true, new: true }
        );

        verifiedCount++;
      } else {
        console.warn(`[AI Gen] Verification Discrepancy on Q${i + 1}: Generator said ${expectedKey}, Solver said ${solvedKey}. Discarding question.`);
      }
    } catch (vErr) {
      console.warn(`[AI Gen] Verification call failed on Q${i + 1}: ${vErr.message}`);
    }

    // Update progress
    const currentProgress = Math.min(95, 55 + Math.round(((i + 1) / candidates.length) * 40));
    await GenerationJob.findByIdAndUpdate(job._id, {
      $set: {
        progressPercent: currentProgress,
        progressMessage: `Verified ${verifiedCount} of ${i + 1} questions…`,
        verifiedCount,
      },
    });
  }

  // 4. Update Chapter question counters
  const totalVerifiedInDb = await Question.countDocuments({
    boardCode: boardCode.toLowerCase(),
    classLevel: String(classLevel),
    subjectCode: subjectCode.toLowerCase(),
    chapterNumber: Number(chapterNumber),
    isActive: true,
    status: 'verified',
  });

  await Chapter.updateMany(
    {
      classLevel: String(classLevel),
      subjectCode: String(subjectCode).toLowerCase(),
      chapterNumber: Number(chapterNumber),
    },
    {
      $set: {
        questionCount: totalVerifiedInDb,
        verifiedQuestionCount: totalVerifiedInDb,
        isLive: totalVerifiedInDb > 0,
      },
    }
  );

  // 5. Mark job completed
  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: {
      status: 'completed',
      progressPercent: 100,
      progressMessage: `Ready! ${verifiedCount} verified questions generated.`,
      verifiedCount,
      completedAt: new Date(),
    },
  });

  console.log(`✅ [AI Gen] Job ${job.jobKey} finished successfully. Verified: ${verifiedCount}`);
  return { verifiedCount, totalVerifiedInDb };
}
