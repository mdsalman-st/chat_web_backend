import express from 'express';
import Question from '../models/Question.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = express.Router();

// 1. GET /api/admin/questions
router.get('/questions', protect, adminOnly, async (req, res) => {
  try {
    let query = {};
    // Agar Subject Admin hai, toh sirf uske subject ke questions
    if (req.user.role === 'subject_admin' && req.user.assignedSubject) {
      query.subjectCode = req.user.assignedSubject;
    }
    const questions = await Question.find(query).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. DELETE /api/admin/questions/:id
router.delete('/questions/:id', protect, adminOnly, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    
    if (req.user.role === 'subject_admin' && question.subjectCode !== req.user.assignedSubject) {
      return res.status(403).json({ error: 'Aap is subject ke admin nahi hain.' });
    }
    await question.deleteOne();
    res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /api/admin/ai-health (Placeholder)
router.get('/ai-health', protect, adminOnly, async (req, res) => {
  res.json({
    gemini: { status: 'Active', usage: 120, limit: 5000 },
    groq: { status: 'Active', rateLimit: 'OK' },
    failedJobs: 0
  });
});

// 4. GET /api/admin/audit-logs (Placeholder)
router.get('/audit-logs', protect, adminOnly, async (req, res) => {
  res.json({ logs: [] }); // Abhi ke liye khali bhej rahe hain
});

export default router;