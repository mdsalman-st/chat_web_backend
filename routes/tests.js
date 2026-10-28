import express from 'express';
import {
  getBoards,
  getBoardConfig,
  getSubjects,
  getChapters,
  getStudentProfile,
  updateStudentProfile,
  prepareChapterQuestions,
  getGenerationJobStatus,
  getChapterPracticeQuestions,
  flagQuestion,
  startTest,
  submitAnswer,
  finishTest,
  getResult,
  getRecentResults,
  getPdfDownloadToken,
  downloadTestReportPdf,
  queueTestAnalysis,
  getStudentNotifications,
  markNotificationRead,
  // Phase 5: Official Paper Ingestion & Matching
  ingestPaper,
  matchPaper,
  generateMvviTags,
  getAvailablePapersForStudent,
  getPaperForTestTaking,
  startPaperTest,
  getPaperAnswers,
  getPendingReviewPapers,
  reviewPaperMatch,
  getMvviAnalysis,
} from '../controllers/testController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/* Public board discovery endpoints */
router.get('/boards', getBoards);
router.get('/boards/:boardCode', getBoardConfig);
router.get('/boards/:boardCode/subjects', getSubjects);
router.get('/boards/:boardCode/chapters', getChapters);

/* Protected student academic profile endpoints */
router.get('/profile', protect, getStudentProfile);
router.put('/profile', protect, updateStudentProfile);

/* Phase 2: Chapter Question Generation, Lazy Loading & Flagging */
router.post('/chapters/prepare', protect, prepareChapterQuestions);
router.get('/jobs/:jobId', getGenerationJobStatus);
router.get('/chapters/:chapterNumber/questions', protect, getChapterPracticeQuestions);
router.post('/questions/:questionId/flag', protect, flagQuestion);

/* Phase 3: Live Test Engine */
router.post('/start', protect, startTest);
router.post('/:attemptId/answer', protect, submitAnswer);
router.post('/:attemptId/finish', protect, finishTest);
router.get('/:attemptId/result', protect, getResult);
router.get('/results/recent', protect, getRecentResults);

/* Phase 4: Diagnostic PDF Report, Asynchronous Analysis Queue & Notifications */
router.get('/:attemptId/pdf-token', protect, getPdfDownloadToken);
router.get('/:attemptId/pdf', downloadTestReportPdf);
router.post('/:attemptId/queue-analysis', protect, queueTestAnalysis);
router.get('/notifications', protect, getStudentNotifications);
router.patch('/notifications/:id/read', protect, markNotificationRead);

/* =========================================================================
   PHASE 5: OFFICIAL BOARD PAPER INGESTION & MATCHING PIPELINE
   ========================================================================= */

/* Admin: Paper Ingestion & Matching */
router.post('/papers/ingest', protect, ingestPaper);
router.post('/papers/:paperId/match', protect, matchPaper);
router.post('/papers/:paperId/mvvi-tags', protect, generateMvviTags);

/* Student: Available Papers & Test Taking */
router.get('/papers/available', protect, getAvailablePapersForStudent);
router.get('/papers/:paperId', protect, getPaperForTestTaking);
router.post('/papers/:paperId/start', protect, startPaperTest);
router.get('/papers/:paperId/answers', protect, getPaperAnswers);

/* Admin: Review Queue */
router.get('/papers/pending-review', protect, getPendingReviewPapers);
router.post('/papers/:paperId/review-match', protect, reviewPaperMatch);

/* MVVI/VVI Analysis */
router.get('/papers/mvvi-analysis', protect, getMvviAnalysis);

export default router;
