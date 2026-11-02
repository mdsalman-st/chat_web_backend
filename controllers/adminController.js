import User from '../models/user.js';
import OfficialPaper from '../models/OfficialPaper.js';
import GenerationJob from '../models/GenerationJob.js';
import BoardConfig from '../models/BoardConfig.js';
import QuestionFlag from '../models/QuestionFlag.js';
import Question from '../models/Question.js';

// ==========================================
// 1. DASHBOARD STATS
// ==========================================
export async function getAdminStats(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalSubjectAdmins = await User.countDocuments({ role: 'subject_admin' });
    const totalPapers = await OfficialPaper.countDocuments();
    const activeAiJobs = await GenerationJob.countDocuments({ status: { $in: ['running', 'queued'] } });

    res.json({
      success: true,
      stats: { totalStudents, totalSubjectAdmins, totalPapers, activeAiJobs }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ==========================================
// 2. MANAGE USERS
// ==========================================
export async function getUsers(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch both Students and Subject Admins
    const users = await User.find({ role: { $in: ['student', 'subject_admin'] } })
      .select('name email role assignedSubject createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function promoteToAdmin(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;
    const { assignedSubject } = req.body; // Get subject from frontend prompt

    if (!assignedSubject) {
      return res.status(400).json({ error: 'Subject code is required to make a Subject Admin' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          role: 'subject_admin',
          assignedSubject: assignedSubject.toLowerCase() 
        } 
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, message: `${user.name} is now Subject Admin for ${assignedSubject.toUpperCase()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function revokeAdmin(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { role: 'student' },
        $unset: { assignedSubject: 1 } // Remove subject assignment
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, message: `Admin access revoked for ${user.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ==========================================
// 3. DYNAMIC BOARDS
// ==========================================
export async function addNewBoard(req, res) {
  try {
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { code, name, shortName } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Board code and name are required' });
    }

    const existing = await BoardConfig.findOne({ code: code.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Board with this code already exists' });
    }

    const newBoard = await BoardConfig.create({
      code: code.toLowerCase(),
      name,
      shortName: shortName || name,
      classes: [], // Empty initially
      isActive: true
    });

    res.status(201).json({ success: true, message: 'Board added successfully', board: newBoard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ==========================================
// 4. FLAGGED QUESTIONS
// ==========================================
export async function getFlaggedQuestions(req, res) {
  try {
    if (!['super_admin', 'admin', 'subject_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const flags = await QuestionFlag.find({ status: 'pending' })
      .populate('questionId', 'questionText subjectCode')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, flags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function resolveFlag(req, res) {
  try {
    if (!['super_admin', 'admin', 'subject_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { flagId } = req.params;
    const { action } = req.body; // 'approve' (disable Q) or 'reject' (dismiss)

    const flag = await QuestionFlag.findById(flagId);
    if (!flag) return res.status(404).json({ error: 'Flag not found' });

    if (action === 'approve') {
      // Disable the question
      await Question.findByIdAndUpdate(flag.questionId, { isActive: false, status: 'flagged' });
      flag.status = 'resolved';
    } else {
      flag.status = 'dismissed';
    }

    await flag.save();

    res.json({ success: true, message: `Flag ${action === 'approve' ? 'resolved & Question Disabled' : 'Dismissed'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}