import { stringSimilarity } from 'string-similarity-js';
import OfficialPaper from '../models/OfficialPaper.js';
import Question from '../models/Question.js';
import BoardConfig from '../models/BoardConfig.js';

/**
 * Paper Ingestion Service — Phase 5
 * Handles ingestion of official board papers and answer keys,
 * matching with existing questions, and MVVI/VVI tag calculation.
 */

const SIMILARITY_THRESHOLD_HIGH = 0.85;
const SIMILARITY_THRESHOLD_LOW = 0.60;

/**
 * Ingest an official paper with its answer key
 * @param {Object} paperData - Paper data including questions and official answers
 * @returns {Promise<Object>} - Created OfficialPaper document
 */
export async function ingestOfficialPaper(paperData) {
  const {
    boardCode,
    classLevel,
    stream,
    subjectCode,
    subjectName,
    medium,
    year,
    examPhase,
    setCode,
    questions,
    sourceUrl,
    sourceCreditText,
    officialKeyUrl,
    ingestedBy,
  } = paperData;

  // Validate board config exists
  const boardConfig = await BoardConfig.findOne({ code: boardCode.toLowerCase(), isActive: true }).lean();
  if (!boardConfig) {
    throw new Error(`Board configuration not found for: ${boardCode}`);
  }

  // Generate paper code
  const formattedPhase = examPhase ? examPhase.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-') : '';
  const paperCode = `${boardConfig.shortName.toUpperCase()}-${year}-${formattedPhase}${setCode ? `-Set${setCode.toUpperCase()}` : ''}`;

  // Calculate total marks
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);

  // Create official paper document
  const paper = await OfficialPaper.create({
    boardCode: boardCode.toLowerCase(),
    classLevel: String(classLevel),
    stream: stream || null,
    subjectCode: subjectCode.toLowerCase(),
    subjectName,
    medium: medium || 'Hindi',
    year: Number(year),
    examPhase,
    setCode: setCode?.toUpperCase() || null,
    paperCode,
    questions: questions.map((q, idx) => ({
      questionNumber: q.questionNumber || idx + 1,
      questionText: q.questionText,
      hindiQuestionText: q.hindiQuestionText || '',
      options: q.options || [],
      correctOption: q.correctOption, // FROM OFFICIAL ANSWER KEY ONLY
      marks: q.marks || 1,
      difficulty: q.difficulty || 'Medium',
      subtopic: q.subtopic || '',
      chapterNumber: q.chapterNumber || null,
      chapterTitle: q.chapterTitle || '',
    })),
    totalQuestions: questions.length,
    totalMarks,
    sourceUrl: sourceUrl || '',
    sourceCreditText: sourceCreditText || boardConfig.sourceCreditText,
    officialKeyUrl: officialKeyUrl || '',
    status: 'ingested',
    ingestedBy,
    ingestedAt: new Date(),
  });

  return paper;
}

/**
 * Match official paper questions with existing Question bank
 * Uses text similarity to find corresponding questions
 * @param {string} paperId - OfficialPaper ID
 * @returns {Promise<Object>} - Matching results
 */
