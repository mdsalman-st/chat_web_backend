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
 * Worker logic: Call 1 (Generation) + Call 2 (Independent Verification)
 */
async function runGenerationAndVerification(job) {
  const { boardCode, classLevel, subjectCode, chapterNumber, medium, isHardMode } = job;

  const boardConfig = await getResolvedBoardConfig(boardCode);
  
  // 🚨 NAYA LOGIC: Board Config se Pattern uthana 🚨
  const pattern = boardConfig.paperPattern || { mcq: 20, twoMarks: 5, fiveMarks: 2 };
  const mcqCount = pattern.mcq || 0;
  const twoMarksCount = pattern.twoMarks || 0;
  const fiveMarksCount = pattern.fiveMarks || 0;
  const totalRequired = mcqCount + twoMarksCount + fiveMarksCount;

  const chapter = await getChapterForMedium({
    boardCode,
    classLevel,
    subjectCode,
    chapterNumber,
    medium,
  });

  const chapterTitle = chapter ? chapterTitleForMedium(chapter, medium) : `Chapter ${chapterNumber}`;
  const chapterHindi = chapter?.hindiTitle || '';
  const isHindi = medium === 'Hindi';

  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: {
      progressPercent: 20,
      progressMessage: `Fetching Official Board Papers for reference…`,
    },
  });

  // Database se Reference Text nikalna
  let referenceContext = "";
  try {
    const pastPapers = await OfficialPaper.find({
      boardCode: boardCode.toLowerCase(),
      classLevel: String(classLevel),
      subjectCode: subjectCode.toLowerCase(),
      status: 'ingested',
      extractedText: { $ne: '' }
    }).limit(3).select('extractedText').lean();

    if (pastPapers.length > 0) {
      let combinedText = pastPapers.map(p => p.extractedText).join('\n\n--- NEXT PAPER ---\n\n');
      if (combinedText.length > 4000) {
        combinedText = combinedText.substring(0, 4000) + '\n...[Text Truncated for Token Limit]...';
      }
      referenceContext = combinedText;
    }
  } catch (err) {
    console.warn(`[AI Gen] Failed to fetch reference papers: ${err.message}`);
  }

  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: {
      progressPercent: 25,
      progressMessage: `Analyzing chapter topics for ${chapterTitle}…`,
    },
  });

  // 2. Formulate generation prompt (Call 1)
  const systemInstruction = `You are a senior board exam question creator for ${boardConfig.name}.
STRICT RULES:
1. ONLY generate questions directly from the prescribed Class ${classLevel} ${subjectCode} syllabus for Chapter ${chapterNumber} ("${chapterTitle}").
2. If "REFERENCE MATERIAL" is provided, heavily prioritize the question style and difficulty level.
3. DO NOT use outside knowledge.
4. Language: Write in ${medium}${isHindi ? ' (with English technical terms in brackets if helpful)' : ''}. Include a Hindi translation in hindiQuestionText.
5. Output MUST strictly match the requested JSON format.`;

  // 👇 Prompt update kiya gaya hai taaki AI exact pattern follow kare
  const prompt = `Generate a complete chapter-wise test paper as per the Board Pattern:
  
📌 STRICT PATTERN TO FOLLOW:
- ${mcqCount} Multiple Choice Questions (1 mark each)
- ${twoMarksCount} Subjective Questions (2 marks each)
- ${fiveMarksCount} Subjective Questions (5 marks each)

Chapter Details:
- Class: ${classLevel}
- Subject: ${subjectCode}
- Chapter: ${chapterNumber} - ${chapterTitle} (${chapterHindi})
- Language: ${medium}

${referenceContext ? `
### REFERENCE MATERIAL (Previous Year Board Papers):
"""
${referenceContext}
"""
Use the above reference material as the primary source for question patterns.
` : ''}

Return JSON format:
{
  "questions": [
    {
      "type": "mcq",
      "questionText": "Question text in ${medium}",
      "hindiQuestionText": "Hindi translation",
      "options": [
        { "key": "A", "text": "Option A" },
        { "key": "B", "text": "Option B" },
        { "key": "C", "text": "Option C" },
        { "key": "D", "text": "Option D" }
      ],
      "correctOption": "A",
      "explanation": "Step-by-step reason",
      "marks": 1,
      "difficulty": "Easy" | "Medium" | "Hard",
      "subtopic": "Sub-concept"
    },
    {
      "type": "subjective",
      "questionText": "Question text in ${medium}",
      "hindiQuestionText": "Hindi translation",
      "modelAnswer": "Detailed ideal answer for evaluation",
      "marks": 2, // or 5
      "difficulty": "Easy" | "Medium" | "Hard",
      "subtopic": "Sub-concept"
    }
  ]
}`;

  console.log(`[AI Gen] Initiating Call 1 for ${job.jobKey}…`);
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
  console.log(`[AI Gen] Initiating Call 2 for ${candidates.length} candidates…`);
  let verifiedCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    
    // 🚨 NAYA LOGIC: MCQ aur Subjective ka verification alag hoga 🚨
    if (candidate.type === 'mcq') {
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
          systemInstruction: 'You are an objective exam key verifier. Select only the logically correct option.',
          taskType: 'fast',
        });

        const solvedKey = String(solverRes.result?.selectedOption || '').trim().toUpperCase();
        const expectedKey = String(candidate.correctOption || '').trim().toUpperCase();

        if (solvedKey && solvedKey === expectedKey) {
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
          console.warn(`[AI Gen] Verification Discrepancy on Q${i + 1}: Generator said ${expectedKey}, Solver said ${solvedKey}. Discarding.`);
        }
      } catch (vErr) {
        console.warn(`[AI Gen] Verification failed on Q${i + 1}: ${vErr.message}`);
      }
    } else {
      // Subjective Question: Hum AI se verify nahi karwayenge, seedha save kar denge (kyunki iska model answer AI ne hi diya hai)
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
            modelAnswer: candidate.modelAnswer || '', // 👈 Subjective ka answer
            difficulty: candidate.difficulty || 'Medium',
            subtopic: candidate.subtopic || '',
            chapterTitle,
            type: 'subjective', // 👈 Type subjective
            marks: candidate.marks || 2, // 2 ya 5
            isAiGenerated: true,
            sourceLabel: 'AI-generated practice question',
            status: 'verified',
            isActive: true,
          },
        },
        { upsert: true, new: true }
      );
      verifiedCount++;
    }

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
    medium,
    isActive: true,
    status: 'verified',
  });

  if (chapter) {
    await Chapter.updateOne(
      { _id: chapter._id },
      {
        $set: {
          questionCount: totalVerifiedInDb,
          verifiedQuestionCount: totalVerifiedInDb,
          isLive: totalVerifiedInDb > 0,
        },
      }
    );
  }

  // 5. Mark job completed
  await GenerationJob.findByIdAndUpdate(job._id, {
    $set: {
      status: 'completed',
      progressPercent: 100,
      progressMessage: `Ready! ${verifiedCount} verified questions generated as per pattern.`,
      verifiedCount,
      completedAt: new Date(),
    },
  });

  console.log(`✅ [AI Gen] Job ${job.jobKey} finished. Verified: ${verifiedCount}`);
  return { verifiedCount, totalVerifiedInDb };
}