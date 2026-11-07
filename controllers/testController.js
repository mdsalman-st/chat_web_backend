import BoardConfig from '../models/BoardConfig.js';
import DemandBoard from '../models/DemandBoard.js';
import User from '../models/user.js';
import Question from '../models/Question.js';
import QuestionFlag from '../models/QuestionFlag.js';
import GenerationJob from '../models/GenerationJob.js';
import TestAttempt from '../models/TestAttempt.js';
import SubjectiveSubmission from '../models/SubjectiveSubmission.js';
import Notification from '../models/Notification.js';
import OfficialPaper from '../models/OfficialPaper.js';
import { queueOrGetChapterJob } from '../services/questionGenerator.js';
import { autoGenerateChapters } from '../services/chapterGenerator.js';
import analysisQueue from '../services/analysisQueue.js';
import { generatePdfToken, verifyPdfToken, buildTestReportPdf } from '../services/pdfService.js';
import {
  ingestOfficialPaper,
  matchPaperQuestions,
  calculateMvviVviTags,
  applyMvviVviTags,
  getAvailablePapers,
  getPaperForTest,
  getPaperWithAnswers,
  getPapersPendingReview,
  adminReviewMatch,
} from '../services/paperIngestion.js';
import {
  getResolvedBoardConfig,
  getAvailableClasses,
  getStreamsForClass,
  getSubjectsForClass,
  getChapterForMedium,
  getChaptersForSubject,
} from '../utils/boardEngine.js';
import { chapterTitleForMedium, normalizeMedium } from '../utils/medium.js';
import {
  ANSWER_SHEET_UPLOAD_GRACE_MS,
  getResultReleaseState,
  RESULT_RELEASE_DELAY_MS,
} from '../utils/resultRelease.js';

const MCQ_PRACTICE_QUESTION_COUNT = 10;

function closeGenerationWait(attempt, now = new Date()) {
  if (!attempt.generationWaitStartedAt) return 0;
  const elapsedMs = Math.max(0, now.getTime() - new Date(attempt.generationWaitStartedAt).getTime());
  if (attempt.deadlineAt) {
    attempt.deadlineAt = new Date(new Date(attempt.deadlineAt).getTime() + elapsedMs);
  }
  attempt.generationWaitDurationMs = (Number(attempt.generationWaitDurationMs) || 0) + elapsedMs;
  attempt.generationWaitStartedAt = null;
  return elapsedMs;
}

function effectiveDeadlineAt(attempt, now = new Date()) {
  if (!attempt.deadlineAt) return null;
  const activeWaitMs = attempt.generationWaitStartedAt
    ? Math.max(0, now.getTime() - new Date(attempt.generationWaitStartedAt).getTime())
    : 0;
  return new Date(new Date(attempt.deadlineAt).getTime() + activeWaitMs);
}

/**
 * Test Controller — Final Optimized & Secured (Fast Start)
 */

/* --------------------------------------------------------------------------
   GET /api/tests/boards
   -------------------------------------------------------------------------- */