export async function matchPaperQuestions(paperId) {
  const paper = await OfficialPaper.findById(paperId).lean();
  if (!paper) {
    throw new Error('Official paper not found');
  }

  const results = {
    totalQuestions: paper.questions.length,
    matchedCount: 0,
    highConfidenceCount: 0,
    lowConfidenceCount: 0,
    pendingReviewCount: 0,
    matches: [],
    unmatched: [],
  };

  // Get existing questions for this board/class/subject/medium
  const existingQuestions = await Question.find({
    boardCode: paper.boardCode,
    classLevel: paper.classLevel,
    subjectCode: paper.subjectCode,
    medium: paper.medium,
    isActive: true,
    status: 'verified',
  }).select('+correctOption +explanation').lean();

  // Build lookup by question text for faster matching
  const existingByText = new Map();
  for (const q of existingQuestions) {
    const key = normalizeText(q.questionText);
    if (!existingByText.has(key)) {
      existingByText.set(key, []);
    }
    existingByText.get(key).push(q);
  }

  const matchedQuestionIds = [];

  for (const paperQ of paper.questions) {
    const normalizedPaperText = normalizeText(paperQ.questionText);
    let bestMatch = null;
    let bestScore = 0;

    // Try exact match first
    if (existingByText.has(normalizedPaperText)) {
      const candidates = existingByText.get(normalizedPaperText);
      // Verify correct option matches official key
      const exactMatch = candidates.find(c => 
        String(c.correctOption).toUpperCase() === String(paperQ.correctOption).toUpperCase()
      );
      if (exactMatch) {
        bestMatch = exactMatch;
        bestScore = 1.0;
      }
    }

    // If no exact match, use fuzzy similarity
    if (!bestMatch) {
      for (const existingQ of existingQuestions) {
        const score = stringSimilarity(normalizedPaperText, normalizeText(existingQ.questionText));
        if (score > bestScore) {
          bestScore = score;
          bestMatch = existingQ;
        }
      }
    }

    if (bestMatch && bestScore >= SIMILARITY_THRESHOLD_HIGH) {
      // High confidence match - auto-approve
      results.matchedCount++;
      results.highConfidenceCount++;
      matchedQuestionIds.push(bestMatch._id);
      results.matches.push({
        paperQuestionNumber: paperQ.questionNumber,
        matchedQuestionId: bestMatch._id,
        confidence: bestScore,
        status: 'auto_matched',
        officialCorrectOption: paperQ.correctOption,
        existingCorrectOption: bestMatch.correctOption,
      });
    } else if (bestMatch && bestScore >= SIMILARITY_THRESHOLD_LOW) {
      // Low confidence match - needs admin review
      results.matchedCount++;
      results.lowConfidenceCount++;
      results.pendingReviewCount++;
      matchedQuestionIds.push(bestMatch._id);
      results.matches.push({
        paperQuestionNumber: paperQ.questionNumber,
        matchedQuestionId: bestMatch._id,
        confidence: bestScore,
        status: 'pending_review',
        officialCorrectOption: paperQ.correctOption,
        existingCorrectOption: bestMatch.correctOption,
      });
    } else {
      // No match found
      results.unmatched.push({
        paperQuestionNumber: paperQ.questionNumber,
        questionText: paperQ.questionText,
        officialCorrectOption: paperQ.correctOption,
      });
    }
  }

  // Update paper with match results
  await OfficialPaper.findByIdAndUpdate(paperId, {
    $set: {
      matchedQuestionIds,
      matchStats: {
        totalQuestions: results.totalQuestions,
        matchedCount: results.matchedCount,
        highConfidenceCount: results.highConfidenceCount,
        lowConfidenceCount: results.lowConfidenceCount,
        pendingReviewCount: results.pendingReviewCount,
      },
      status: results.pendingReviewCount > 0 ? 'matched' : 'published',
      lastMatchedAt: new Date(),
    },
  });

  return results;
}

/**
 * Calculate MVVI/VVI tags deterministically based on frequency analysis
 * MVVI = Asked 3+ times in last 5 years
 * VVI = Asked 2 times in last 5 years
 * @param {string} boardCode - Board code
 * @param {string} classLevel - Class level
 * @param {string} subjectCode - Subject code
 * @returns {Promise<Array>} - Array of MVVI/VVI tags
 */
export async function calculateMvviVviTags(boardCode, classLevel, subjectCode) {
  const currentYear = new Date().getFullYear();
  const fiveYearsAgo = currentYear - 5;

  // Get all published official papers for this board/class/subject in last 5 years
  const papers = await OfficialPaper.find({
    boardCode: boardCode.toLowerCase(),
    classLevel: String(classLevel),
    subjectCode: subjectCode.toLowerCase(),
    year: { $gte: fiveYearsAgo, $lte: currentYear },
    status: { $in: ['published', 'matched'] },
  }).lean();

  // Count frequency of each question (by normalized text)
  const questionFrequency = new Map();

  for (const paper of papers) {
    for (const q of paper.questions) {
      const key = normalizeText(q.questionText);
      if (!questionFrequency.has(key)) {
        questionFrequency.set(key, {
          text: q.questionText,
          hindiText: q.hindiQuestionText,
          count: 0,
          years: new Set(),
          questionNumbers: [],
          correctOption: q.correctOption,
        });
      }
      const entry = questionFrequency.get(key);
      entry.count++;
      entry.years.add(paper.year);
      entry.questionNumbers.push({ year: paper.year, number: q.questionNumber });
    }
  }

  // Generate tags
  const tags = [];
  for (const [normalizedText, data] of questionFrequency.entries()) {
    const frequency = data.count;
    const years = Array.from(data.years).sort((a, b) => b - a);

    if (frequency >= 3) {
      tags.push({
        questionText: data.text,
        hindiQuestionText: data.hindiText,
        tag: 'MVVI',
        reason: `Asked ${frequency} times in last 5 years (${years.join(', ')})`,
        frequency,
        years,
        correctOption: data.correctOption,
      });
    } else if (frequency === 2) {
      tags.push({
        questionText: data.text,
        hindiQuestionText: data.hindiText,
        tag: 'VVI',
        reason: `Asked ${frequency} times in last 5 years (${years.join(', ')})`,
        frequency,
        years,
        correctOption: data.correctOption,
      });
    }
  }

  return tags;
}

