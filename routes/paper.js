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

// NOTE: 'boards' and 'flags' routes have been moved to adminRoute 
// to avoid conflicts with the new Super Admin Panel.

// Paper ingestion & management
router.post('/papers/ingest', protect, adminOnly, ingestPaper);
router.post('/papers/:paperId/match', protect, adminOnly, matchPaper);
router.post('/papers/:paperId/mvvi', protect, adminOnly, applyMvvi);

// IMPORTANT: Static routes MUST come before dynamic routes (/:paperId)
router.get('/papers/pending-review', protect, adminOnly, getPendingReview);
router.post('/papers/:paperId/review', protect, adminOnly, reviewMatch);
router.get('/papers', protect, adminOnly, listPapers);

// AI Usage Dashboard
router.get('/usage', protect, adminOnly, getUsageDashboard);

/* ============================================================
   STUDENT ROUTES - Paper Access
   ============================================================ */

// IMPORTANT: Static routes MUST come before dynamic routes (/:paperId)
router.get('/papers/available', protect, getStudentAvailablePapers);

router.get('/papers/:paperId/test', protect, getStudentPaperForTest);
router.get('/papers/:paperId/answers', protect, getStudentPaperWithAnswers);
router.get('/mvvi', protect, getStudentMvvi);

// Dynamic routes (Keep these at the bottom so they don't catch other paths)
router.get('/papers/:paperId', protect, adminOnly, getPaperDetails);
router.delete('/papers/:paperId', protect, adminOnly, deletePaper);

// ==========================================
// FINAL EXPORT (Ye line miss ho gayi thi)
// ==========================================
export default router;