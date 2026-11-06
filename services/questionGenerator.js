import Chapter from '../models/Chapter.js';
import Question from '../models/Question.js';
import GenerationJob from '../models/GenerationJob.js';
import TestAttempt from '../models/TestAttempt.js';
import { executeAiJsonWithFailover } from '../utils/aiClient.js';
import { getChapterForMedium, getResolvedBoardConfig } from '../utils/boardEngine.js';
import { chapterTitleForMedium, normalizeMedium } from '../utils/medium.js';

const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const INITIAL_MCQ_BATCH_SIZE = 3;
const FOLLOW_UP_MCQ_BATCH_SIZE = 8;
const SUBJECTIVE_BATCH_SIZE = 2;
const MAX_EMPTY_BATCHES = 3;
const AUTOMATIC_RETRY_BASE_DELAY_MS = 30 * 1000;
const AUTOMATIC_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

let workerScheduled = false;
let workerRunning = false;
let recoveryTimer = null;

export function getAutomaticGenerationRetryAt(retryCount, now = Date.now(), providerRetryAfterMs = 0) {
  const retryExponent = Math.min(Math.max(0, Number(retryCount) || 0), 4);
  const delayMs = Math.min(
    AUTOMATIC_RETRY_MAX_DELAY_MS,
    AUTOMATIC_RETRY_BASE_DELAY_MS * (2 ** retryExponent),
  );
  return new Date(now + Math.max(delayMs, Number(providerRetryAfterMs) || 0));
}

export function getNextGenerationBatch(counts, targets) {
  for (const stage of ['mcq', 'short', 'long']) {
    if (counts[stage] >= targets[stage]) continue;
    const batchLimit = stage === 'mcq'
      ? counts.mcq === 0 ? INITIAL_MCQ_BATCH_SIZE : FOLLOW_UP_MCQ_BATCH_SIZE
      : SUBJECTIVE_BATCH_SIZE;
    return {
      stage,
      batchSize: Math.min(batchLimit, targets[stage] - counts[stage]),
    };
  }
  return null;
}

function jobScope(job) {
  return {
    boardCode: job.boardCode.toLowerCase(),
    classLevel: String(job.classLevel),
    stream: job.stream || null,
    subjectCode: job.subjectCode.toLowerCase(),
    chapterNumber: Number(job.chapterNumber),
    medium: job.medium,
    isHardMode: job.isHardMode ? true : { $ne: true },
  };
}

function progressPercent(counts, targets) {
  const totalTarget = targets.mcq + targets.short + targets.long;
  if (!totalTarget) return 100;
  const completed = Math.min(counts.mcq, targets.mcq)
    + Math.min(counts.short, targets.short)
    + Math.min(counts.long, targets.long);
  return Math.min(99, Math.floor((completed / totalTarget) * 100));
}

async function countQuestions(scope, type) {
  return Question.countDocuments({
    ...scope,
    type,
    isActive: true,
    status: 'verified',
  });
}

export function buildChapterJobKey({
  boardCode,
  classLevel,
  stream = null,
  subjectCode,
  chapterNumber,
  medium,
  isHardMode = false,
  generationMode = 'board_exam',
}) {
  const normMedium = normalizeMedium(medium);
  if (!normMedium) throw new Error(`Unsupported medium: ${medium}`);
  if (!['board_exam', 'mcq_practice'].includes(generationMode)) {
    throw new Error(`Unsupported question generation mode: ${generationMode}`);
  }
  const streamKey = stream ? `_${String(stream).trim().toLowerCase()}` : '';
  const modeKey = generationMode === 'mcq_practice' ? '_mcq_practice' : '';
  return `${boardCode.toLowerCase()}_${classLevel}_${subjectCode.toLowerCase()}_${chapterNumber}_${normMedium.toLowerCase()}${streamKey}_${isHardMode ? 'hard' : 'normal'}${modeKey}`;
}