/**
 * Apply MVVI/VVI tags to official paper
 * @param {string} paperId - OfficialPaper ID
 * @returns {Promise<Object>} - Updated paper with tags
 */
export async function applyMvviVviTags(paperId) {
  const paper = await OfficialPaper.findById(paperId).lean();
  if (!paper) {
    throw new Error('Official paper not found');
  }

  const tags = await calculateMvviVviTags(paper.boardCode, paper.classLevel, paper.subjectCode);

  // Map tags to this paper's questions
  const paperTags = [];
  for (const paperQ of paper.questions) {
    const normalizedText = normalizeText(paperQ.questionText);
    const matchingTag = tags.find(t => normalizeText(t.questionText) === normalizedText);
    if (matchingTag) {
      paperTags.push({
        questionNumber: paperQ.questionNumber,
        tag: matchingTag.tag,
        reason: matchingTag.reason,
        frequency: matchingTag.frequency,
        years: matchingTag.years,
      });
    }
  }

  await OfficialPaper.findByIdAndUpdate(paperId, {
    $set: { mvviTags: paperTags },
  });

  return { paperId, tagsApplied: paperTags.length, tags: paperTags };
}

/**
 * Get papers available for student (only past exam phases)
 * @param {Object} params - Filter parameters
 * @returns {Promise<Array>} - Available papers
 */
export async function getAvailablePapers({ boardCode, classLevel, subjectCode, stream, medium }) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();

  // Get board config to understand exam phase months
  const boardConfig = await BoardConfig.findOne({ code: boardCode.toLowerCase(), isActive: true }).lean();
  if (!boardConfig) {
    throw new Error('Board configuration not found');
  }

  // Determine which exam phases have passed
  const phaseOrder = { quarterly: 1, half_yearly: 2, sent_up: 3, annual: 4 };
  const availablePhases = [];

  for (const phase of boardConfig.examPhases || []) {
    if (!phase.isActive) continue;
    const examMonth = getMonthNumber(phase.examMonth);
    if (examMonth && examMonth < currentMonth) {
      availablePhases.push(phase.phaseId);
    } else if (examMonth === currentMonth) {
      // If same month, check if exam date has passed (simplified: assume mid-month)
      availablePhases.push(phase.phaseId);
    }
  }

  // Also include all phases from previous years
  const query = {
    boardCode: boardCode.toLowerCase(),
    classLevel: String(classLevel),
    subjectCode: subjectCode.toLowerCase(),
    medium: medium || 'Hindi',
    status: { $in: ['published', 'matched'] },
    $or: [
      { year: { $lt: currentYear } },
      { year: currentYear, examPhase: { $in: availablePhases } },
    ],
  };

  if (stream) query.stream = stream;
  if (examPhase) query.examPhase = examPhase;

  const papers = await OfficialPaper.find(query)
    .sort({ year: -1, examPhase: -1 })
    .select('year examPhase setCode paperCode totalQuestions totalMarks sourceCreditText mvviTags matchStats')
    .lean();

  return papers;
}

/**
 * Get a specific paper with questions for test taking
 * @param {string} paperId - OfficialPaper ID
 * @returns {Promise<Object>} - Paper with questions (correctOption hidden)
 */
