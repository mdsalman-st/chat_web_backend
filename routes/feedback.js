import express from 'express';
import Feedback from '../models/Feedback.js';

const router = express.Router();

// POST /api/feedback - Submit new feedback (public or authenticated)
router.post('/', async (req, res) => {
  try {
    const { name, email, category, rating, message, pageUrl, userId } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Feedback message is required' });
    }

    const feedback = new Feedback({
      userId: userId || null,
      name: name ? name.trim() : 'Anonymous Student',
      email: email ? email.trim() : '',
      category: category || 'general',
      rating: rating ? Number(rating) : 5,
      message: message.trim(),
      pageUrl: pageUrl || '',
      userAgent: req.headers['user-agent'] || ''
    });

    await feedback.save();

    return res.status(201).json({
      success: true,
      message: 'Thank you for your valuable feedback! We are constantly improving Nexus.',
      feedbackId: feedback._id
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ success: false, error: 'Failed to record feedback' });
  }
});

// GET /api/feedback - List recent feedback (admin view)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const feedbackList = await Feedback.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, count: feedbackList.length, feedback: feedbackList });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve feedback' });
  }
});

export default router;
