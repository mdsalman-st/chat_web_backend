import express from 'express';
import {
  ingestPaper,
  matchPaper,
  applyMvvi,
  getPendingReview,
  reviewMatch,
  listPapers,
  getPaperDetails,
  deletePaper,
  listBoards,
  upsertBoard,
  getUsageDashboard,
  getFlaggedQuestions,
  resolveFlag,
  getStudentAvailablePapers,
  getStudentPaperForTest,
  getStudentPaperWithAnswers,
  getStudentMvvi,
} from '../controllers/paperController.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = express.Router();

/* ============================================================
   ADMIN ROUTES - Paper Management
   ============================================================ */

// Board configuration
router.get('/boards', protect, adminOnly, listBoards);
router.post('/boards', protect, adminOnly, upsertBoard);

// Paper ingestion & management
router.post('/papers/ingest', protect, adminOnly, ingestPaper);
router.post('/papers/:paperId/match', protect, adminOnly, matchPaper);
router.post('/papers/:paperId/mvvi', protect, adminOnly, applyMvvi);
router.get('/papers/pending-review', protect, adminOnly, getPendingReview);
router.post('/papers/:paperId/review', protect, adminOnly, reviewMatch);
router.get('/papers', protect, adminOnly, listPapers);
router.get('/papers/:paperId', protect, adminOnly, getPaperDetails);
router.delete('/papers/:paperId', protect, adminOnly, deletePaper);

// AI Usage Dashboard
router.get('/usage', protect, adminOnly, getUsageDashboard);

// Flagged Questions Review
router.get('/flags', protect, adminOnly, getFlaggedQuestions);
router.post('/flags/:flagId/resolve', protect, adminOnly, resolveFlag);

/* ============================================================
   STUDENT ROUTES - Paper Access
   ============================================================ */

router.get('/papers/available', protect, getStudentAvailablePapers);
router.get('/papers/:paperId/test', protect, getStudentPaperForTest);
router.get('/papers/:paperId/answers', protect, getStudentPaperWithAnswers);
router.get('/mvvi', protect, getStudentMvvi);

export default router;