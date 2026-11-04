import express from 'express';
import Question from '../models/Question.js';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';

const router = express.Router();

// GET: Saare questions fetch karo
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const query = {};
    
    // Agar Subject Admin hai, toh usko sirf uske subject ke questions dikhao
    if (req.user.role === 'subject_admin' && req.user.assignedSubject) {
      query.subjectCode = req.user.assignedSubject;
    }
    
    // Filters (Optional)
    if (req.query.subjectCode) query.subjectCode = req.query.subjectCode;
    if (req.query.classLevel) query.classLevel = req.query.classLevel;

    const questions = await Question.find(query).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, questions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE: Question delete karo
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    // Subject Admin dusre subject ka question delete na kar sake
    if (req.user.role === 'subject_admin' && question.subjectCode !== req.user.assignedSubject) {
      return res.status(403).json({ message: 'Aap is subject ke admin nahi hain.' });
    }

    await question.deleteOne();
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;