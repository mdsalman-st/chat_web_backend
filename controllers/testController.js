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
    const subjectCode = req.body.subjectCode;
    const chapterNumber = Number(req.body.chapterNumber);
    const medium = normalizeMedium(req.body.medium || studentProf.medium || 'Hindi');
    const isHardMode = !!req.body.isHardMode;

    if (!subjectCode || !chapterNumber) return res.status(400).json({ error: 'subjectCode and chapterNumber are required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    const config = await getResolvedBoardConfig(boardCode);
    const boardPattern = config.paperPattern || { mcq: 50, twoMarks: 20, fiveMarks: 10 }; 
    
    const mcqCount = boardPattern.mcq || 0;
    const twoMarks = boardPattern.twoMarks || 0;
    const fiveMarks = boardPattern.fiveMarks || 0;
    const targetCount = Number(req.body.targetCount) || (mcqCount + twoMarks + fiveMarks) || 20;

    const existingCount = await Question.countDocuments({
      boardCode: boardCode.toLowerCase(), classLevel: String(classLevel),
      subjectCode: subjectCode.toLowerCase(), chapterNumber, medium, isActive: true, status: 'verified',
    });

    // 🚨 MAGIC: Sirf 4 questions ready hone par hi test start karo!
    const minStartCount = 4; 

    const job = await queueOrGetChapterJob({
      boardCode, classLevel, subjectCode, chapterNumber, medium, isHardMode, targetCount, pattern: boardPattern
    });

    if (existingCount >= minStartCount) {
      return res.json({ 
        success: true, 
        ready: true, 
        isGenerating: job.status === 'running', 
        count: existingCount, 
        message: `Test is ready! Generating more in background.` 
      });
    }

    res.json({
      success: true, ready: false, isGenerating: true,
      jobId: job._id, jobKey: job.jobKey, status: job.status, progressPercent: job.progressPercent,
      progressMessage: `Generating first questions... (${existingCount}/${minStartCount})`, availableCount: existingCount,
    });
  } catch (err) {
    console.error('prepareChapterQuestions error:', err);
    res.status(500).json({ error: err.message || 'Failed to prepare questions' });
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

    res.json({
      success: true, job: {
        id: job._id, status: job.status, progressPercent: job.progressPercent,
        progressMessage: job.progressMessage, verifiedCount: job.verifiedCount,
        targetCount: job.targetCount, error: job.error, completedAt: job.completedAt,
      },
    });
  } catch (err) {
    console.error('getGenerationJobStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch job status' });
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

    const query = { classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), chapterNumber, medium, isActive: true, status: 'verified' };

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
    const { subjectCode, chapterNumber, testType = 'chapter_practice', isHardMode = false, questionLimit } = req.body;

    const boardCode = req.body.boardCode || studentProf.board || 'bseb';
    const classLevel = req.body.classLevel || studentProf.classLevel || '10';
    const medium = normalizeMedium(req.body.medium || studentProf.medium || 'Hindi');

    if (!subjectCode) return res.status(400).json({ error: 'subjectCode is required' });
    if (!medium) return res.status(400).json({ error: 'Unsupported medium' });

    // 🚨 1. RESUME LOGIC + AUTO-UPDATE 🚨
    let attempt = await TestAttempt.findOne({
      userId: req.user._id, boardCode: boardCode.toLowerCase(), classLevel: String(classLevel),
      subjectCode: subjectCode.toLowerCase(), chapterNumber: chapterNumber ? Number(chapterNumber) : null,
      medium, status: 'in_progress'
    });

    if (attempt) {
      // Background mein naye questions aaye honge, unhe fetch karo
      const query = { classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), medium, isActive: true, status: 'verified' };
      if (chapterNumber) query.chapterNumber = Number(chapterNumber);
      
      let freshQuestions = await Question.find({ boardCode: boardCode.toLowerCase(), ...query }).lean();
      
      // Agar naye questions mile hain, toh attempt ko update karo
      if (freshQuestions.length > attempt.questionIds.length) {
        attempt.questionIds = freshQuestions.map(q => q._id);
        attempt.totalQuestions = freshQuestions.filter(q => q.type !== 'subjective').length;
        await attempt.save();
      } else {
        // Warna purane wale hi utha lo
        freshQuestions = await Question.find({ _id: { $in: attempt.questionIds } }).lean();
      }

      const mcqQuestions = freshQuestions.filter(q => q.type !== 'subjective');
      const subjectiveQuestions = freshQuestions.filter(q => q.type === 'subjective');

      return res.json({
        success: true, attemptId: attempt._id, testType: attempt.testType, 
        subjectName: attempt.subjectName, chapterTitle: attempt.chapterTitle,
        totalQuestions: mcqQuestions.length, medium: attempt.medium, 
        questions: mcqQuestions.map((q, idx) => ({ index: idx, id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 1, chapterNumber: q.chapterNumber })),
        subjectiveQuestions: subjectiveQuestions.map((q) => ({ id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 2, chapterNumber: q.chapterNumber })),
        answers: attempt.answers || []
      });
    }

    // 🚨 2. NAYA TEST LOGIC 🚨
    const query = { classLevel: String(classLevel), subjectCode: subjectCode.toLowerCase(), medium, isActive: true, status: 'verified' };
    if (chapterNumber) query.chapterNumber = Number(chapterNumber);

    let questions = await Question.find({ boardCode: boardCode.toLowerCase(), ...query }).lean();
    if (questions.length === 0 && boardCode.toLowerCase() !== 'ncert_default') {
      questions = await Question.find({ boardCode: 'ncert_default', ...query }).lean();
    }
    if (questions.length === 0) return res.status(404).json({ error: 'No questions available.' });

    // Shuffle
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    let finalLimit = Number(questionLimit);
    if (!finalLimit) {
       try {
         const config = await getResolvedBoardConfig(boardCode);
         const pattern = config.paperPattern || {};
         finalLimit = (pattern.mcq || 0) + (pattern.twoMarks || 0) + (pattern.fiveMarks || 0);
       } catch (e) { /* ignore */ }
    }
    questions = questions.slice(0, Math.min(finalLimit || 20, questions.length));

    const mcqQuestions = questions.filter(q => q.type !== 'subjective');
    const subjectiveQuestions = questions.filter(q => q.type === 'subjective');

    let subjectName = subjectCode;
    let chapterTitle = chapterNumber ? `Chapter ${chapterNumber}` : 'Full Paper';
    try {
      const config = await getResolvedBoardConfig(boardCode);
      const found = getSubjectsForClass(config, classLevel, studentProf.stream).find(s => s.code === subjectCode);
      if (found) subjectName = found.name;
      if (chapterNumber) {
        const chapter = await getChapterForMedium({ boardCode, classLevel, subjectCode, chapterNumber, stream: studentProf.stream, medium });
        if (chapter) chapterTitle = chapterTitleForMedium(chapter, medium) || chapterTitle;
      }
    } catch (e) { /* ignore */ }

    attempt = await TestAttempt.create({
      userId: req.user._id, testType, boardCode: boardCode.toLowerCase(), classLevel: String(classLevel),
      subjectCode: subjectCode.toLowerCase(), subjectName, chapterNumber: chapterNumber ? Number(chapterNumber) : null,
      chapterTitle, medium, questionIds: questions.map((q) => q._id), totalQuestions: mcqQuestions.length, 
      status: 'in_progress', startedAt: new Date(), isHardMode: !!isHardMode,
    });

    res.json({
      success: true, attemptId: attempt._id, testType, subjectName, chapterTitle,
      totalQuestions: mcqQuestions.length, medium, 
      questions: mcqQuestions.map((q, idx) => ({ index: idx, id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, options: q.options, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 1, chapterNumber: q.chapterNumber })),
      subjectiveQuestions: subjectiveQuestions.map((q) => ({ id: q._id, questionText: q.questionText, hindiQuestionText: q.hindiQuestionText, difficulty: q.difficulty, subtopic: q.subtopic, marks: q.marks || 2, chapterNumber: q.chapterNumber })),
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

    const question = await Question.findById(questionId).select('+correctOption').lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const isCorrect = String(selectedOption).toUpperCase() === String(question.correctOption).toUpperCase();
    const existingIdx = attempt.answers.findIndex((a) => a.questionId.toString() === questionId);

    const answerEntry = {
      questionId: question._id, selectedOption: String(selectedOption).toUpperCase(), correctOption: String(question.correctOption).toUpperCase(),
      isCorrect, isSkipped: false, timeTakenMs: timeTakenMs || 0, marks: question.marks || 1,
      marksAwarded: isCorrect ? (question.marks || 1) : 0, difficulty: question.difficulty || 'Medium',
      chapterNumber: question.chapterNumber, subtopic: question.subtopic || '',
    };

    if (existingIdx >= 0) attempt.answers[existingIdx] = answerEntry;
    else attempt.answers.push(answerEntry);

    await attempt.save();

    res.json({
      success: true, isCorrect, correctOption: String(question.correctOption).toUpperCase(),
      explanation: question.explanation || '', answeredCount: attempt.answers.length, totalQuestions: attempt.totalQuestions,
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

    const answeredIds = new Set(attempt.answers.map((a) => a.questionId.toString()));
    const allQuestions = await Question.find({ _id: { $in: attempt.questionIds } }).select('+correctOption').lean();

    for (const q of allQuestions) {
      if (!answeredIds.has(q._id.toString())) {
        attempt.answers.push({
          questionId: q._id, selectedOption: null, correctOption: String(q.correctOption).toUpperCase(),
          isCorrect: false, isSkipped: true, timeTakenMs: 0, marks: q.marks || 1, marksAwarded: 0,
          difficulty: q.difficulty || 'Medium', chapterNumber: q.chapterNumber, subtopic: q.subtopic || '',
        });
      }
    }

    let correct = 0, incorrect = 0, skipped = 0, totalMarks = 0, obtainedMarks = 0;
    let easyCorrect = 0, easyTotal = 0, mediumCorrect = 0, mediumTotal = 0, hardCorrect = 0, hardTotal = 0;

    for (const ans of attempt.answers) {
      totalMarks += ans.marks;
      if (ans.isSkipped) skipped++;
      else if (ans.isCorrect) { correct++; obtainedMarks += ans.marksAwarded; }
      else incorrect++;

      const diff = (ans.difficulty || 'Medium').toLowerCase();
      if (diff === 'easy') { easyTotal++; if (ans.isCorrect) easyCorrect++; }
      else if (diff === 'hard') { hardTotal++; if (ans.isCorrect) hardCorrect++; }
      else { mediumTotal++; if (ans.isCorrect) mediumCorrect++; }
    }

    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;

    attempt.score = { totalMarks, obtainedMarks, percentage, correct, incorrect, skipped, easyCorrect, easyTotal, mediumCorrect, mediumTotal, hardCorrect, hardTotal };
    attempt.status = 'completed';
    attempt.finishedAt = new Date();
    attempt.durationMs = attempt.finishedAt.getTime() - attempt.startedAt.getTime();

    if (subjectiveSubmissionId) {
      const sub = await SubjectiveSubmission.findById(subjectiveSubmissionId);
      if (sub) {
        attempt.subjectiveSubmissionId = sub._id;
        attempt.subjectiveScore = { totalMarks: sub.totalMarks, obtainedMarks: sub.obtainedMarks, percentage: sub.percentage };
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
      const st = ans.subtopic || 'General';
      if (!subtopicStats[st]) subtopicStats[st] = { correct: 0, total: 0 };
      subtopicStats[st].total++;
      if (ans.isCorrect) subtopicStats[st].correct++;
    }
    const weakAreas = Object.entries(subtopicStats).filter(([, s]) => s.total > 0 && (s.correct / s.total) < 0.5).map(([name, s]) => `${name} (${s.correct}/${s.total})`);
    const strengths = Object.entries(subtopicStats).filter(([, s]) => s.total > 0 && (s.correct / s.total) >= 0.7).map(([name, s]) => `${name} (${s.correct}/${s.total})`);

    const recommendations = [];
    if (combinedPercentage < 50) recommendations.push('Focus on revising the weak chapters before attempting more tests.');
    if (skipped > 0) recommendations.push(`You skipped ${skipped} questions — try answering all questions next time.`);
    if (hardTotal > 0 && hardCorrect === 0) recommendations.push('Practice more Hard difficulty questions to improve advanced concepts.');
    if (combinedPercentage >= 75) recommendations.push('Great work! Try Hard Mode for an extra challenge.');

    attempt.aiAnalysis = {
      overallRemark: `You scored ${combinedObtainedMarks}/${combinedTotalMarks} (${combinedPercentage}%) overall.`,
      strengths: strengths.length > 0 ? strengths : ['Keep practicing to build strengths!'],
      weakAreas: weakAreas.length > 0 ? weakAreas : ['No specific weak areas detected.'],
      recommendations: recommendations.length > 0 ? recommendations : ['Continue your current study pace.'],
      performanceLevel,
    };
    attempt.aiAnalysisStatus = 'queued';
    attempt.aiAnalysisEta = '2 min';

    await attempt.save();
    analysisQueue.enqueueAttempt(attempt._id).catch((err) => console.warn('Auto analysis enqueue warning:', err?.message));

    res.json({
      success: true, attemptId: attempt._id, score: attempt.score, subjectiveScore: attempt.subjectiveScore, combinedScore: attempt.combinedScore, aiAnalysis: attempt.aiAnalysis,
      aiAnalysisStatus: attempt.aiAnalysisStatus, aiAnalysisEta: attempt.aiAnalysisEta, durationMs: attempt.durationMs,
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

    let subjectiveDetails = null;
    if (attempt.subjectiveSubmissionId) subjectiveDetails = await SubjectiveSubmission.findById(attempt.subjectiveSubmissionId).lean();

    res.json({
      success: true,
      result: {
        attemptId: attempt._id, testType: attempt.testType, subjectCode: attempt.subjectCode, subjectName: attempt.subjectName,
        chapterNumber: attempt.chapterNumber, chapterTitle: attempt.chapterTitle, medium: attempt.medium, totalQuestions: attempt.totalQuestions, 
        score: attempt.score, subjectiveScore: attempt.subjectiveScore, combinedScore: attempt.combinedScore,     
        aiAnalysis: attempt.aiAnalysis, aiAnalysisStatus: attempt.aiAnalysisStatus || 'completed',
        aiAnalysisEta: attempt.aiAnalysisEta || '', durationMs: attempt.durationMs,
        startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, isHardMode: attempt.isHardMode,
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
      .select('testType subjectCode subjectName chapterNumber chapterTitle medium score subjectiveScore combinedScore aiAnalysis durationMs startedAt finishedAt isHardMode totalQuestions').lean();

    res.json({
      success: true, count: attempts.length,
      results: attempts.map((a) => ({
        attemptId: a._id, testType: a.testType, subjectCode: a.subjectCode, subjectName: a.subjectName,
        chapterNumber: a.chapterNumber, chapterTitle: a.chapterTitle, medium: a.medium, totalQuestions: a.totalQuestions, 
        score: a.score, subjectiveScore: a.subjectiveScore, combinedScore: a.combinedScore,
        performanceLevel: a.aiAnalysis?.performanceLevel || '', durationMs: a.durationMs, 
        startedAt: a.startedAt, finishedAt: a.finishedAt, isHardMode: a.isHardMode,
      })),
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

    const attempt = await TestAttempt.create({
      userId: req.user._id, testType: 'full_paper', boardCode: paper.boardCode, classLevel: paper.classLevel,
      subjectCode: paper.subjectCode, subjectName: paper.subjectName, chapterNumber: null,
      chapterTitle: `${paper.paperCode} - ${paper.year} ${paper.examPhase}${paper.setCode ? ` Set ${paper.setCode}` : ''}`,
      medium: paper.medium, questionIds: [], totalQuestions: mcqQuestions.length, status: 'in_progress',
      startedAt: new Date(), isHardMode: !!isHardMode, paperId: paper.paperId, paperYear: paper.year,
      paperExamPhase: paper.examPhase, paperSetCode: paper.setCode,
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
        questionNumber: sq.questionNumber, questionText: sq.questionText, hindiQuestionText: sq.hindiQuestionText, marks: sq.marks
      }))
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