import express from 'express';
import {
  uploadAnswerSheet,
  getSubmissionStatusController,
  getSubmissionResultController,
  getRecentSubmissionsController,
  retryEvaluationController,
} from '../controllers/subjectiveController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/* Protected Subjective Answer Sheet Routes */
router.post('/upload', protect, uploadAnswerSheet);
router.get('/recent', protect, getRecentSubmissionsController);
router.get('/:submissionId/status', protect, getSubmissionStatusController);
router.get('/:submissionId/result', protect, getSubmissionResultController);
router.post('/:submissionId/retry', protect, retryEvaluationController);

export default router;