export async function queueOrGetChapterJob({
  boardCode,
  classLevel,
  stream = null,
  subjectCode,
  chapterNumber,
  medium = 'Hindi',
  isHardMode = false,
  generationMode = 'board_exam',
  targetCount = 10,
  marksPerMcq = 1,
  targetShortCount = 0,
  shortMarks = 2,
  targetLongCount = 0,
  longMarks = 5,
}) {
  const normMedium = normalizeMedium(medium);
  if (!normMedium) throw new Error(`Unsupported medium: ${medium}`);

  const normalizedStream = stream ? String(stream).trim().toLowerCase() : null;
  const jobKey = buildChapterJobKey({
    boardCode, classLevel, stream: normalizedStream, subjectCode, chapterNumber,
    medium: normMedium, isHardMode, generationMode,
  });
  let job = await GenerationJob.findOne({ jobKey });
  const targets = {
    mcq: Math.max(0, Number(targetCount) || 0),
    short: Math.max(0, Number(targetShortCount) || 0),
    long: Math.max(0, Number(targetLongCount) || 0),
  };

  if (job?.status === 'completed') {
    const scope = jobScope(job);
    const [mcqCount, shortCount, longCount] = await Promise.all([
      countQuestions(scope, 'mcq'),
      countQuestions(scope, 'short'),
      countQuestions(scope, 'long'),
    ]);
    if (mcqCount >= targets.mcq && shortCount >= targets.short && longCount >= targets.long) return job;
  }

  if (job && job.status !== 'failed') {
    job = await GenerationJob.findByIdAndUpdate(job._id, {
      $max: {
        targetCount: targets.mcq,
        targetShortCount: targets.short,
        targetLongCount: targets.long,
      },
      $set: {
        status: job.status === 'completed' ? 'queued' : job.status,
        marksPerMcq: Number(marksPerMcq) || 1,
        shortMarks: Number(shortMarks) || 2,
        longMarks: Number(longMarks) || 5,
      },
    }, { new: true });
  } else {
    job = await GenerationJob.findOneAndUpdate({ jobKey }, {
      $set: {
        jobKey,
        boardCode: boardCode.toLowerCase(),
        classLevel: String(classLevel),
        stream: normalizedStream,
        subjectCode: subjectCode.toLowerCase(),
        chapterNumber: Number(chapterNumber),
        medium: normMedium,
        isHardMode: !!isHardMode,
        generationMode,
        status: 'queued',
        generationStage: 'mcq',
        progressPercent: 0,
        progressMessage: 'Waiting for question generation…',
        targetCount: targets.mcq,
        targetShortCount: targets.short,
        targetLongCount: targets.long,
        marksPerMcq: Number(marksPerMcq) || 1,
        shortMarks: Number(shortMarks) || 2,
        longMarks: Number(longMarks) || 5,
        workerLeaseUntil: null,
        automaticRetryCount: 0,
        emptyBatchCount: 0,
        nextRetryAt: null,
        startedAt: null,
        completedAt: null,
        error: null,
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }

  scheduleWorker();
  return job;
}

function scheduleWorker() {
  if (workerScheduled || workerRunning) return;
  workerScheduled = true;
  setImmediate(() => {
    workerScheduled = false;
    runWorker().catch((error) => console.error('[QuestionGeneration] Worker error:', error));
  });
}

export async function recoverFailedActiveAttemptJobs() {
  const activeJobIds = await TestAttempt.distinct('generationJobId', {
    status: 'in_progress',
    generationJobId: { $ne: null },
  });
  if (!activeJobIds.length) return 0;

  const result = await GenerationJob.updateMany(
    { _id: { $in: activeJobIds }, status: 'failed' },
    {
      $set: {
        status: 'queued',
        nextRetryAt: null,
        workerLeaseUntil: null,
        emptyBatchCount: 0,
        error: null,
        progressMessage: 'Automatically resuming question generation for your active exam. Existing questions are preserved.',
      },
    },
  );
  return result.modifiedCount || 0;
}

async function runWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (true) {
      const now = new Date();
      const job = await GenerationJob.findOneAndUpdate({
        $or: [
          {
            status: 'queued',
            $or: [
              { nextRetryAt: null },
              { nextRetryAt: { $exists: false } },
              { nextRetryAt: { $lte: now } },
            ],
          },
          { status: 'running', $or: [{ workerLeaseUntil: null }, { workerLeaseUntil: { $lte: now } }] },
        ],
      }, {
        $set: { status: 'running', workerLeaseUntil: new Date(now.getTime() + LEASE_MS) },
        }, {
        sort: { updatedAt: 1, createdAt: 1 },
        new: true,
      });
      if (!job) break;
      if (!job.startedAt) {
        await GenerationJob.updateOne({ _id: job._id }, { $set: { startedAt: now } });
      }

      const heartbeat = setInterval(() => {
        GenerationJob.updateOne(
          { _id: job._id, status: 'running' },
          { $set: { workerLeaseUntil: new Date(Date.now() + LEASE_MS) } },
        ).catch((error) => console.error('[QuestionGeneration] Lease renewal failed:', error));
      }, HEARTBEAT_MS);
      heartbeat.unref?.();

      try {
        await runGenerationAndVerification(job);
      } catch (error) {
        const retryCount = Number(job.automaticRetryCount) || 0;
        const nextRetryAt = getAutomaticGenerationRetryAt(retryCount, Date.now(), error.retryAfterMs);
        const nextRetryCount = retryCount + 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[QuestionGeneration] Job ${job._id} generation attempt ${nextRetryCount} failed; preserving its questions and retrying at ${nextRetryAt.toISOString()}:`, error);
        await GenerationJob.updateOne({ _id: job._id }, {
          $set: {
            status: 'queued',
            automaticRetryCount: nextRetryCount,
            nextRetryAt,
            error: errorMessage,
            progressMessage: `Question generation is temporarily unavailable. Automatically retrying in ${Math.ceil((nextRetryAt.getTime() - Date.now()) / 1000)} seconds. Existing questions are preserved.`,
            workerLeaseUntil: null,
          },
        });
        continue;
      } finally {
        clearInterval(heartbeat);
      }
    }
  } finally {
    workerRunning = false;
  }
}

export function startQuestionGenerationWorker() {
  if (recoveryTimer) return;
  const recoverAndSchedule = async () => {
    try {
      const recoveredCount = await recoverFailedActiveAttemptJobs();
      if (recoveredCount > 0) {
        console.warn(`[QuestionGeneration] Automatically resumed ${recoveredCount} failed job(s) linked to active exams.`);
      }
    } catch (error) {
      console.error('[QuestionGeneration] Failed to recover active exam jobs:', error);
    }
    scheduleWorker();
  };
  recoverAndSchedule();
  recoveryTimer = setInterval(recoverAndSchedule, 10 * 1000);
  recoveryTimer.unref?.();
}

async function generateBatch({ job, stage, batchSize, chapterTitle, boardName, scope }) {
  const isMcq = stage === 'mcq';
  const typeLabel = isMcq ? 'multiple-choice questions' : `${stage}-answer subjective questions`;
  const previousQuestions = await Question.find({
    ...scope,
    type: stage,
    isActive: true,
    status: 'verified',
  })
    .select('questionText')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const previousQuestionTexts = previousQuestions
    .map((question) => String(question.questionText || '').trim())
    .filter(Boolean);
  const schema = isMcq
    ? '{ "type":"mcq", "questionText":"...", "hindiQuestionText":"...", "options":[{"key":"A","text":"...", "hindiText":"..."},{"key":"B","text":"...", "hindiText":"..."},{"key":"C","text":"...", "hindiText":"..."},{"key":"D","text":"...", "hindiText":"..."}], "correctOption":"A", "explanation":"...", "marks":1, "difficulty":"Medium", "subtopic":"..." }'
    : `{ "type":"${stage}", "questionText":"...", "hindiQuestionText":"...", "modelAnswer":"...", "hindiModelAnswer":"...", "marks":${stage === 'short' ? job.shortMarks || 2 : job.longMarks || 5}, "difficulty":"Medium", "subtopic":"..." }`;
  const prompt = `Generate EXACTLY ${batchSize} new ${typeLabel} for the selected board and chapter.
Board: ${boardName}
Class ${job.classLevel}${job.stream ? ` | Stream: ${job.stream}` : ''} | Subject ${job.subjectCode} | Chapter ${job.chapterNumber} (${chapterTitle}) | Language: ${job.medium}
Keep questionText and option text in English. Provide a complete, natural Hindi translation in hindiQuestionText and in every option's hindiText. The student-facing UI selects the translation matching the chosen medium. Questions must stay within this chapter's syllabus, avoid duplicates, and match the board's expected difficulty.
${previousQuestionTexts.length ? `Do not repeat or paraphrase these already generated questions:\n${previousQuestionTexts.map((question) => `- ${question.slice(0, 250)}`).join('\n')}` : ''}
Return strict JSON: { "questions": [ ${schema} ] }`;
  const aiResponse = await executeAiJsonWithFailover({
    prompt,
    systemInstruction: `Create clear, syllabus-bound examination questions for ${boardName}.`,
    taskType: 'heavy',
    timeoutMs: stage === 'mcq' && batchSize <= INITIAL_MCQ_BATCH_SIZE ? 30_000 : 60_000,
  });
  const candidates = aiResponse.result?.questions;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`AI returned no ${stage} questions.`);
  }

  const previousQuestionKeys = new Set(previousQuestionTexts.map((text) => text.toLowerCase().replace(/\s+/g, ' ')));
  let inserted = 0;
  for (const candidate of candidates) {
    if (inserted >= batchSize) break;
    const questionText = typeof candidate.questionText === 'string' ? candidate.questionText.trim() : '';
    const hindiQuestionText = typeof candidate.hindiQuestionText === 'string'
      ? candidate.hindiQuestionText.trim()
      : '';
    const marks = Number(candidate.marks);
    if (!questionText || !Number.isFinite(marks) || marks <= 0) continue;
    if (job.medium === 'Hindi' && !hindiQuestionText) continue;
    if (previousQuestionKeys.has(questionText.toLowerCase().replace(/\s+/g, ' '))) continue;

    const questionFields = {
      ...scope,
      isHardMode: !!job.isHardMode,
      questionText,
      hindiQuestionText,
      difficulty: ['Easy', 'Medium', 'Hard'].includes(candidate.difficulty) ? candidate.difficulty : 'Medium',
      subtopic: typeof candidate.subtopic === 'string' ? candidate.subtopic.trim() : '',
      chapterTitle,
      type: stage,
      marks,
      isAiGenerated: true,
      sourceLabel: 'AI-generated board-pattern question',
      status: 'verified',
      verifiedBy: 'ai-structured-generation',
      isActive: true,
      options: [],
    };

    if (isMcq) {
      const options = Array.isArray(candidate.options) ? candidate.options : [];
      const normalizedOptions = options.map((option) => ({
        key: String(option.key || '').toUpperCase(),
        text: String(option.text || '').trim(),
        hindiText: String(option.hindiText || '').trim(),
      }));
      const keys = new Set(normalizedOptions.map((option) => option.key));
      const correctOption = String(candidate.correctOption || '').toUpperCase();
      if (normalizedOptions.length !== 4
        || ['A', 'B', 'C', 'D'].some((key) => !keys.has(key))
        || normalizedOptions.some((option) => !option.text)
        || (job.medium === 'Hindi' && normalizedOptions.some((option) => !option.hindiText))
        || !keys.has(correctOption)) continue;
      questionFields.options = normalizedOptions;
      questionFields.correctOption = correctOption;
      questionFields.explanation = String(candidate.explanation || '');
      questionFields.marks = Number(job.marksPerMcq) || marks;
    } else {
      const modelAnswer = String(candidate.modelAnswer || candidate.hindiModelAnswer || '').trim();
      if (!modelAnswer) continue;
      questionFields.modelAnswer = modelAnswer;
      questionFields.hindiModelAnswer = String(candidate.hindiModelAnswer || '').trim();
    }

    const result = await Question.updateOne(
      { ...scope, type: stage, questionText },
      { $setOnInsert: questionFields },
      { upsert: true },
    );
    if (result.upsertedCount) inserted++;
  }
  return inserted;
}

async function updateJobProgress(job, stage, counts, targets, emptyBatchCount) {
  const stageTarget = targets[stage];
  const stageCount = counts[stage];
  await GenerationJob.updateOne({ _id: job._id }, {
    $set: {
      status: 'queued',
      generationStage: stage,
      verifiedCount: counts.mcq,
      verifiedShortCount: counts.short,
      verifiedLongCount: counts.long,
      progressPercent: progressPercent(counts, targets),
      progressMessage: `Generating ${stage} questions (${Math.min(stageCount, stageTarget)}/${stageTarget})…`,
      workerLeaseUntil: null,
      automaticRetryCount: 0,
      error: null,
      emptyBatchCount,
      nextRetryAt: null,
    },
  });
  job.automaticRetryCount = 0;
  job.emptyBatchCount = emptyBatchCount;
  job.nextRetryAt = null;
}

async function runGenerationAndVerification(job) {
  const boardConfig = await getResolvedBoardConfig(job.boardCode);
  const chapter = await getChapterForMedium({
    boardCode: job.boardCode,
    classLevel: job.classLevel,
    stream: job.stream,
    subjectCode: job.subjectCode,
    chapterNumber: job.chapterNumber,
    medium: job.medium,
  });
  const chapterTitle = chapter
    ? chapterTitleForMedium(chapter, job.medium)
    : `Chapter ${job.chapterNumber}`;
  const scope = jobScope(job);
  const targets = {
    mcq: Math.max(0, Number(job.targetCount) || 0),
    short: Math.max(0, Number(job.targetShortCount) || 0),
    long: Math.max(0, Number(job.targetLongCount) || 0),
  };
  const counts = {
    mcq: await countQuestions(scope, 'mcq'),
    short: await countQuestions(scope, 'short'),
    long: await countQuestions(scope, 'long'),
  };

  const nextBatch = getNextGenerationBatch(counts, targets);
  if (nextBatch) {
    const inserted = await generateBatch({
      job,
      stage: nextBatch.stage,
      batchSize: nextBatch.batchSize,
      chapterTitle,
      boardName: boardConfig.name,
      scope,
    });
    counts[nextBatch.stage] = await countQuestions(scope, nextBatch.stage);
    const emptyBatchCount = inserted ? 0 : (Number(job.emptyBatchCount) || 0) + 1;
    if (emptyBatchCount >= MAX_EMPTY_BATCHES) {
      throw new Error(`Could not create distinct, valid ${nextBatch.stage} questions after ${MAX_EMPTY_BATCHES} AI batches.`);
    }
    await updateJobProgress(job, nextBatch.stage, counts, targets, emptyBatchCount);
    return;
  }

  const finalCount = counts.mcq + counts.short + counts.long;
  if (chapter) {
    await Chapter.updateOne({ _id: chapter._id }, {
      $set: {
        questionCount: finalCount,
        verifiedQuestionCount: finalCount,
        isLive: true,
      },
    });
  }
  await GenerationJob.updateOne({ _id: job._id }, {
    $set: {
      status: 'completed',
      generationStage: 'completed',
      progressPercent: 100,
      progressMessage: `Ready! ${counts.mcq} MCQs, ${counts.short} short-answer and ${counts.long} long-answer questions.`,
      verifiedCount: counts.mcq,
      verifiedShortCount: counts.short,
      verifiedLongCount: counts.long,
      workerLeaseUntil: null,
      automaticRetryCount: 0,
      emptyBatchCount: 0,
      error: null,
      completedAt: new Date(),
    },
  });
}
