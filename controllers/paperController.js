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
import OfficialPaper from '../models/OfficialPaper.js';
import BoardConfig from '../models/BoardConfig.js';
import Question from '../models/Question.js';
import { protect } from '../middleware/authMiddleware.js';

/**
 * POST /api/admin/papers/ingest
 * Ingest an official paper with answer key (Admin only)
 */
export async function ingestPaper(req, res) {
  try {
    const adminId = req.user._id;
    const paperData = {
      ...req.body,
      ingestedBy: adminId,
    };

    // Validate required fields
    const required = ['boardCode', 'classLevel', 'subjectCode', 'subjectName', 'year', 'examPhase', 'questions'];
    for (const field of required) {
      if (!paperData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    if (!Array.isArray(paperData.questions) || paperData.questions.length === 0) {
      return res.status(400).json({ error: 'At least one question is required' });
    }

    const paper = await ingestOfficialPaper(paperData);
    res.status(201).json({ success: true, paper });
  } catch (error) {
    console.error('Ingest paper error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/admin/papers/:paperId/match
 * Match paper questions with question bank (Admin only)
 */
export async function matchPaper(req, res) {
  try {
    const { paperId } = req.params;
    const results = await matchPaperQuestions(paperId);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Match paper error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/admin/papers/:paperId/mvvi
 * Apply MVVI/VVI tags to paper (Admin only)
 */
export async function applyMvvi(req, res) {
  try {
    const { paperId } = req.params;
    const result = await applyMvviVviTags(paperId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Apply MVVI error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/admin/papers/pending-review
 * Get papers pending admin review (Admin only)
 */
export async function getPendingReview(req, res) {
  try {
    const papers = await getPapersPendingReview();
    res.json({ success: true, papers });
  } catch (error) {
    console.error('Get pending review error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/admin/papers/:paperId/review
 * Admin approve/reject low-confidence match (Admin only)
 */
export async function reviewMatch(req, res) {
  try {
    const { paperId } = req.params;
    const { questionNumber, action } = req.body;
    const adminId = req.user._id;

    if (!questionNumber || !action) {
      return res.status(400).json({ error: 'questionNumber and action are required' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    const result = await adminReviewMatch(paperId, questionNumber, action, adminId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Review match error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/admin/papers
 * List all official papers (Admin only)
 */
export async function listPapers(req, res) {
  try {
    const { boardCode, classLevel, subjectCode, year, examPhase, status, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (boardCode) filter.boardCode = boardCode.toLowerCase();
    if (classLevel) filter.classLevel = String(classLevel);
    if (subjectCode) filter.subjectCode = subjectCode.toLowerCase();
    if (year) filter.year = Number(year);
    if (examPhase) filter.examPhase = examPhase;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [papers, total] = await Promise.all([
      OfficialPaper.find(filter)
        .sort({ year: -1, examPhase: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('paperCode boardCode classLevel subjectCode subjectName year examPhase setCode totalQuestions totalMarks status matchStats mvviTags createdAt')
        .lean(),
      OfficialPaper.countDocuments(filter),
    ]);

    res.json({
      success: true,
      papers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('List papers error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/admin/papers/:paperId
 * Get paper details (Admin only)
 */
export async function getPaperDetails(req, res) {
  try {
    const { paperId } = req.params;
    const paper = await OfficialPaper.findById(paperId).lean();
    
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    res.json({ success: true, paper });
  } catch (error) {
    console.error('Get paper details error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * DELETE /api/admin/papers/:paperId
 * Delete paper (Admin only)
 */
export async function deletePaper(req, res) {
  try {
    const { paperId } = req.params;
    const paper = await OfficialPaper.findByIdAndDelete(paperId);
    
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    res.json({ success: true, message: 'Paper deleted' });
  } catch (error) {
    console.error('Delete paper error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/admin/boards
 * List all board configurations (Admin only)
 */
export async function listBoards(req, res) {
  try {
    const boards = await BoardConfig.find({ isActive: true })
      .sort({ shortName: 1 })
      .lean();
    
    res.json({ success: true, boards });
  } catch (error) {
    console.error('List boards error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/admin/boards
 * Create/update board configuration (Admin only)
 */
export async function upsertBoard(req, res) {
  try {
    const { code, shortName, fullName, hasSetCode, setCodes, examPhases, sourceCreditText, isActive } = req.body;

    if (!code || !shortName || !fullName) {
      return res.status(400).json({ error: 'code, shortName, and fullName are required' });
    }

    const board = await BoardConfig.findOneAndUpdate(
      { code: code.toLowerCase() },
      {
        code: code.toLowerCase(),
        shortName,
        fullName,
        hasSetCode: hasSetCode || false,
        setCodes: setCodes || [],
        examPhases: examPhases || [],
        sourceCreditText: sourceCreditText || '',
        isActive: isActive !== false,
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, board });
  } catch (error) {
    console.error('Upsert board error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/admin/usage
 * Get AI key usage dashboard (Admin only)
 */
export async function getUsageDashboard(req, res) {
  try {
    const AiKeyUsage = (await import('../models/AiKeyUsage.js')).default;
    
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const usage = await AiKeyUsage.find({
      date: { $gte: startDate.toISOString().slice(0, 10) },
    })
      .sort({ date: -1, keyIdentifier: 1 })
      .lean();

    // Aggregate by key
    const byKey = {};
    for (const u of usage) {
      if (!byKey[u.keyIdentifier]) {
        byKey[u.keyIdentifier] = { totalRequests: 0, totalRateLimits: 0, totalErrors: 0, days: [] };
      }
      byKey[u.keyIdentifier].totalRequests += u.requestCount;
      byKey[u.keyIdentifier].totalRateLimits += u.rateLimitCount || 0;
      byKey[u.keyIdentifier].totalErrors += u.errorCount || 0;
      byKey[u.keyIdentifier].days.push({
        date: u.date,
        requests: u.requestCount,
        rateLimits: u.rateLimitCount || 0,
        errors: u.errorCount || 0,
      });
    }

    res.json({ success: true, usage: byKey, raw: usage });
  } catch (error) {
    console.error('Usage dashboard error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/admin/flags
 * Get flagged questions for review (Admin only)
 */
export async function getFlaggedQuestions(req, res) {
  try {
    const QuestionFlag = (await import('../models/QuestionFlag.js')).default;
    
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const filter = { status };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [flags, total] = await Promise.all([
      QuestionFlag.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('questionId', 'questionText correctOption')
        .populate('flaggedBy', 'name email')
        .lean(),
      QuestionFlag.countDocuments(filter),
    ]);

    res.json({
      success: true,
      flags,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get flagged questions error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/admin/flags/:flagId/resolve
 * Resolve a flagged question (Admin only)
 */
export async function resolveFlag(req, res) {
  try {
    const QuestionFlag = (await import('../models/QuestionFlag.js')).default;
    const Question = (await import('../models/Question.js')).default;
    
    const { flagId } = req.params;
    const { action, adminNotes } = req.body;
    const adminId = req.user._id;

    if (!['approve', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, reject, or edit' });
    }

    const flag = await QuestionFlag.findById(flagId);
    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    flag.status = action === 'approve' ? 'resolved' : action === 'reject' ? 'rejected' : 'edited';
    flag.resolvedBy = adminId;
    flag.resolvedAt = new Date();
    flag.adminNotes = adminNotes || '';
    await flag.save();

    // If approved, update the question
    if (action === 'approve' && flag.suggestedChanges) {
      await Question.findByIdAndUpdate(flag.questionId, flag.suggestedChanges);
    }

    res.json({ success: true, flag });
  } catch (error) {
    console.error('Resolve flag error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/student/papers/available
 * Get available papers for student (Student only)
 */
export async function getStudentAvailablePapers(req, res) {
  try {
    const profile = req.user.studentProfile;
    if (!profile || !profile.isProfileComplete) {
      return res.status(400).json({ error: 'Complete your academic profile first' });
    }

    const papers = await getAvailablePapers({
      boardCode: profile.board,
      classLevel: profile.classLevel,
      subjectCode: req.query.subjectCode,
      stream: profile.stream,
      medium: profile.medium,
    });

    res.json({ success: true, papers });
  } catch (error) {
    console.error('Get student papers error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/student/papers/:paperId/test
 * Get paper for test taking (Student only)
 */
export async function getStudentPaperForTest(req, res) {
  try {
    const { paperId } = req.params;
    const paper = await getPaperForTest(paperId);
    res.json({ success: true, paper });
  } catch (error) {
    console.error('Get student paper error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/student/papers/:paperId/answers
 * Get paper with answers for review (Student only)
 */
export async function getStudentPaperWithAnswers(req, res) {
  try {
    const { paperId } = req.params;
    const paper = await getPaperWithAnswers(paperId);
    res.json({ success: true, paper });
  } catch (error) {
    console.error('Get paper with answers error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/student/mvvi
 * Get MVVI/VVI analysis for student's board/class/subject
 */
export async function getStudentMvvi(req, res) {
  try {
    const profile = req.user.studentProfile;
    if (!profile || !profile.isProfileComplete) {
      return res.status(400).json({ error: 'Complete your academic profile first' });
    }

    const { subjectCode } = req.query;
    if (!subjectCode) {
      return res.status(400).json({ error: 'subjectCode is required' });
    }

    const tags = await calculateMvviVviTags(profile.board, profile.classLevel, subjectCode);
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Get MVVI error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}