export async function getBoards(req, res) {
  try {
    const boards = await BoardConfig.find({ isActive: true })
      .select('code name shortName hindiName state supportedMediums hasSetCode isFallback')
      .sort({ isFallback: 1, name: 1 })
      .lean();

    const result = [
      ...boards.map((b) => ({
        code: b.code, name: b.name, shortName: b.shortName, hindiName: b.hindiName,
        state: b.state, supportedMediums: b.supportedMediums, hasSetCode: b.hasSetCode,
        isFallback: b.isFallback, isOther: false,
      })),
      {
        code: 'other', name: 'Other Board / University (अन्य बोर्ड)', shortName: 'Other',
        hindiName: 'अन्य बोर्ड', state: 'Other', supportedMediums: ['Hindi', 'English'],
        hasSetCode: false, isFallback: false, isOther: true,
      },
    ];

    res.json({ success: true, count: result.length, boards: result });
  } catch (err) {
    console.error('getBoards error:', err);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/boards/:boardCode
   -------------------------------------------------------------------------- */
export async function getBoardConfig(req, res) {
  try {
    const { boardCode } = req.params;
    const config = await getResolvedBoardConfig(boardCode);

    res.json({
      success: true,
      board: {
        code: config.code, name: config.name, shortName: config.shortName, hindiName: config.hindiName,
        state: config.state, supportedMediums: config.supportedMediums, hasSetCode: config.hasSetCode,
        setCodes: config.setCodes || [], sourceCreditText: config.sourceCreditText,
        examPhases: config.examPhases || [], paperPattern: config.paperPattern || {},
        classes: getAvailableClasses(config), isUsingFallback: config.isUsingFallback,
        fallbackNotice: config.fallbackNotice,
      },
    });
  } catch (err) {
    console.error('getBoardConfig error:', err);
    res.status(500).json({ error: 'Failed to fetch board configuration' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/boards/:boardCode/subjects
   -------------------------------------------------------------------------- */
export async function getSubjects(req, res) {
  try {
    const { boardCode } = req.params;
    const classLevel = req.query.class || '10';
    const streamId = req.query.stream || null;

    const config = await getResolvedBoardConfig(boardCode);
    const subjects = getSubjectsForClass(config, classLevel, streamId);
    const streams = getStreamsForClass(config, classLevel);

    res.json({
      success: true, boardCode: config.code, boardName: config.shortName,
      classLevel, streamId, availableStreams: streams, subjects,
      isUsingFallback: config.isUsingFallback, fallbackNotice: config.fallbackNotice,
    });
  } catch (err) {
    console.error('getSubjects error:', err);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/boards/:boardCode/chapters
   -------------------------------------------------------------------------- */
export async function getChapters(req, res) {
  try {
    const { boardCode } = req.params;
    const classLevel = req.query.class || '10';
    const subjectCode = req.query.subject;
    const stream = req.query.stream || null;
    const phase = req.query.phase || null;
    const medium = normalizeMedium(req.query.medium || req.user?.studentProfile?.medium || 'Hindi');

    if (!subjectCode) return res.status(400).json({ error: 'subject query parameter is required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    let { chapters, usedFallbackChapters } = await getChaptersForSubject({
      boardCode, classLevel, subjectCode, stream, phase, medium,
    });

    if (!chapters) chapters = [];

    res.json({
      success: true, count: chapters.length, boardCode, classLevel, subjectCode, medium, usedFallbackChapters,
      chapters: chapters.map((c) => ({
        id: c._id, chapterNumber: c.chapterNumber, title: chapterTitleForMedium(c, medium),
        hindiTitle: c.hindiTitle || '', phaseCutoff: c.phaseCutoff,
        questionCount: c.questionCount || 0, verifiedQuestionCount: c.verifiedQuestionCount || 0,
        isLive: (c.questionCount > 0) || c.isLive,
        statusLabel: (c.questionCount > 0 || c.isLive) ? 'Live' : 'Coming soon',
      })),
    });
  } catch (err) {
    console.error('getChapters error:', err);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/profile
   -------------------------------------------------------------------------- */
export async function getStudentProfile(req, res) {
  try {
    const user = req.user;
    const profile = user.studentProfile || {};

    const classLabel = profile.classLevel ? `Class ${profile.classLevel}` : 'Class 10';
    const boardLabel = profile.isOtherBoard ? (profile.otherBoardName || 'Custom Board') : (profile.boardName || 'BSEB');
    const mediumLabel = profile.medium || 'Hindi';
    const formattedBadge = `${classLabel} • ${boardLabel} • ${mediumLabel}`;

    res.json({
      success: true,
      profile: {
        board: profile.board || 'ncert_default', boardName: profile.boardName || 'NCERT Default',
        isOtherBoard: !!profile.isOtherBoard, otherBoardName: profile.otherBoardName || '',
        classLevel: profile.classLevel || '10', stream: profile.stream || null,
        streamName: profile.streamName || null, medium: profile.medium || 'Hindi',
        selectedSubjects: profile.selectedSubjects || [], academicYear: profile.academicYear || '2025-2026',
        targetGoal: profile.targetGoal || '', isProfileComplete: !!profile.isProfileComplete, formattedBadge,
      },
    });
  } catch (err) {
    console.error('getStudentProfile error:', err);
    res.status(500).json({ error: 'Failed to get student profile' });
  }
}

/* --------------------------------------------------------------------------
   PUT /api/tests/profile
   -------------------------------------------------------------------------- */
export async function updateStudentProfile(req, res) {
  try {
    const { board, otherBoardName, classLevel, stream, streamName, medium, selectedSubjects, targetGoal } = req.body;

    if (!board) return res.status(400).json({ error: 'Board selection is required' });
    if (!classLevel) return res.status(400).json({ error: 'Class level is required' });
    const normalizedMedium = normalizeMedium(medium || 'Hindi');
    if (!normalizedMedium) return res.status(400).json({ error: 'Unsupported language / medium' });

    const isOtherBoard = board === 'other' || board === 'Other';
    let resolvedBoardName = 'NCERT Default';

    if (isOtherBoard) {
      if (!otherBoardName || !otherBoardName.trim()) return res.status(400).json({ error: 'Please enter your Board / University name' });
      resolvedBoardName = otherBoardName.trim();

      await DemandBoard.findOneAndUpdate(
        { normalizedName: resolvedBoardName.toLowerCase() },
        {
          $setOnInsert: { name: resolvedBoardName }, $inc: { requestedCount: 1 },
          $set: { lastRequestedAt: new Date() },
          $push: { students: { userId: req.user._id, email: req.user.email, classLevel, requestedAt: new Date() } },
        },
        { upsert: true, new: true }
      );
    } else {
      const bConfig = await BoardConfig.findOne({ code: board.toLowerCase() }).lean();
      if (bConfig) resolvedBoardName = bConfig.shortName || bConfig.name;
    }

    const updatedProfile = {
      board: isOtherBoard ? 'other' : board.toLowerCase().trim(), boardName: resolvedBoardName,
      isOtherBoard, otherBoardName: isOtherBoard ? resolvedBoardName : '',
      classLevel: String(classLevel).replace(/[^0-9]/g, '') || String(classLevel),
      stream: stream || null, streamName: streamName || null, medium: normalizedMedium,
      selectedSubjects: Array.isArray(selectedSubjects) ? selectedSubjects : [],
      academicYear: req.body.academicYear || '2025-2026', targetGoal: targetGoal || '', isProfileComplete: true,
    };

    updatedProfile.formattedBadge = `Class ${updatedProfile.classLevel} • ${updatedProfile.boardName} • ${updatedProfile.medium}`;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          studentProfile: updatedProfile,
          'roleDetails.class': `Class ${updatedProfile.classLevel}`,
          'roleDetails.board': updatedProfile.boardName,
          'roleDetails.stream': updatedProfile.streamName || updatedProfile.stream,
          'roleDetails.medium': updatedProfile.medium,
          'roleDetails.subjects': updatedProfile.selectedSubjects.map((s) => s.name || s.code),
        },
      },
      { new: true }
    );

    res.json({ success: true, message: 'Student academic profile updated successfully', profile: updatedProfile, user: user.toJSON() });
  } catch (err) {
    console.error('updateStudentProfile error:', err);
    res.status(500).json({ error: 'Failed to update academic profile' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tests/chapters/prepare (FAST START LOGIC)
   -------------------------------------------------------------------------- */
export async function prepareChapterQuestions(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const boardCode = req.body.boardCode || studentProf.board || 'bseb';
    const classLevel = req.body.classLevel || studentProf.classLevel || '10';
    const stream = (req.body.stream || studentProf.stream)
      ? String(req.body.stream || studentProf.stream).trim().toLowerCase()
      : null;
    const subjectCode = req.body.subjectCode;
    const chapterNumber = Number(req.body.chapterNumber);
    const medium = normalizeMedium(req.body.medium || studentProf.medium || 'Hindi');
    const isHardMode = !!req.body.isHardMode;

    if (!subjectCode || !chapterNumber) return res.status(400).json({ error: 'subjectCode and chapterNumber are required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    const boardConfig = await getResolvedBoardConfig(boardCode);
    const pattern = boardConfig.paperPattern || {};
    const targetCount = Math.max(0, Number(pattern.mcqCount) || 0);
    const targetShortCount = pattern.hasShortAnswer ? Math.max(0, Number(pattern.shortCount) || 0) : 0;
    const targetLongCount = pattern.hasLongAnswer ? Math.max(0, Number(pattern.longCount) || 0) : 0;

    const existingCount = await Question.countDocuments({
      boardCode: boardCode.toLowerCase(), classLevel: String(classLevel),
      stream,
      subjectCode: subjectCode.toLowerCase(), chapterNumber, medium, isHardMode: isHardMode ? true : { $ne: true },
      type: 'mcq', isActive: true, status: 'verified',
    });

    const minStartCount = Math.max(1, Math.min(3, targetCount));

    const job = await queueOrGetChapterJob({
      boardCode,
      classLevel,
      stream,
      subjectCode,
      chapterNumber,
      medium,
      isHardMode,
      targetCount,
      marksPerMcq: pattern.marksPerMcq,
      targetShortCount,
      shortMarks: pattern.shortMarks,
      targetLongCount,
      longMarks: pattern.longMarks,
    });

    if (existingCount >= minStartCount) {
      return res.json({ 
        success: true, 
        ready: true, 
        generationJobId: job._id,
        isGenerating: job.status !== 'completed',
        count: existingCount, 
        minStartCount,
        pattern: {
          mcqCount: targetCount,
          attemptLimit: pattern.attemptLimit,
          marksPerMcq: pattern.marksPerMcq,
          shortCount: targetShortCount,
          shortMarks: pattern.shortMarks,
          longCount: targetLongCount,
          longMarks: pattern.longMarks,
          durationMinutes: pattern.durationMinutes,
          totalMarks: pattern.totalMarks,
        },
        message: 'Your exam is ready. Remaining questions are being generated in the background.',
      });
    }

    res.json({
      success: true, ready: false, isGenerating: true,
      jobId: job._id, jobKey: job.jobKey, status: job.status, progressPercent: job.progressPercent,
      progressMessage: `Generating first questions... (${existingCount}/${minStartCount})`,
      availableCount: existingCount,
      verifiedCount: job.verifiedCount,
      minStartCount,
      pattern: {
        mcqCount: targetCount,
        attemptLimit: pattern.attemptLimit,
        marksPerMcq: pattern.marksPerMcq,
        shortCount: targetShortCount,
        shortMarks: pattern.shortMarks,
        longCount: targetLongCount,
        longMarks: pattern.longMarks,
        durationMinutes: pattern.durationMinutes,
        totalMarks: pattern.totalMarks,
      },
    });
  } catch (err) {
    console.error('prepareChapterQuestions error:', err);
    res.status(500).json({ error: err.message || 'Failed to prepare questions' });
  }
}

export async function prepareChapterMcqPractice(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const boardCode = String(req.body.boardCode || studentProf.board || 'bseb').toLowerCase();
    const classLevel = String(req.body.classLevel || studentProf.classLevel || '10');
    const stream = (req.body.stream || studentProf.stream)
      ? String(req.body.stream || studentProf.stream).trim().toLowerCase()
      : null;
    const subjectCode = String(req.body.subjectCode || '').trim().toLowerCase();
    const chapterNumber = Number(req.body.chapterNumber);
    const medium = normalizeMedium(req.body.medium || studentProf.medium || 'Hindi');
    const isHardMode = !!req.body.isHardMode;

    if (!subjectCode || !Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ error: 'subjectCode and a valid chapterNumber are required' });
    }
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    const existingCount = await Question.countDocuments({
      boardCode, classLevel, stream, subjectCode, chapterNumber, medium,
      isHardMode: isHardMode ? true : { $ne: true },
      type: 'mcq', isActive: true, status: 'verified',
    });
    const minStartCount = Math.min(3, MCQ_PRACTICE_QUESTION_COUNT);
    const job = await queueOrGetChapterJob({
      boardCode,
      classLevel,
      stream,
      subjectCode,
      chapterNumber,
      medium,
      isHardMode,
      generationMode: 'mcq_practice',
      targetCount: MCQ_PRACTICE_QUESTION_COUNT,
      marksPerMcq: 1,
      targetShortCount: 0,
      targetLongCount: 0,
    });

    const response = {
      success: true,
      ready: existingCount >= minStartCount,
      isGenerating: job.status !== 'completed',
      generationJobId: job._id,
      jobId: job._id,
      jobKey: job.jobKey,
      status: job.status,
      progressPercent: job.progressPercent,
      progressMessage: `Preparing MCQ practice questions (${existingCount}/${minStartCount} ready to start).`,
      availableCount: existingCount,
      verifiedCount: job.verifiedCount,
      minStartCount,
      pattern: {
        mcqCount: MCQ_PRACTICE_QUESTION_COUNT,
        attemptLimit: MCQ_PRACTICE_QUESTION_COUNT,
        marksPerMcq: 1,
        shortCount: 0,
        longCount: 0,
        durationMinutes: 0,
        totalMarks: MCQ_PRACTICE_QUESTION_COUNT,
      },
    };
    return res.json(response);
  } catch (err) {
    console.error('prepareChapterMcqPractice error:', err);
    return res.status(500).json({ error: err.message || 'Failed to prepare MCQ practice questions' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/jobs/:jobId
   -------------------------------------------------------------------------- */
export async function getGenerationJobStatus(req, res) {
  try {
    const { jobId } = req.params;
    const job = await GenerationJob.findById(jobId).lean();
    if (!job) return res.status(404).json({ error: 'Generation job not found' });

    const availableCount = await Question.countDocuments({
      boardCode: job.boardCode.toLowerCase(),
      classLevel: String(job.classLevel),
      stream: job.stream || null,
      subjectCode: job.subjectCode.toLowerCase(),
      chapterNumber: Number(job.chapterNumber),
      medium: job.medium,
      isHardMode: job.isHardMode ? true : { $ne: true },
      type: 'mcq',
      isActive: true,
      status: 'verified',
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true, job: {
        id: job._id, status: job.status, progressPercent: job.progressPercent,
        progressMessage: job.progressMessage, verifiedCount: availableCount, availableCount,
        targetCount: job.targetCount, error: job.error, completedAt: job.completedAt,
        targetShortCount: job.targetShortCount, verifiedShortCount: job.verifiedShortCount,
        targetLongCount: job.targetLongCount, verifiedLongCount: job.verifiedLongCount,
        automaticRetryCount: job.automaticRetryCount || 0,
        nextRetryAt: job.nextRetryAt,
      },
    });
  } catch (err) {
    console.error('getGenerationJobStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/:attemptId/state
   -------------------------------------------------------------------------- */
export async function getAttemptState(req, res) {
  try {
    const { attemptId } = req.params;
    const attempt = await TestAttempt.findOne({ _id: attemptId, userId: req.user._id }).lean();
    if (!attempt) return res.status(404).json({ error: 'Test attempt not found' });

    // Fetch questions in stored order
    const questions = await Question.find({ _id: { $in: attempt.questionIds } }).select('-correctOption -explanation').lean();
    const idOrder = new Map(attempt.questionIds.map((id, idx) => [id.toString(), idx]));
    questions.sort((a, b) => (idOrder.get(a._id.toString()) ?? 0) - (idOrder.get(b._id.toString()) ?? 0));

    const mcqQuestions = questions.filter(q => q.type === 'mcq');
    const subjectiveQuestions = questions.filter(q => q.type === 'short' || q.type === 'long');
    const sourcePaper = attempt.testType === 'full_paper'
      ? await getPaperForTest(attempt.paperId)
      : null;

    // Build answers map
    const answers = (attempt.answers || [])
      .filter(a => a.questionId && a.selectedOption)
      .map(a => ({
        questionId: a.questionId.toString(),
        selectedOption: a.selectedOption,
        isSkipped: a.isSkipped,
        firstAnsweredAt: a.firstAnsweredAt,
        countsTowardLimit: a.countsTowardLimit,
      }));

    res.json({
      success: true,
      attemptId: attempt._id,
      testType: attempt.testType,
      subjectName: attempt.subjectName,
      chapterTitle: attempt.chapterTitle,
      medium: attempt.medium,
      generationJobId: attempt.generationJobId,
      deadlineAt: attempt.deadlineAt,
      generationWaitStartedAt: attempt.generationWaitStartedAt,
      generationWaitDurationMs: attempt.generationWaitDurationMs,
      subjectiveUploadDeadlineAt: attempt.subjectiveUploadDeadlineAt,
      subjectiveRequired: attempt.subjectiveRequired,
      timeLimitMs: attempt.timeLimitMs,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      status: attempt.status,
      subjectiveRequired: attempt.subjectiveRequired,
      subjectiveSubmissionId: attempt.subjectiveSubmissionId,
      currentQuestionIndex: attempt.currentQuestionIndex,
      currentSection: attempt.currentSection,
      boardPatternSnapshot: attempt.boardPatternSnapshot,
      questions: mcqQuestions.map((q, idx) => ({ index: idx, id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 1, chapterNumber: q.chapterNumber })),
      subjectiveQuestions: sourcePaper
        ? sourcePaper.questions
          .filter(q => q.questionType === 'subjective')
          .map(q => ({
            questionNumber: q.questionNumber,
            questionText: q.questionText,
            hindiQuestionText: q.hindiQuestionText,
            marks: q.marks,
          }))
        : subjectiveQuestions.map((q, idx) => ({
          id: q._id,
          questionNumber: idx + 1,
          type: q.type,
          questionText: q.questionText,
          hindiQuestionText: q.hindiQuestionText,
          difficulty: q.difficulty,
          subtopic: q.subtopic,
          marks: q.marks || 2,
          chapterNumber: q.chapterNumber,
        })),
      answers,
    });
  } catch (err) {
    console.error('getAttemptState error:', err);
    res.status(500).json({ error: 'Failed to fetch attempt state' });
  }
}

export async function syncAttemptQuestions(req, res) {
  try {
    let attempt = await TestAttempt.findOne({
      _id: req.params.attemptId,
      userId: req.user._id,
      status: 'in_progress',
    });
    if (!attempt) return res.status(404).json({ error: 'Active test attempt not found' });
    if (!attempt.generationJobId || attempt.testType === 'full_paper') {
      return res.json({ success: true, addedQuestions: [], addedSubjectiveQuestions: [], generationJob: null });
    }

    const job = await GenerationJob.findOne({
      _id: attempt.generationJobId,
      boardCode: attempt.boardCode,
      classLevel: attempt.classLevel,
      stream: attempt.stream || null,
      subjectCode: attempt.subjectCode,
      chapterNumber: attempt.chapterNumber,
      medium: attempt.medium,
      isHardMode: attempt.isHardMode,
      generationMode: attempt.testType === 'chapter_mcq_practice' ? 'mcq_practice' : { $ne: 'mcq_practice' },
    }).lean();
    if (!job) return res.status(409).json({ error: 'Question generation job does not match this test attempt' });

    const existingIds = new Set(attempt.questionIds.map((id) => id.toString()));
    const existingQuestions = await Question.find({ _id: { $in: attempt.questionIds } })
      .select('_id type')
      .lean();
    const candidateQuestions = await Question.find({
        boardCode: job.boardCode,
        classLevel: job.classLevel,
        stream: job.stream || null,
        subjectCode: job.subjectCode,
        chapterNumber: job.chapterNumber,
        medium: job.medium,
        isHardMode: job.isHardMode ? true : { $ne: true },
        type: { $in: ['mcq', 'short', 'long'] },
        isActive: true,
        status: 'verified',
      })
        .select('-correctOption -explanation')
        .sort({ createdAt: 1, _id: 1 })
        .lean();
    const existingCounts = {
      mcq: existingQuestions.filter((question) => question.type === 'mcq').length,
      short: existingQuestions.filter((question) => question.type === 'short').length,
      long: existingQuestions.filter((question) => question.type === 'long').length,
    };
    const stageTargets = {
      mcq: Number(job.targetCount) || 0,
      short: Number(job.targetShortCount) || 0,
      long: Number(job.targetLongCount) || 0,
    };
    const addedByType = { mcq: [], short: [], long: [] };
    for (const type of ['mcq', 'short', 'long']) {
      const remaining = Math.max(0, stageTargets[type] - existingCounts[type]);
      addedByType[type] = candidateQuestions
        .filter((question) => question.type === type && !existingIds.has(question._id.toString()))
        .slice(0, remaining);
      addedByType[type].forEach((question) => existingIds.add(question._id.toString()));
    }
    const addedQuestions = addedByType.mcq;
    const addedSubjectiveQuestions = [...addedByType.short, ...addedByType.long];
    const newQuestions = [...addedQuestions, ...addedSubjectiveQuestions];

    if (newQuestions.length) {
      const updatedAttempt = await TestAttempt.findOneAndUpdate(
        { _id: attempt._id, userId: req.user._id, status: 'in_progress' },
        { $addToSet: { questionIds: { $each: newQuestions.map((question) => question._id) } } },
        { new: true }
      );
      if (!updatedAttempt) return res.status(404).json({ error: 'Active test attempt not found' });
      attempt = updatedAttempt;

      const allAttemptQuestions = await Question.find({ _id: { $in: attempt.questionIds } })
        .select('_id type')
        .lean();
      const totalQuestions = allAttemptQuestions.filter((question) => question.type === 'mcq').length;
      const subjectiveRequired = allAttemptQuestions.some((question) => question.type === 'short' || question.type === 'long');
      if (attempt.totalQuestions !== totalQuestions) {
        attempt.totalQuestions = totalQuestions;
      }
      if (subjectiveRequired && !attempt.subjectiveRequired) attempt.subjectiveRequired = true;
      await attempt.save();
    }

    if (attempt.generationWaitStartedAt && (newQuestions.length || job.status === 'completed')) {
      closeGenerationWait(attempt);
      await attempt.save();
    }

    if (job.status === 'completed' && attempt.subjectiveRequired && !attempt.subjectiveUploadDeadlineAt) {
      const uploadWindowBase = Math.max(
        attempt.deadlineAt?.getTime() || 0,
        job.completedAt?.getTime() || Date.now(),
      );
      attempt.subjectiveUploadDeadlineAt = new Date(uploadWindowBase + ANSWER_SHEET_UPLOAD_GRACE_MS);
      await attempt.save();
    }

    res.json({
      success: true,
      addedQuestions: addedQuestions.map((question) => ({
        id: question._id,
        questionText: question.questionText,
        hindiQuestionText: question.hindiQuestionText,
        options: question.options,
        difficulty: question.difficulty,
        subtopic: question.subtopic,
        marks: question.marks || 1,
        chapterNumber: question.chapterNumber,
      })),
      addedSubjectiveQuestions: addedSubjectiveQuestions.map((question) => ({
        id: question._id,
        questionNumber: question.questionNumber,
        type: question.type,
        questionText: question.questionText,
        hindiQuestionText: question.hindiQuestionText,
        marks: question.marks,
        chapterNumber: question.chapterNumber,
      })),
      generationJob: {
        id: job._id,
        status: job.status,
        generationStage: job.generationStage,
        progressPercent: job.progressPercent,
        progressMessage: job.progressMessage,
        verifiedCount: job.verifiedCount,
        targetCount: job.targetCount,
        verifiedShortCount: job.verifiedShortCount,
        targetShortCount: job.targetShortCount,
        verifiedLongCount: job.verifiedLongCount,
        targetLongCount: job.targetLongCount,
        error: job.error,
      },
      deadlineAt: attempt.deadlineAt,
      generationWaitStartedAt: attempt.generationWaitStartedAt,
      subjectiveUploadDeadlineAt: attempt.subjectiveUploadDeadlineAt,
    });
  } catch (err) {
    console.error('syncAttemptQuestions error:', err);
    res.status(500).json({ error: 'Failed to sync generated questions' });
  }
}

export async function retryAttemptGeneration(req, res) {
  try {
    const attempt = await TestAttempt.findOne({
      _id: req.params.attemptId,
      userId: req.user._id,
      status: 'in_progress',
    });
    if (!attempt) return res.status(404).json({ error: 'Active test attempt not found' });
    if (attempt.testType === 'full_paper' || !attempt.generationJobId) {
      return res.status(409).json({ error: 'This attempt has no retryable chapter-generation job' });
    }

    const jobScope = {
      _id: attempt.generationJobId,
      boardCode: attempt.boardCode,
      classLevel: attempt.classLevel,
      stream: attempt.stream || null,
      subjectCode: attempt.subjectCode,
      chapterNumber: attempt.chapterNumber,
      medium: attempt.medium,
      isHardMode: !!attempt.isHardMode,
      generationMode: attempt.testType === 'chapter_mcq_practice' ? 'mcq_practice' : { $ne: 'mcq_practice' },
    };
    const job = await GenerationJob.findOne(jobScope).lean();
    if (!job) return res.status(409).json({ error: 'Question generation job does not match this test attempt' });

    if (job.status === 'failed') {
      const restartedJob = await GenerationJob.findOneAndUpdate(
        { ...jobScope, status: 'failed' },
        {
          $set: {
            status: 'queued',
            generationStage: 'mcq',
            progressPercent: 0,
            progressMessage: 'Retry queued. Existing questions and answers will be preserved.',
            workerLeaseUntil: null,
            automaticRetryCount: 0,
            emptyBatchCount: 0,
            nextRetryAt: null,
            error: null,
            startedAt: null,
            completedAt: null,
          },
        },
        { new: true },
      );
      if (restartedJob) {
        return res.json({
          success: true,
          jobId: restartedJob._id,
          status: restartedJob.status,
          progressMessage: restartedJob.progressMessage,
        });
      }

      const latestJob = await GenerationJob.findOne(jobScope).lean();
      if (!latestJob || latestJob.status === 'failed') {
        return res.status(409).json({ error: 'Could not restart question generation. Please retry.' });
      }
      return res.json({
        success: true,
        jobId: latestJob._id,
        status: latestJob.status,
        progressMessage: latestJob.progressMessage,
      });
    }

    return res.json({
      success: true,
      jobId: job._id,
      status: job.status,
      progressMessage: job.progressMessage,
    });
  } catch (err) {
    console.error('retryAttemptGeneration error:', err);
    res.status(500).json({ error: 'Failed to retry question generation' });
  }
}

export async function updateAttemptState(req, res) {
  try {
    const { attemptId } = req.params;
    const { currentQuestionIndex, currentSection, generationWaiting } = req.body;
    const attempt = await TestAttempt.findOne({
      _id: attemptId,
      userId: req.user._id,
      status: 'in_progress',
    });
    if (!attempt) return res.status(404).json({ error: 'Active test attempt not found' });

    if (currentQuestionIndex === undefined && currentSection === undefined && generationWaiting === undefined) {
      return res.status(400).json({ error: 'At least one attempt state field is required' });
    }

    if (currentQuestionIndex !== undefined) {
      const index = Number(currentQuestionIndex);
      if (!Number.isInteger(index) || index < 0 || index >= attempt.totalQuestions) {
        return res.status(400).json({ error: 'Invalid current question index' });
      }
      attempt.currentQuestionIndex = index;
    }

    if (currentSection !== undefined) {
      if (!['mcq', 'subjective'].includes(currentSection)) {
        return res.status(400).json({ error: 'Invalid current section' });
      }
      attempt.currentSection = currentSection;
    }

    if (generationWaiting !== undefined) {
      if (typeof generationWaiting !== 'boolean') {
        return res.status(400).json({ error: 'generationWaiting must be a boolean' });
      }
      if (generationWaiting) {
        if (!attempt.generationJobId || attempt.testType === 'full_paper') {
          return res.status(409).json({ error: 'This exam has no background question generation to wait for' });
        }
        const effectiveDeadline = effectiveDeadlineAt(attempt);
        if (effectiveDeadline && new Date() >= effectiveDeadline) {
          return res.status(409).json({ error: 'Exam time has expired' });
        }
        if (attempt.currentQuestionIndex !== attempt.totalQuestions - 1) {
          return res.status(409).json({ error: 'Timer can only pause at the last available question' });
        }
        if (!attempt.generationWaitStartedAt) attempt.generationWaitStartedAt = new Date();
      } else {
        closeGenerationWait(attempt);
      }
    } else if (
      attempt.generationWaitStartedAt
      && (attempt.currentQuestionIndex < attempt.totalQuestions - 1 || attempt.currentSection === 'subjective')
    ) {
      closeGenerationWait(attempt);
    }

    await attempt.save();
    res.json({
      success: true,
      currentQuestionIndex: attempt.currentQuestionIndex,
      currentSection: attempt.currentSection,
      deadlineAt: attempt.deadlineAt,
      generationWaitStartedAt: attempt.generationWaitStartedAt,
      generationWaitDurationMs: attempt.generationWaitDurationMs,
    });
  } catch (err) {
    console.error('updateAttemptState error:', err);
    res.status(500).json({ error: 'Failed to save attempt state' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/chapters/:chapterNumber/questions
   -------------------------------------------------------------------------- */
export async function getChapterPracticeQuestions(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const chapterNumber = Number(req.params.chapterNumber);
    const boardCode = req.query.boardCode || studentProf.board || 'bseb';
    const classLevel = req.query.classLevel || studentProf.classLevel || '10';
    const subjectCode = req.query.subjectCode;
    const medium = normalizeMedium(req.query.medium || studentProf.medium || 'Hindi');
    const limit = Math.min(50, Number(req.query.limit) || 15);

    if (!subjectCode || isNaN(chapterNumber)) return res.status(400).json({ error: 'subjectCode query and valid chapterNumber param required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    const stream = req.query.stream || studentProf.stream
      ? String(req.query.stream || studentProf.stream).trim().toLowerCase()
      : null;
    const isHardMode = req.query.isHardMode === 'true';
    const query = {
      classLevel: String(classLevel),
      stream,
      subjectCode: subjectCode.toLowerCase(),
      chapterNumber,
      medium,
      isHardMode: isHardMode ? true : { $ne: true },
      isActive: true,
      status: 'verified',
    };

    let questions = await Question.find({ boardCode: boardCode.toLowerCase(), ...query }).select('-correctOption -explanation').limit(limit).lean();

    let usedFallback = false;
    if (questions.length === 0 && boardCode.toLowerCase() !== 'ncert_default') {
      questions = await Question.find({ boardCode: 'ncert_default', ...query }).select('-correctOption -explanation').limit(limit).lean();
      if (questions.length > 0) usedFallback = true;
    }

    let notice = null;
    if (questions.length > 0 && questions.length < 5) notice = `This chapter currently has ${questions.length} questions.`;

    res.json({
      success: true, count: questions.length, chapterNumber, subjectCode, medium, usedFallback, notice,
      questions: questions.map((q) => ({
        id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText,
        options: q.options, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 1,
        sourceLabel: q.sourceLabel || 'AI-generated practice question', isAiGenerated: !!q.isAiGenerated,
      })),
    });
  } catch (err) {
    console.error('getChapterPracticeQuestions error:', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tests/questions/:questionId/flag
   -------------------------------------------------------------------------- */
export async function flagQuestion(req, res) {
  try {
    const { questionId } = req.params;
    const { reason, comment } = req.body;

    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    await QuestionFlag.findOneAndUpdate(
      { questionId: question._id, userId: req.user._id },
      { $set: { reason: reason || 'wrong_answer', comment: comment ? String(comment).slice(0, 500) : '', status: 'pending' } },
      { upsert: true }
    );

    question.flagCount = (question.flagCount || 0) + 1;
    if (question.flagCount >= (question.flagThreshold || 3)) {
      question.isActive = false;
      question.status = 'flagged';
    }

    await question.save();
    res.json({ success: true, message: 'Question flagged.', flagCount: question.flagCount, isDisabled: !question.isActive });
  } catch (err) {
    console.error('flagQuestion error:', err);
    res.status(500).json({ error: 'Failed to report question' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tests/start (AUTO-UPDATE LOGIC)
   -------------------------------------------------------------------------- */
export async function startTest(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const { subjectCode, chapterNumber, testType = 'chapter_practice', isHardMode = false, paperId, generationJobId } = req.body;
    const isMcqPractice = testType === 'chapter_mcq_practice';

    const boardCode = req.body.boardCode || studentProf.board || 'bseb';
    const classLevel = req.body.classLevel || studentProf.classLevel || '10';
    const stream = (req.body.stream || studentProf.stream)
      ? String(req.body.stream || studentProf.stream).trim().toLowerCase()
      : null;
    const medium = normalizeMedium(req.body.medium || studentProf.medium || 'Hindi');

    if (!subjectCode) return res.status(400).json({ error: 'subjectCode is required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });
    if (isMcqPractice && (!chapterNumber || !generationJobId)) {
      return res.status(400).json({ error: 'MCQ chapter practice requires a chapter and its preparation job' });
    }

    let linkedGenerationJob = null;
    if (generationJobId) {
      if (!chapterNumber || !/^[\da-f]{24}$/i.test(String(generationJobId))) {
        return res.status(400).json({ error: 'Invalid question generation job' });
      }
      linkedGenerationJob = await GenerationJob.findOne({
        _id: generationJobId,
        boardCode: boardCode.toLowerCase(),
        classLevel: String(classLevel),
        stream,
        subjectCode: subjectCode.toLowerCase(),
        chapterNumber: Number(chapterNumber),
        medium,
        isHardMode: !!isHardMode,
        generationMode: isMcqPractice ? 'mcq_practice' : { $ne: 'mcq_practice' },
      }).lean();
      if (!linkedGenerationJob) {
        return res.status(400).json({ error: 'Question generation job does not match this test' });
      }
    }

    // Get board pattern for this attempt
    const config = await getResolvedBoardConfig(boardCode);
    const pattern = config.paperPattern || {};
    const activePattern = isMcqPractice
      ? {
        ...pattern,
        mcqCount: MCQ_PRACTICE_QUESTION_COUNT,
        attemptLimit: MCQ_PRACTICE_QUESTION_COUNT,
        marksPerMcq: 1,
        durationMinutes: 0,
        negativeMarking: 0,
        hasShortAnswer: false,
        shortCount: 0,
        shortMarks: 0,
        shortAttemptLimit: 0,
        hasLongAnswer: false,
        longCount: 0,
        longMarks: 0,
        longAttemptLimit: 0,
        totalMarks: MCQ_PRACTICE_QUESTION_COUNT,
      }
      : pattern;

    // 🚨 1. RESUME LOGIC - Exact match on attempt identity 🚨
    const attemptQuery = {
      userId: req.user._id,
      boardCode: boardCode.toLowerCase(),
      classLevel: String(classLevel),
      stream,
      subjectCode: subjectCode.toLowerCase(),
      chapterNumber: chapterNumber ? Number(chapterNumber) : null,
      medium,
      testType,
      isHardMode: !!isHardMode,
      status: 'in_progress',
    };
    attemptQuery.paperId = paperId || null;

    let attempt = await TestAttempt.findOne(attemptQuery);

    if (attempt) {
      if (!attempt.generationJobId && linkedGenerationJob) {
        attempt.generationJobId = linkedGenerationJob._id;
        await attempt.save();
      }

      let freshQuestions = await Question.find({ _id: { $in: attempt.questionIds } }).lean();
      // Sort by the order in attempt.questionIds
      const idOrder = new Map(attempt.questionIds.map((id, idx) => [id.toString(), idx]));
      freshQuestions.sort((a, b) => (idOrder.get(a._id.toString()) ?? 0) - (idOrder.get(b._id.toString()) ?? 0));

      const currentMcqQuestions = freshQuestions.filter((question) => question.type === 'mcq');
      const subjectiveQuestions = freshQuestions.filter((question) => question.type === 'short' || question.type === 'long');
      attempt.totalQuestions = currentMcqQuestions.length;
      if (subjectiveQuestions.length) attempt.subjectiveRequired = true;
      await attempt.save();

      return res.json({
        success: true, 
        attemptId: attempt._id, 
        testType: attempt.testType, 
        subjectName: attempt.subjectName, 
        chapterTitle: attempt.chapterTitle,
        totalQuestions: currentMcqQuestions.length,
        medium: attempt.medium,
        generationJobId: attempt.generationJobId,
        deadlineAt: attempt.deadlineAt,
        generationWaitStartedAt: attempt.generationWaitStartedAt,
        generationWaitDurationMs: attempt.generationWaitDurationMs,
        subjectiveUploadDeadlineAt: attempt.subjectiveUploadDeadlineAt,
        subjectiveRequired: attempt.subjectiveRequired,
        subjectiveSubmissionId: attempt.subjectiveSubmissionId,
        timeLimitMs: attempt.timeLimitMs,
        currentQuestionIndex: attempt.currentQuestionIndex,
        currentSection: attempt.currentSection,
        boardPatternSnapshot: attempt.boardPatternSnapshot,
        questions: currentMcqQuestions.map((q, idx) => ({ index: idx, id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 1, chapterNumber: q.chapterNumber })),
        subjectiveQuestions: subjectiveQuestions.map((q, idx) => ({
          id: q._id,
          questionNumber: idx + 1,
          type: q.type,
          questionText: q.questionText,
          hindiQuestionText: q.hindiQuestionText,
          difficulty: q.difficulty,
          subtopic: q.subtopic,
          marks: q.marks,
          chapterNumber: q.chapterNumber,
        })),
        answers: (attempt.answers || [])
          .filter((answer) => answer.questionId && answer.selectedOption)
          .map((answer) => ({
            questionId: answer.questionId.toString(),
            selectedOption: answer.selectedOption,
            isSkipped: answer.isSkipped,
            firstAnsweredAt: answer.firstAnsweredAt,
            countsTowardLimit: answer.countsTowardLimit,
          }))
      });
    }

    // 🚨 2. NAYA TEST LOGIC WITH CACHING, USER EXCLUSION & CONCURRENCY LOCKING 🚨
    const requiredMcqCount = isMcqPractice ? MCQ_PRACTICE_QUESTION_COUNT : (activePattern.mcqCount || 10);
    const query = {
      classLevel: String(classLevel),
      stream,
      subjectCode: subjectCode.toLowerCase(),
      medium,
      isHardMode: isHardMode ? true : { $ne: true },
      isActive: true,
      status: 'verified',
    };
    if (chapterNumber) query.chapterNumber = Number(chapterNumber);
    if (isMcqPractice) query.type = 'mcq';

    // --- USER EXCLUSION: Get question IDs the user has already attempted ---
    const pastAttempts = await TestAttempt.find({
      userId: req.user._id,
      boardCode: boardCode.toLowerCase(),
      classLevel: String(classLevel),
      stream,
      subjectCode: subjectCode.toLowerCase(),
      chapterNumber: chapterNumber ? Number(chapterNumber) : null,
      medium,
      isHardMode: !!isHardMode,
      status: { $in: ['completed', 'abandoned'] },
    }).select('questionIds').lean();

    const attemptedQuestionIds = new Set();
    for (const attempt of pastAttempts) {
      for (const qid of attempt.questionIds) {
        attemptedQuestionIds.add(qid.toString());
      }
    }

    // --- CACHE LOOKUP: Find available questions excluding user's past attempts ---
    const fetchAvailableQuestions = async (targetBoardCode = boardCode.toLowerCase()) => {
      let questionQuery = Question.find({
        boardCode: targetBoardCode,
        ...query,
        _id: { $nin: Array.from(attemptedQuestionIds) },
      }).sort({ createdAt: 1, _id: 1 });
      if (isMcqPractice) questionQuery = questionQuery.limit(requiredMcqCount);
      return questionQuery.lean();
    };

    let questions = await fetchAvailableQuestions();
    if (!linkedGenerationJob && questions.length === 0 && boardCode.toLowerCase() !== 'ncert_default') {
      const fallbackQuestions = await fetchAvailableQuestions('ncert_default');
      if (fallbackQuestions.length > 0) {
        questions = fallbackQuestions;
      }
    }

    // --- CACHE HIT: If we have enough questions, return them immediately ---
    const mcqQuestionsAvailable = questions.filter((q) => q.type === 'mcq');
    
    if (mcqQuestionsAvailable.length >= requiredMcqCount) {
      // We have enough cached questions - use them
      const linkedJob = linkedGenerationJob
        ? await GenerationJob.findById(linkedGenerationJob._id).lean()
        : null;
      if (linkedJob) linkedGenerationJob = linkedJob;
      const configuredTargets = {
        mcq: Math.max(0, Number(linkedJob?.targetCount ?? activePattern.mcqCount) || 0),
        short: Math.max(0, Number(linkedJob?.targetShortCount ?? (activePattern.hasShortAnswer ? activePattern.shortCount : 0)) || 0),
        long: Math.max(0, Number(linkedJob?.targetLongCount ?? (activePattern.hasLongAnswer ? activePattern.longCount : 0)) || 0),
      };
      const questionTargets = {
        mcq: requiredMcqCount,
        short: configuredTargets.short || questions.filter((question) => question.type === 'short').length,
        long: configuredTargets.long || questions.filter((question) => question.type === 'long').length,
      };
      const mcqQuestions = questions.filter((question) => question.type === 'mcq')
        .slice(0, questionTargets.mcq);
      const shortQuestions = questions.filter((question) => question.type === 'short')
        .slice(0, questionTargets.short);
      const longQuestions = questions.filter((question) => question.type === 'long')
        .slice(0, questionTargets.long);
      if (isMcqPractice && mcqQuestions.length < Math.min(3, MCQ_PRACTICE_QUESTION_COUNT)) {
        return res.status(409).json({ error: 'At least three MCQs must be ready before starting chapter practice.' });
      }
      const subjectiveQuestions = [...shortQuestions, ...longQuestions];
      questions = [...mcqQuestions, ...subjectiveQuestions];
    } else {
      // --- CACHE MISS: Need to generate questions ---
      if (!chapterNumber) return res.status(404).json({ error: 'No questions available.' });

      const generationMode = isMcqPractice ? 'mcq_practice' : 'board_exam';
      const attemptedMcqCount = await Question.countDocuments({
        boardCode: boardCode.toLowerCase(),
        ...query,
        type: 'mcq',
        _id: { $in: Array.from(attemptedQuestionIds) },
      });

      // The unique jobKey and worker lease ensure concurrent misses share one generation job.
      const generationJob = await queueOrGetChapterJob({
        boardCode,
        classLevel,
        stream,
        subjectCode,
        chapterNumber: Number(chapterNumber),
        medium,
        isHardMode,
        generationMode,
        targetCount: requiredMcqCount + attemptedMcqCount,
        targetShortCount: activePattern.hasShortAnswer ? activePattern.shortCount : 0,
        targetLongCount: activePattern.hasLongAnswer ? activePattern.longCount : 0,
        marksPerMcq: activePattern.marksPerMcq || 1,
        shortMarks: activePattern.shortMarks || 2,
        longMarks: activePattern.longMarks || 5,
      });
      linkedGenerationJob = generationJob;

      // If we still don't have enough questions, wait for generation to complete
      if (questions.filter(q => q.type === 'mcq').length < requiredMcqCount) {
        // Poll for job completion (max 30 seconds, check every 2 seconds)
        const maxWaitMs = 30000;
        const pollIntervalMs = 2000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          
          const currentJob = await GenerationJob.findById(generationJob._id).lean();
          if (currentJob && currentJob.status === 'completed') {
            // Re-fetch questions after generation completes
            const refreshedQuestions = await fetchAvailableQuestions();
            if (refreshedQuestions.filter(q => q.type === 'mcq').length >= requiredMcqCount) {
              questions = refreshedQuestions;
              break;
            }
            return res.status(503).json({ error: 'Not enough questions generated yet. Please try again in a moment.' });
          } else if (currentJob && currentJob.status === 'failed') {
            return res.status(503).json({ error: 'Question generation failed. Please try again later.' });
          }
        }
        
        // Final check after polling
        const finalMcqQuestions = questions.filter(q => q.type === 'mcq');
        if (finalMcqQuestions.length < requiredMcqCount) {
          return res.status(503).json({ error: 'Not enough questions generated yet. Please try again in a moment.' });
        }
      }

      // Now select questions from the (now sufficient) pool
      const linkedJob = linkedGenerationJob
        ? await GenerationJob.findById(linkedGenerationJob._id).lean()
        : null;
      if (linkedJob) linkedGenerationJob = linkedJob;
      const configuredTargets = {
        mcq: Math.max(0, Number(linkedJob?.targetCount ?? activePattern.mcqCount) || 0),
        short: Math.max(0, Number(linkedJob?.targetShortCount ?? (activePattern.hasShortAnswer ? activePattern.shortCount : 0)) || 0),
        long: Math.max(0, Number(linkedJob?.targetLongCount ?? (activePattern.hasLongAnswer ? activePattern.longCount : 0)) || 0),
      };
      const questionTargets = {
        mcq: requiredMcqCount,
        short: configuredTargets.short || questions.filter((question) => question.type === 'short').length,
        long: configuredTargets.long || questions.filter((question) => question.type === 'long').length,
      };
      const mcqQuestions = questions.filter((question) => question.type === 'mcq')
        .slice(0, questionTargets.mcq);
      const shortQuestions = questions.filter((question) => question.type === 'short')
        .slice(0, questionTargets.short);
      const longQuestions = questions.filter((question) => question.type === 'long')
        .slice(0, questionTargets.long);
      if (isMcqPractice && mcqQuestions.length < Math.min(3, MCQ_PRACTICE_QUESTION_COUNT)) {
        return res.status(409).json({ error: 'At least three MCQs must be ready before starting chapter practice.' });
      }
      const subjectiveQuestions = [...shortQuestions, ...longQuestions];
      questions = [...mcqQuestions, ...subjectiveQuestions];
    }

    let subjectName = subjectCode;
    let chapterTitle = chapterNumber ? `Chapter ${chapterNumber}` : 'Full Paper';
    try {
      const found = getSubjectsForClass(config, classLevel, stream).find(s => s.code === subjectCode);
      if (found) subjectName = found.name;
      if (chapterNumber) {
        const chapter = await getChapterForMedium({ boardCode, classLevel, subjectCode, chapterNumber, stream, medium });
        if (chapter) chapterTitle = chapterTitleForMedium(chapter, medium) || chapterTitle;
      }
    } catch (e) { /* ignore */ }

    // Calculate deadline for exam mode
    const durationMinutes = activePattern.durationMinutes || 0;
    const startedAt = new Date();
    const deadlineAt = durationMinutes > 0 ? new Date(startedAt.getTime() + durationMinutes * 60 * 1000) : null;
    const timeLimitMs = durationMinutes > 0 ? durationMinutes * 60 * 1000 : 0;

    // Board pattern snapshot
    const boardPatternSnapshot = {
      mcqCount: activePattern.mcqCount,
      attemptLimit: activePattern.attemptLimit,
      marksPerMcq: activePattern.marksPerMcq,
      durationMinutes: activePattern.durationMinutes,
      negativeMarking: activePattern.negativeMarking,
      optionsCount: activePattern.optionsCount,
      hasShortAnswer: activePattern.hasShortAnswer,
      shortCount: activePattern.shortCount,
      shortMarks: activePattern.shortMarks,
      shortAttemptLimit: activePattern.shortAttemptLimit,
      hasLongAnswer: activePattern.hasLongAnswer,
      longCount: activePattern.longCount,
      longMarks: activePattern.longMarks,
      longAttemptLimit: activePattern.longAttemptLimit,
      totalMarks: activePattern.totalMarks,
    };

    attempt = await TestAttempt.create({
      userId: req.user._id, testType, boardCode: boardCode.toLowerCase(), classLevel: String(classLevel),
      stream,
      subjectCode: subjectCode.toLowerCase(), subjectName, chapterNumber: chapterNumber ? Number(chapterNumber) : null,
      chapterTitle, medium, questionIds: questions.map((q) => q._id), totalQuestions: mcqQuestions.length, 
      status: 'in_progress', startedAt, isHardMode: !!isHardMode,
      deadlineAt, timeLimitMs, boardPatternSnapshot,
      paperId: paperId || null,
      generationJobId: linkedGenerationJob?._id || null,
      subjectiveUploadDeadlineAt: !isMcqPractice && linkedGenerationJob?.status === 'completed'
        ? new Date(Math.max(
          deadlineAt?.getTime() || 0,
          linkedGenerationJob.completedAt?.getTime() || Date.now(),
        ) + ANSWER_SHEET_UPLOAD_GRACE_MS)
        : null,
      subjectiveRequired: questionTargets.short > 0 || questionTargets.long > 0,
      subjectiveScore: {
        totalMarks:
          Math.min(questionTargets.short, Number(activePattern.shortAttemptLimit) || questionTargets.short) * (Number(activePattern.shortMarks) || 0)
          + Math.min(questionTargets.long, Number(activePattern.longAttemptLimit) || questionTargets.long) * (Number(activePattern.longMarks) || 0),
        obtainedMarks: 0,
        percentage: 0,
      },
    });

    res.json({
      success: true, attemptId: attempt._id, testType, subjectName, chapterTitle,
      totalQuestions: mcqQuestions.length, medium, generationJobId: attempt.generationJobId,
      deadlineAt, timeLimitMs,
      subjectiveUploadDeadlineAt: attempt.subjectiveUploadDeadlineAt,
      subjectiveRequired: attempt.subjectiveRequired,
      currentQuestionIndex: 0,
      currentSection: 'mcq',
      boardPatternSnapshot,
      questions: mcqQuestions.map((q, idx) => ({ index: idx, id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 1, chapterNumber: q.chapterNumber })),
      subjectiveQuestions: subjectiveQuestions.map((q, idx) => ({
        id: q._id,
        questionNumber: idx + 1,
        type: q.type,
        questionText: q.questionText,
        hindiQuestionText: q.hindiQuestionText,
        difficulty: q.difficulty,
        subtopic: q.subtopic,
        marks: q.marks,
        chapterNumber: q.chapterNumber,
      })),
      answers: []
    });
  } catch (err) {
    console.error('startTest error:', err);
    res.status(500).json({ error: err.message || 'Failed to start test' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tests/:attemptId/answer
   -------------------------------------------------------------------------- */
export async function submitAnswer(req, res) {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOption, timeTakenMs } = req.body;

    if (!questionId || !selectedOption) return res.status(400).json({ error: 'questionId and selectedOption are required' });

    const attempt = await TestAttempt.findOne({ _id: attemptId, userId: req.user._id, status: 'in_progress' });
    if (!attempt) return res.status(404).json({ error: 'Test attempt not found' });
    if (!attempt.questionIds.some((qid) => qid.toString() === questionId)) return res.status(400).json({ error: 'Invalid question' });

    // Check server-authoritative deadline
    const effectiveDeadline = effectiveDeadlineAt(attempt);
    if (effectiveDeadline && new Date() > effectiveDeadline) {
      return res.status(400).json({ error: 'Exam time has expired' });
    }

    const question = await Question.findById(questionId).select('+correctOption').lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.type !== 'mcq') return res.status(400).json({ error: 'Written answers must be submitted on the answer sheet' });
    const availableOptions = new Set((question.options || []).map((option) => String(option.key).toUpperCase()));
    if (!availableOptions.has(String(selectedOption).toUpperCase())) {
      return res.status(400).json({ error: 'selectedOption must match one of the question options' });
    }

    const isCorrect = String(selectedOption).toUpperCase() === String(question.correctOption).toUpperCase();
    const existingIdx = attempt.answers.findIndex((a) => a.questionId.toString() === questionId);

    const now = new Date();
    const answerEntry = {
      questionId: question._id, 
      selectedOption: String(selectedOption).toUpperCase(), 
      correctOption: String(question.correctOption).toUpperCase(),
      isCorrect, 
      isSkipped: false, 
      timeTakenMs: timeTakenMs || 0, 
      marks: question.marks || 1,
      marksAwarded: isCorrect ? (question.marks || 1) : 0, 
      difficulty: question.difficulty || 'Medium',
      chapterNumber: question.chapterNumber, 
      subtopic: question.subtopic || '',
      firstAnsweredAt: existingIdx >= 0 ? attempt.answers[existingIdx].firstAnsweredAt : now,
      countsTowardLimit: true, // Will be adjusted at finish based on attempt limit
    };

    if (existingIdx >= 0) attempt.answers[existingIdx] = answerEntry;
    else attempt.answers.push(answerEntry);

    // Update resume state
    const mcqIds = await Question.find({
      _id: { $in: attempt.questionIds },
      type: 'mcq',
    }).select('_id').lean();
    const mcqOrder = new Map(attempt.questionIds.map((id, index) => [id.toString(), index]));
    mcqIds.sort((a, b) => mcqOrder.get(a._id.toString()) - mcqOrder.get(b._id.toString()));
    const qIndex = mcqIds.findIndex((item) => item._id.toString() === questionId);
    if (qIndex >= 0) attempt.currentQuestionIndex = qIndex;
    attempt.currentSection = 'mcq';

    await attempt.save();

    res.json({
      success: true,
      answeredCount: attempt.answers.filter((answer) => !answer.isSkipped).length,
      totalQuestions: attempt.totalQuestions,
    });
  } catch (err) {
    console.error('submitAnswer error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit answer' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tests/:attemptId/finish
   -------------------------------------------------------------------------- */
export async function finishTest(req, res) {
  try {
    const { attemptId } = req.params;
    const { subjectiveSubmissionId } = req.body;

    const attempt = await TestAttempt.findOne({ _id: attemptId, userId: req.user._id });
    if (!attempt) return res.status(404).json({ error: 'Test attempt not found' });
    if (attempt.status === 'completed') return res.json({ success: true, message: 'Test already completed', attemptId: attempt._id });

    if (attempt.generationJobId) {
      const job = await GenerationJob.findById(attempt.generationJobId).lean();
      if (!job) return res.status(409).json({ error: 'The exam question-generation job is missing; contact support before submitting this attempt' });
      if (job.status === 'failed') {
        return res.status(409).json({ error: 'Question generation failed. Retry generation before submitting this exam.' });
      }
      if (job.status !== 'completed') {
        return res.status(409).json({ error: 'The full exam paper is still being generated. You can continue answering and submit once generation finishes.' });
      }

      const currentQuestions = await Question.find({ _id: { $in: attempt.questionIds } })
        .select('_id type')
        .lean();
      const currentCounts = {
        mcq: currentQuestions.filter((question) => question.type === 'mcq').length,
        short: currentQuestions.filter((question) => question.type === 'short').length,
        long: currentQuestions.filter((question) => question.type === 'long').length,
      };
      const targets = {
        mcq: Number(job.targetCount) || 0,
        short: Number(job.targetShortCount) || 0,
        long: Number(job.targetLongCount) || 0,
      };
      const existingIds = new Set(attempt.questionIds.map((id) => id.toString()));
      const candidates = await Question.find({
        boardCode: job.boardCode,
        classLevel: job.classLevel,
        stream: job.stream || null,
        subjectCode: job.subjectCode,
        chapterNumber: job.chapterNumber,
        medium: job.medium,
        isHardMode: job.isHardMode ? true : { $ne: true },
        type: { $in: ['mcq', 'short', 'long'] },
        isActive: true,
        status: 'verified',
      }).select('_id type').sort({ createdAt: 1, _id: 1 }).lean();
      for (const type of ['mcq', 'short', 'long']) {
        const remaining = Math.max(0, targets[type] - currentCounts[type]);
        const missingIds = candidates
          .filter((question) => question.type === type && !existingIds.has(question._id.toString()))
          .slice(0, remaining)
          .map((question) => question._id);
        for (const questionId of missingIds) existingIds.add(questionId.toString());
        attempt.questionIds.push(...missingIds);
      }
    }

    const answeredIds = new Set(attempt.answers.map((a) => a.questionId.toString()));
    const allQuestions = await Question.find({ _id: { $in: attempt.questionIds } }).select('+correctOption').lean();
    const objectiveQuestions = allQuestions.filter((question) => question.type === 'mcq');
    attempt.totalQuestions = objectiveQuestions.length;

    for (const q of objectiveQuestions) {
      if (!answeredIds.has(q._id.toString())) {
        attempt.answers.push({
          questionId: q._id, selectedOption: null, correctOption: String(q.correctOption || '').toUpperCase(),
          isCorrect: false, isSkipped: true, timeTakenMs: 0, marks: q.marks || 1, marksAwarded: 0,
          difficulty: q.difficulty || 'Medium', chapterNumber: q.chapterNumber, subtopic: q.subtopic || '',
          firstAnsweredAt: null,
          countsTowardLimit: false,
        });
      }
    }

    // Apply board attempt limits from snapshot
    const snapshot = attempt.boardPatternSnapshot || {};
    const mcqAttemptLimit = Number(snapshot.attemptLimit) > 0
      ? Number(snapshot.attemptLimit)
      : objectiveQuestions.length;
    const mcqCount = Number(snapshot.mcqCount) > 0 ? Number(snapshot.mcqCount) : objectiveQuestions.length;
    const scoredQuestionCount = Math.min(mcqAttemptLimit, mcqCount, objectiveQuestions.length);
    const mcqAnswers = attempt.answers.filter((answer) =>
      objectiveQuestions.some((question) => question._id.toString() === answer.questionId.toString()),
    );
    const answeredMcq = mcqAnswers
      .filter((answer) => answer.firstAnsweredAt)
      .sort((a, b) => new Date(a.firstAnsweredAt) - new Date(b.firstAnsweredAt));
    const eligibleAnswerIds = new Set(
      answeredMcq.slice(0, scoredQuestionCount).map((answer) => answer.questionId.toString()),
    );
    for (const answer of mcqAnswers) {
      answer.countsTowardLimit = eligibleAnswerIds.has(answer.questionId.toString());
    }

    let correct = 0, incorrect = 0, skipped = Math.max(0, scoredQuestionCount - eligibleAnswerIds.size);
    let totalMarks = scoredQuestionCount * (Number(snapshot.marksPerMcq) || 1);
    let obtainedMarks = 0;
    let easyCorrect = 0, easyTotal = 0, mediumCorrect = 0, mediumTotal = 0, hardCorrect = 0, hardTotal = 0;

    for (const ans of mcqAnswers) {
      if (!ans.countsTowardLimit) {
        ans.marksAwarded = 0;
        continue;
      }

      if (ans.isCorrect) {
        correct++;
        ans.marksAwarded = Number(snapshot.marksPerMcq) || ans.marks || 1;
        obtainedMarks += ans.marksAwarded;
      } else {
        incorrect++;
        ans.marksAwarded = -(Number(snapshot.negativeMarking) || 0);
        obtainedMarks += ans.marksAwarded;
      }

      const diff = (ans.difficulty || 'Medium').toLowerCase();
      if (diff === 'easy') { easyTotal++; if (ans.isCorrect) easyCorrect++; }
      else if (diff === 'hard') { hardTotal++; if (ans.isCorrect) hardCorrect++; }
      else { mediumTotal++; if (ans.isCorrect) mediumCorrect++; }
    }

    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;

    attempt.score = { totalMarks, obtainedMarks, percentage, correct, incorrect, skipped, easyCorrect, easyTotal, mediumCorrect, mediumTotal, hardCorrect, hardTotal };
    attempt.status = 'completed';
    attempt.finishedAt = new Date();
    attempt.resultReleaseAt = new Date(
      attempt.finishedAt.getTime() + (attempt.testType === 'chapter_mcq_practice' ? 0 : RESULT_RELEASE_DELAY_MS),
    );
    if (attempt.subjectiveRequired && !attempt.subjectiveUploadDeadlineAt) {
      attempt.subjectiveUploadDeadlineAt = new Date(
        (attempt.deadlineAt?.getTime() || attempt.finishedAt.getTime()) + ANSWER_SHEET_UPLOAD_GRACE_MS,
      );
    }
    attempt.durationMs = Math.max(
      0,
      attempt.finishedAt.getTime() - attempt.startedAt.getTime() - (Number(attempt.generationWaitDurationMs) || 0),
    );

    if (subjectiveSubmissionId) {
      const sub = await SubjectiveSubmission.findOne({
        _id: subjectiveSubmissionId,
        userId: req.user._id,
        attemptId: attempt._id,
      });
      if (sub) {
        attempt.subjectiveSubmissionId = sub._id;
        if (sub.status === 'completed') {
          attempt.subjectiveScore = { totalMarks: sub.totalMarks, obtainedMarks: sub.obtainedMarks, percentage: sub.percentage };
        }
      }
    }

    const combinedTotalMarks = attempt.score.totalMarks + (attempt.subjectiveScore?.totalMarks || 0);
    const combinedObtainedMarks = attempt.score.obtainedMarks + (attempt.subjectiveScore?.obtainedMarks || 0);
    const combinedPercentage = combinedTotalMarks > 0 ? Math.round((combinedObtainedMarks / combinedTotalMarks) * 100) : 0;

    attempt.combinedScore = { totalMarks: combinedTotalMarks, obtainedMarks: combinedObtainedMarks, percentage: combinedPercentage };

    let performanceLevel = 'Average';
    if (combinedPercentage >= 90) performanceLevel = 'Excellent';
    else if (combinedPercentage >= 75) performanceLevel = 'Good';
    else if (combinedPercentage >= 50) performanceLevel = 'Average';
    else if (combinedPercentage >= 30) performanceLevel = 'Needs Improvement';
    else performanceLevel = 'Critical';

    const subtopicStats = {};
    for (const ans of attempt.answers) {
      if (!ans.countsTowardLimit) continue;
      const st = ans.subtopic || 'General';
      if (!subtopicStats[st]) subtopicStats[st] = { correct: 0, total: 0 };
      subtopicStats[st].total++;
      if (ans.isCorrect && ans.countsTowardLimit) subtopicStats[st].correct++;
    }
    const weakAreas = Object.entries(subtopicStats).filter(([, s]) => s.total > 0 && (s.correct / s.total) < 0.5).map(([name, s]) => `${name} (${s.correct}/${s.total})`);
    const strengths = Object.entries(subtopicStats).filter(([, s]) => s.total > 0 && (s.correct / s.total) >= 0.7).map(([name, s]) => `${name} (${s.correct}/${s.total})`);

    const recommendations = [];
    if (combinedPercentage < 50) recommendations.push('Focus on revising the weak chapters before attempting more tests.');
    if (skipped > 0) recommendations.push(`You skipped ${skipped} questions — try answering all questions next time.`);
    if (hardTotal > 0 && hardCorrect === 0) recommendations.push('Practice more Hard difficulty questions to improve advanced concepts.');
    if (combinedPercentage >= 75) recommendations.push('Great work! Try Hard Mode for an extra challenge.');

    const isMcqPractice = attempt.testType === 'chapter_mcq_practice';
    attempt.aiAnalysis = isMcqPractice ? {} : {
      overallRemark: `You scored ${combinedObtainedMarks}/${combinedTotalMarks} (${combinedPercentage}%) overall.`,
      strengths: strengths.length > 0 ? strengths : ['Keep practicing to build strengths!'],
      weakAreas: weakAreas.length > 0 ? weakAreas : ['No specific weak areas detected.'],
      recommendations: recommendations.length > 0 ? recommendations : ['Continue your current study pace.'],
      performanceLevel,
    };
    attempt.aiAnalysisStatus = isMcqPractice ? 'completed' : 'queued';
    attempt.aiAnalysisEta = isMcqPractice ? '' : '2 min';

    await attempt.save();
    if (!isMcqPractice) {
      analysisQueue.enqueueAttempt(attempt._id).catch((err) => console.warn('Auto analysis enqueue warning:', err?.message));
    }

    res.json({
      success: true,
      attemptId: attempt._id,
      resultAvailable: isMcqPractice,
      resultReleaseAt: attempt.resultReleaseAt,
      message: isMcqPractice
        ? 'Your MCQ practice result is ready.'
        : 'Your result will be available after the evaluation period.',
      durationMs: attempt.durationMs,
    });
  } catch (err) {
    console.error('finishTest error:', err);
    res.status(500).json({ error: err.message || 'Failed to finish test' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/:attemptId/result
   -------------------------------------------------------------------------- */
export async function getResult(req, res) {
  try {
    const { attemptId } = req.params;
    const attempt = await TestAttempt.findOne({ _id: attemptId, userId: req.user._id, status: 'completed' }).lean();
    if (!attempt) return res.status(404).json({ error: 'Completed test result not found' });

    const submission = attempt.subjectiveSubmissionId
      ? await SubjectiveSubmission.findById(attempt.subjectiveSubmissionId).lean()
      : null;
    const releaseState = getResultReleaseState(attempt, submission);
    if (!releaseState.available) {
      return res.json({
        success: true,
        resultAvailable: false,
        resultReleaseAt: releaseState.resultReleaseAt,
        subjectiveStatus: releaseState.subjectiveStatus,
        message: ({
          awaiting_upload: 'Upload your answer sheet before the upload window closes to complete evaluation.',
          review_required: 'Your answer sheet needs review before marks can be released.',
          failed: 'Answer-sheet evaluation failed. Retry evaluation before the result can be released.',
          evaluation_missing: 'The answer-sheet evaluation record could not be found. Support review is required.',
        })[releaseState.subjectiveStatus] || 'Your result is being evaluated and is not available yet.',
      });
    }

    const questions = await Question.find({ _id: { $in: attempt.questionIds } }).select('+correctOption +explanation').lean();
    const qMap = {};
    for (const q of questions) qMap[q._id.toString()] = q;

    const detailedAnswers = attempt.answers.map((ans) => {
      const q = qMap[ans.questionId.toString()] || {};
      return {
        questionId: ans.questionId, questionText: q.questionText || '', hindiQuestionText: q.hindiQuestionText || '',
        options: q.options || [], selectedOption: ans.selectedOption, correctOption: ans.correctOption,
        isCorrect: ans.isCorrect, isSkipped: ans.isSkipped, explanation: q.explanation || '',
        difficulty: ans.difficulty, subtopic: ans.subtopic, mistakeReason: ans.mistakeReason || '',
        marks: ans.marks, marksAwarded: ans.marksAwarded, timeTakenMs: ans.timeTakenMs,
      };
    });

    const subjectiveDetails = submission;

    res.json({
      success: true,
      resultAvailable: true,
      result: {
        attemptId: attempt._id, testType: attempt.testType, subjectCode: attempt.subjectCode, subjectName: attempt.subjectName,
        chapterNumber: attempt.chapterNumber, chapterTitle: attempt.chapterTitle, medium: attempt.medium, totalQuestions: attempt.totalQuestions, 
        score: attempt.score, subjectiveScore: attempt.subjectiveScore, combinedScore: attempt.combinedScore,     
        aiAnalysis: attempt.aiAnalysis, aiAnalysisStatus: attempt.aiAnalysisStatus || 'completed',
        aiAnalysisEta: attempt.aiAnalysisEta || '', durationMs: attempt.durationMs,
        startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, resultReleaseAt: releaseState.resultReleaseAt, isHardMode: attempt.isHardMode,
        answers: detailedAnswers, subjectiveDetails
      },
    });
  } catch (err) {
    console.error('getResult error:', err);
    res.status(500).json({ error: 'Failed to fetch test result' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/results/recent
   -------------------------------------------------------------------------- */
export async function getRecentResults(req, res) {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const attempts = await TestAttempt.find({ userId: req.user._id, status: 'completed' })
      .sort({ finishedAt: -1 }).limit(limit)
      .select('testType subjectCode subjectName chapterNumber chapterTitle medium score subjectiveScore combinedScore aiAnalysis durationMs startedAt finishedAt resultReleaseAt deadlineAt subjectiveRequired subjectiveSubmissionId isHardMode totalQuestions').lean();
    const submissionIds = attempts
      .map((attempt) => attempt.subjectiveSubmissionId)
      .filter(Boolean);
    const submissions = await SubjectiveSubmission.find({ _id: { $in: submissionIds } })
      .select('_id status')
      .lean();
    const submissionsById = new Map(submissions.map((submission) => [submission._id.toString(), submission]));

    res.json({
      success: true, count: attempts.length,
      results: attempts.map((a) => {
        const submission = a.subjectiveSubmissionId
          ? submissionsById.get(a.subjectiveSubmissionId.toString())
          : null;
        const releaseState = getResultReleaseState(a, submission);
        const result = {
          attemptId: a._id, testType: a.testType, subjectCode: a.subjectCode, subjectName: a.subjectName,
          chapterNumber: a.chapterNumber, chapterTitle: a.chapterTitle, medium: a.medium, totalQuestions: a.totalQuestions,
          resultAvailable: releaseState.available, resultReleaseAt: releaseState.resultReleaseAt,
          subjectiveStatus: releaseState.subjectiveStatus,
          durationMs: a.durationMs, startedAt: a.startedAt, finishedAt: a.finishedAt, isHardMode: a.isHardMode,
        };
        if (releaseState.available) {
          result.score = a.score;
          result.subjectiveScore = a.subjectiveScore;
          result.combinedScore = a.combinedScore;
          result.performanceLevel = a.aiAnalysis?.performanceLevel || '';
        }
        return result;
      }),
    });
  } catch (err) {
    console.error('getRecentResults error:', err);
    res.status(500).json({ error: 'Failed to fetch recent results' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/:attemptId/pdf-token
   -------------------------------------------------------------------------- */
export async function getPdfDownloadToken(req, res) {
  try {
    const { attemptId } = req.params;
    const attempt = await TestAttempt.findOne({ _id: attemptId, userId: req.user._id, status: 'completed' }).lean();
    if (!attempt) return res.status(404).json({ error: 'Completed test attempt not found' });
    const submission = attempt.subjectiveSubmissionId
      ? await SubjectiveSubmission.findById(attempt.subjectiveSubmissionId).lean()
      : null;
    if (!getResultReleaseState(attempt, submission).available) {
      return res.status(409).json({ error: 'Test result is not available yet' });
    }

    const token = generatePdfToken(attempt._id, req.user._id, 7200);
    const expiresAt = new Date(Date.now() + 7200 * 1000).toISOString();

    res.json({
      success: true, token, expiresAt,
      downloadUrl: `/api/tests/${attempt._id}/pdf?token=${encodeURIComponent(token)}`,
      wrongOnlyUrl: `/api/tests/${attempt._id}/pdf?token=${encodeURIComponent(token)}&wrongOnly=1`,
    });
  } catch (err) {
    console.error('getPdfDownloadToken error:', err);
    res.status(500).json({ error: 'Failed to generate PDF token' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/:attemptId/pdf
   -------------------------------------------------------------------------- */
export async function downloadTestReportPdf(req, res) {
  try {
    const { attemptId } = req.params;
    const { token, wrongOnly } = req.query;

    let userId = req.user?._id;
    if (token) {
      const payload = verifyPdfToken(token, attemptId);
      if (!payload) return res.status(403).json({ error: 'Invalid or expired download link' });
      userId = payload.userId;
    } else if (!userId) {
      return res.status(401).json({ error: 'Unauthorized download request' });
    }

    const attempt = await TestAttempt.findOne({ _id: attemptId, userId, status: 'completed' }).lean();
    if (!attempt) return res.status(404).json({ error: 'Completed test attempt not found' });
    const submission = attempt.subjectiveSubmissionId
      ? await SubjectiveSubmission.findById(attempt.subjectiveSubmissionId).lean()
      : null;
    if (!getResultReleaseState(attempt, submission).available) {
      return res.status(409).json({ error: 'Test result is not available yet' });
    }

    const user = await User.findById(userId).lean();
    const questions = await Question.find({ _id: { $in: attempt.questionIds } }).select('+correctOption +explanation').lean();

    const isWrongOnly = wrongOnly === '1' || wrongOnly === 'true';
    const filename = `Nexus_${(attempt.subjectName || attempt.subjectCode || 'Test').replace(/\s+/g, '_')}_Report${isWrongOnly ? '_Mistakes' : ''}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await buildTestReportPdf(attempt, questions, user || {}, isWrongOnly, res);
  } catch (err) {
    console.error('downloadTestReportPdf error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF report' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tests/:attemptId/queue-analysis
   -------------------------------------------------------------------------- */
export async function queueTestAnalysis(req, res) {
  try {
    const { attemptId } = req.params;
    const attempt = await TestAttempt.findOne({ _id: attemptId, userId: req.user._id, status: 'completed' });
    if (!attempt) return res.status(404).json({ error: 'Completed test attempt not found' });
    if (attempt.testType === 'chapter_mcq_practice') {
      return res.status(409).json({ error: 'MCQ practice results are scored from saved answer keys and do not use AI analysis.' });
    }

    const queueInfo = await analysisQueue.enqueueAttempt(attempt._id);
    res.json({ success: true, message: 'Analysis queued successfully', queueInfo });
  } catch (err) {
    console.error('queueTestAnalysis error:', err);
    res.status(500).json({ error: 'Failed to queue test analysis' });
  }
}

/* =========================================================================
   PHASE 5: OFFICIAL BOARD PAPER INGESTION & MATCHING PIPELINE
   ========================================================================= */

export async function ingestPaper(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin access required' });

    const { boardCode, classLevel, stream, subjectCode, subjectName, medium, year, examPhase, setCode, questions, sourceUrl, sourceCreditText, officialKeyUrl } = req.body;

    if (!boardCode || !classLevel || !subjectCode || !subjectName || !year || !examPhase || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const normalizedMedium = normalizeMedium(medium || 'Hindi');
    if (!normalizedMedium) return res.status(400).json({ error: 'Unsupported medium' });

    const paper = await ingestOfficialPaper({
      boardCode, classLevel, stream, subjectCode, subjectName, medium: normalizedMedium,
      year: Number(year), examPhase, setCode: setCode?.toUpperCase() || null, questions,
      sourceUrl, sourceCreditText, officialKeyUrl, ingestedBy: req.user._id,
    });

    const matchResults = await matchPaperQuestions(paper._id);
    await applyMvviVviTags(paper._id);

    res.json({
      success: true, message: 'Official paper ingested successfully',
      paper: { id: paper._id, paperCode: paper.paperCode, boardCode: paper.boardCode, classLevel: paper.classLevel, subjectCode: paper.subjectCode, year: paper.year, examPhase: paper.examPhase, setCode: paper.setCode, totalQuestions: paper.totalQuestions, status: paper.status },
      matchResults,
    });
  } catch (err) {
    console.error('ingestPaper error:', err);
    res.status(500).json({ error: err.message || 'Failed to ingest paper' });
  }
}

export async function matchPaper(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
    const { paperId } = req.params;
    const results = await matchPaperQuestions(paperId);
    await applyMvviVviTags(paperId);
    res.json({ success: true, message: 'Paper matching completed', results });
  } catch (err) {
    console.error('matchPaper error:', err);
    res.status(500).json({ error: err.message || 'Failed to match paper' });
  }
}

export async function generateMvviTags(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
    const { paperId } = req.params;
    const result = await applyMvviVviTags(paperId);
    res.json({ success: true, message: 'MVVI/VVI tags calculated and applied', result });
  } catch (err) {
    console.error('generateMvviTags error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate MVVI/VVI tags' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tests/papers/available
   -------------------------------------------------------------------------- */
export async function getAvailablePapersForStudent(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const boardCode = req.query.boardCode || studentProf.board || 'bseb';
    const classLevel = req.query.classLevel || studentProf.classLevel || '10';
    const subjectCode = req.query.subjectCode;
    const stream = req.query.stream || studentProf.stream || null;
    const medium = normalizeMedium(req.query.medium || studentProf.medium || 'Hindi');

    if (!subjectCode) return res.status(400).json({ error: 'subjectCode query parameter is required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    const papers = await getAvailablePapers({
      boardCode, classLevel, subjectCode, stream, medium, examPhase: req.query.examPhase || null,
    });

    res.json({
      success: true, count: papers.length,
      papers: papers.map(p => ({
        paperId: p._id, paperCode: p.paperCode, year: p.year, examPhase: p.examPhase, setCode: p.setCode,
        totalQuestions: p.totalQuestions, totalMarks: p.totalMarks, sourceCreditText: p.sourceCreditText,
        mvviCount: p.mvviTags?.filter(t => t.tag === 'MVVI').length || 0,
        vviCount: p.mvviTags?.filter(t => t.tag === 'VVI').length || 0, matchStats: p.matchStats,
      })),
    });
  } catch (err) {
    console.error('getAvailablePapersForStudent error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch available papers' });
  }
}

export async function getPaperForTestTaking(req, res) {
  try {
    const { paperId } = req.params;
    const paper = await getPaperForTest(paperId);
    res.json({ success: true, paper });
  } catch (err) {
    console.error('getPaperForTestTaking error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch paper' });
  }
}

export async function startPaperTest(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const { paperId } = req.params;
    const { isHardMode = false } = req.body;

    const paper = await getPaperForTest(paperId);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const mcqQuestions = paper.questions.filter(q => q.questionType !== 'subjective');
    const subjectiveQuestions = paper.questions.filter(q => q.questionType === 'subjective');

    let attempt = await TestAttempt.findOne({
      userId: req.user._id,
      paperId: paper.paperId,
      isHardMode: !!isHardMode,
      status: 'in_progress',
    });

    if (attempt) {
      const questionDocs = await Question.find({ _id: { $in: attempt.questionIds } }).lean();
      const questionOrder = new Map(attempt.questionIds.map((id, index) => [id.toString(), index]));
      questionDocs.sort((a, b) => questionOrder.get(a._id.toString()) - questionOrder.get(b._id.toString()));
      const safeQuestions = questionDocs.map((q, idx) => ({
        index: idx, id: q._id, questionNumber: mcqQuestions[idx]?.questionNumber,
        questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options,
        difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks, chapterNumber: q.chapterNumber,
        chapterTitle: q.chapterTitle, isMVVI: q.isMVVI, isVVI: q.isVVI, mvviTag: mcqQuestions[idx]?.mvviTag,
      }));

      return res.json({
        success: true, attemptId: attempt._id, testType: 'full_paper', subjectName: paper.subjectName,
        chapterTitle: attempt.chapterTitle, totalQuestions: safeQuestions.length, medium: paper.medium,
        paperCode: paper.paperCode, year: paper.year, examPhase: paper.examPhase, setCode: paper.setCode,
        sourceCreditText: paper.sourceCreditText, questions: safeQuestions,
        subjectiveQuestions: subjectiveQuestions.map(sq => ({
          questionNumber: sq.questionNumber, questionText: sq.questionText, hindiQuestionText: sq.hindiQuestionText, marks: sq.marks
        })),
        answers: (attempt.answers || [])
          .filter((answer) => answer.questionId && answer.selectedOption)
          .map((answer) => ({
            questionId: answer.questionId.toString(),
            selectedOption: answer.selectedOption,
            isSkipped: answer.isSkipped,
            firstAnsweredAt: answer.firstAnsweredAt,
            countsTowardLimit: answer.countsTowardLimit,
          })),
        deadlineAt: attempt.deadlineAt,
        generationWaitStartedAt: attempt.generationWaitStartedAt,
        generationWaitDurationMs: attempt.generationWaitDurationMs,
        subjectiveUploadDeadlineAt: attempt.subjectiveUploadDeadlineAt,
        subjectiveRequired: attempt.subjectiveRequired,
        subjectiveSubmissionId: attempt.subjectiveSubmissionId,
        timeLimitMs: attempt.timeLimitMs,
        startedAt: attempt.startedAt,
        currentQuestionIndex: attempt.currentQuestionIndex,
        currentSection: attempt.currentSection,
        boardPatternSnapshot: attempt.boardPatternSnapshot,
      });
    }

    const config = await getResolvedBoardConfig(paper.boardCode);
    const pattern = config.paperPattern || {};
    const durationMinutes = pattern.durationMinutes || 0;
    const startedAt = new Date();
    const deadlineAt = durationMinutes > 0 ? new Date(startedAt.getTime() + durationMinutes * 60 * 1000) : null;
    const timeLimitMs = durationMinutes > 0 ? durationMinutes * 60 * 1000 : 0;
    const boardPatternSnapshot = {
      mcqCount: pattern.mcqCount,
      attemptLimit: pattern.attemptLimit,
      marksPerMcq: pattern.marksPerMcq,
      durationMinutes: pattern.durationMinutes,
      negativeMarking: pattern.negativeMarking,
      optionsCount: pattern.optionsCount,
      hasShortAnswer: pattern.hasShortAnswer,
      shortCount: pattern.shortCount,
      shortMarks: pattern.shortMarks,
      shortAttemptLimit: pattern.shortAttemptLimit,
      hasLongAnswer: pattern.hasLongAnswer,
      longCount: pattern.longCount,
      longMarks: pattern.longMarks,
      longAttemptLimit: pattern.longAttemptLimit,
      totalMarks: pattern.totalMarks,
    };

    attempt = await TestAttempt.create({
      userId: req.user._id, testType: 'full_paper', boardCode: paper.boardCode, classLevel: paper.classLevel,
      subjectCode: paper.subjectCode, subjectName: paper.subjectName, chapterNumber: null,
      chapterTitle: `${paper.paperCode} - ${paper.year} ${paper.examPhase}${paper.setCode ? ` Set ${paper.setCode}` : ''}`,
      medium: paper.medium, questionIds: [], totalQuestions: mcqQuestions.length, status: 'in_progress',
      startedAt, deadlineAt, timeLimitMs, boardPatternSnapshot,
      subjectiveUploadDeadlineAt: subjectiveQuestions.length
        ? new Date((deadlineAt?.getTime() || startedAt.getTime()) + ANSWER_SHEET_UPLOAD_GRACE_MS)
        : null,
      isHardMode: !!isHardMode, paperId: paper.paperId, paperYear: paper.year,
      paperExamPhase: paper.examPhase, paperSetCode: paper.setCode,
      subjectiveRequired: subjectiveQuestions.length > 0,
      subjectiveScore: {
        totalMarks: subjectiveQuestions.reduce((total, question) => total + (Number(question.marks) || 0), 0),
        obtainedMarks: 0,
        percentage: 0,
      },
    });

    const questionDocs = await Question.insertMany(
      mcqQuestions.map((q) => ({
        questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options,
        correctOption: q.correctOption, explanation: '', difficulty: q.difficulty, subtopic: q.subtopic,
        boardCode: paper.boardCode, classLevel: paper.classLevel, subjectCode: paper.subjectCode,
        chapterNumber: q.chapterNumber || 0, chapterTitle: q.chapterTitle || `Paper Q${q.questionNumber}`,
        medium: paper.medium, type: 'mcq', marks: q.marks, isAiGenerated: false,
        sourceLabel: `Official ${paper.paperCode} Question ${q.questionNumber}`, status: 'verified',
        year: paper.year, examPhase: paper.examPhase, setCode: paper.setCode,
        isVVI: q.mvviTag?.tag === 'VVI', isMVVI: q.mvviTag?.tag === 'MVVI', officialPaperSource: paper.paperCode,
      }))
    );

    attempt.questionIds = questionDocs.map(q => q._id);
    await attempt.save();

    const safeQuestions = questionDocs.map((q, idx) => ({
      index: idx, id: q._id, questionNumber: mcqQuestions[idx].questionNumber,
      questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options,
      difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks, chapterNumber: q.chapterNumber,
      chapterTitle: q.chapterTitle, isMVVI: q.isMVVI, isVVI: q.isVVI, mvviTag: mcqQuestions[idx].mvviTag,
    }));

    res.json({
      success: true, attemptId: attempt._id, testType: 'full_paper', subjectName: paper.subjectName,
      chapterTitle: attempt.chapterTitle, totalQuestions: mcqQuestions.length, medium: paper.medium,
      paperCode: paper.paperCode, year: paper.year, examPhase: paper.examPhase, setCode: paper.setCode,
      sourceCreditText: paper.sourceCreditText, questions: safeQuestions,
      subjectiveQuestions: subjectiveQuestions.map(sq => ({
        questionNumber: sq.questionNumber,
        type: 'subjective',
        questionText: sq.questionText,
        hindiQuestionText: sq.hindiQuestionText,
        marks: sq.marks,
      })),
      deadlineAt,
      subjectiveUploadDeadlineAt: attempt.subjectiveUploadDeadlineAt,
      timeLimitMs,
      startedAt,
      currentQuestionIndex: 0,
      currentSection: 'mcq',
      boardPatternSnapshot,
      subjectiveRequired: attempt.subjectiveRequired,
      subjectiveSubmissionId: attempt.subjectiveSubmissionId,
    });
  } catch (err) {
    console.error('startPaperTest error:', err);
    res.status(500).json({ error: err.message || 'Failed to start paper test' });
  }
}

export async function getPaperAnswers(req, res) {
  try {
    const { paperId } = req.params;
    const paper = await getPaperWithAnswers(paperId);
    res.json({ success: true, paper });
  } catch (err) {
    console.error('getPaperAnswers error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch paper answers' });
  }
}

export async function getPendingReviewPapers(req, res) {
  try {
    if (!['super_admin', 'admin', 'subject_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
    const papers = await getPapersPendingReview();
    res.json({ success: true, count: papers.length, papers });
  } catch (err) {
    console.error('getPendingReviewPapers error:', err);
    res.status(500).json({ error: 'Failed to fetch pending review papers' });
  }
}

export async function reviewPaperMatch(req, res) {
  try {
    if (!['super_admin', 'admin', 'subject_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin access required' });

    const { paperId } = req.params;
    const { questionNumber, action } = req.body;

    if (!questionNumber || !action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'questionNumber and action (approve/reject) are required' });
    }

    const result = await adminReviewMatch(paperId, Number(questionNumber), action, req.user._id);
    res.json({ success: true, message: `Match ${action}d successfully`, result });
  } catch (err) {
    console.error('reviewPaperMatch error:', err);
    res.status(500).json({ error: err.message || 'Failed to review match' });
  }
}

export async function getMvviAnalysis(req, res) {
  try {
    const studentProf = req.user?.studentProfile || {};
    const boardCode = req.query.boardCode || studentProf.board || 'bseb';
    const classLevel = req.query.classLevel || studentProf.classLevel || '10';
    const subjectCode = req.query.subjectCode;

    if (!subjectCode) return res.status(400).json({ error: 'subjectCode query parameter is required' });

    const tags = await calculateMvviVviTags(boardCode, classLevel, subjectCode);
    const mvviTags = tags.filter(t => t.tag === 'MVVI');
    const vviTags = tags.filter(t => t.tag === 'VVI');

    res.json({
      success: true, boardCode, classLevel, subjectCode,
      summary: { mvviCount: mvviTags.length, vviCount: vviTags.length, totalTagged: tags.length },
      mvviTags: mvviTags.map(t => ({ questionText: t.questionText, hindiQuestionText: t.hindiQuestionText, reason: t.reason, frequency: t.frequency, years: t.years, correctOption: t.correctOption })),
      vviTags: vviTags.map(t => ({ questionText: t.questionText, hindiQuestionText: t.hindiQuestionText, reason: t.reason, frequency: t.frequency, years: t.years, correctOption: t.correctOption })),
    });
  } catch (err) {
    console.error('getMvviAnalysis error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch MVVI/VVI analysis' });
  }
}

export async function getStudentNotifications(req, res) {
  try {
    const limit = Math.min(30, Number(req.query.limit) || 15);
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(limit).lean();
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
    res.json({ success: true, unreadCount, notifications });
  } catch (err) {
    console.error('getStudentNotifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    await Notification.findOneAndUpdate({ _id: id, userId: req.user._id }, { $set: { isRead: true } });
    res.json({ success: true });
  } catch (err) {
    console.error('markNotificationRead error:', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
}