export async function getPaperForTest(paperId) {
  const paper = await OfficialPaper.findById(paperId).lean();
  if (!paper) {
    throw new Error('Official paper not found');
  }

  // Return questions WITHOUT correctOption for test taking
  const safeQuestions = paper.questions.map((q, idx) => ({
    index: idx,
    questionNumber: q.questionNumber,
    questionText: q.questionText,
    hindiQuestionText: q.hindiQuestionText,
    options: q.options,
    marks: q.marks,
    difficulty: q.difficulty,
    subtopic: q.subtopic,
    chapterNumber: q.chapterNumber,
    chapterTitle: q.chapterTitle,
    isMVVI: q.isMVVI || false,
    isVVI: q.isVVI || false,
    mvviTag: paper.mvviTags?.find(t => t.questionNumber === q.questionNumber) || null,
  }));

  return {
    paperId: paper._id,
    paperCode: paper.paperCode,
    boardCode: paper.boardCode,
    classLevel: paper.classLevel,
    subjectCode: paper.subjectCode,
    subjectName: paper.subjectName,
    year: paper.year,
    examPhase: paper.examPhase,
    setCode: paper.setCode,
    medium: paper.medium,
    totalQuestions: paper.totalQuestions,
    totalMarks: paper.totalMarks,
    sourceCreditText: paper.sourceCreditText,
    questions: safeQuestions,
  };
}

/**
 * Get paper with answers for review (after test completion)
 * @param {string} paperId - OfficialPaper ID
 * @returns {Promise<Object>} - Paper with correct answers
 */
export async function getPaperWithAnswers(paperId) {
  const paper = await OfficialPaper.findById(paperId).lean();
  if (!paper) {
    throw new Error('Official paper not found');
  }

  return {
    paperId: paper._id,
    paperCode: paper.paperCode,
    questions: paper.questions.map(q => ({
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      hindiQuestionText: q.hindiQuestionText,
      options: q.options,
      correctOption: q.correctOption, // OFFICIAL KEY - ONLY SOURCE OF TRUTH
      marks: q.marks,
      difficulty: q.difficulty,
      subtopic: q.subtopic,
      chapterNumber: q.chapterNumber,
      chapterTitle: q.chapterTitle,
      mvviTag: paper.mvviTags?.find(t => t.questionNumber === q.questionNumber) || null,
    })),
    sourceCreditText: paper.sourceCreditText,
  };
}

/**
 * Normalize text for comparison
 */
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, '') // Keep alphanumeric, spaces, Devanagari
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert month name to number
 */
function getMonthNumber(monthName) {
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  return months[String(monthName).toLowerCase()] || null;
}

/**
 * Get papers pending admin review
 * @returns {Promise<Array>} - Papers with pending review matches
 */
export async function getPapersPendingReview() {
  return OfficialPaper.find({
    status: 'matched',
    'matchStats.pendingReviewCount': { $gt: 0 },
  })
    .sort({ lastMatchedAt: -1 })
    .select('paperCode boardCode classLevel subjectCode year examPhase setCode matchStats')
    .lean();
}

/**
 * Admin approve/reject a low-confidence match
 * @param {string} paperId - OfficialPaper ID
 * @param {number} questionNumber - Question number in paper
 * @param {string} action - 'approve' or 'reject'
 * @param {string} adminId - Admin user ID
 * @returns {Promise<Object>} - Updated match status
 */
export async function adminReviewMatch(paperId, questionNumber, action, adminId) {
  const paper = await OfficialPaper.findById(paperId);
  if (!paper) {
    throw new Error('Official paper not found');
  }

  // Find the match in matchStats (we need to track this better)
  // For now, update the paper's matchedQuestionIds based on action
  // This is a simplified version - in production, you'd want a separate Match collection

  if (action === 'approve') {
    // Match is approved - paper can be published if all pending are resolved
    const pendingCount = paper.matchStats.pendingReviewCount - 1;
    const newStatus = pendingCount === 0 ? 'published' : 'matched';
    
    await OfficialPaper.findByIdAndUpdate(paperId, {
      $set: {
        'matchStats.pendingReviewCount': pendingCount,
        'matchStats.highConfidenceCount': paper.matchStats.highConfidenceCount + 1,
        'matchStats.lowConfidenceCount': paper.matchStats.lowConfidenceCount - 1,
        status: newStatus,
      },
    });
  } else if (action === 'reject') {
    // Match rejected - remove from matchedQuestionIds
    await OfficialPaper.findByIdAndUpdate(paperId, {
      $inc: {
        'matchStats.matchedCount': -1,
        'matchStats.lowConfidenceCount': -1,
        'matchStats.pendingReviewCount': -1,
      },
      $pull: { matchedQuestionIds: { $in: [] } }, // Would need specific ID
    });
  }

  return { success: true, action };
}