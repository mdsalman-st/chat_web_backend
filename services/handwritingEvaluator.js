import SubjectiveSubmission from '../models/SubjectiveSubmission.js';
import OfficialPaper from '../models/OfficialPaper.js';
import TestAttempt from '../models/TestAttempt.js';
import Notification from '../models/Notification.js';
import { executeGeminiVisionWithFailover, executeAiJsonWithFailover } from '../utils/aiClient.js';

// 👇 PDF Parse ke liye import 👇
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const EVALUATION_LEASE_MS = 5 * 60 * 1000;
const EVALUATION_HEARTBEAT_MS = 30 * 1000;
let evaluationWorkerScheduled = false;
let evaluationWorkerRunning = false;
let evaluationRecoveryTimer = null;

function scheduleEvaluationWorker() {
  if (evaluationWorkerScheduled || evaluationWorkerRunning) return;
  evaluationWorkerScheduled = true;
  setImmediate(() => {
    evaluationWorkerScheduled = false;
    runEvaluationWorker().catch((error) => console.error('[SubjectiveEvaluation] Worker error:', error));
  });
}

async function runEvaluationWorker() {
  if (evaluationWorkerRunning) return;
  evaluationWorkerRunning = true;
  try {
    while (true) {
      const now = new Date();
      const submission = await SubjectiveSubmission.findOneAndUpdate({
        status: { $in: ['uploading', 'ocr_processing', 'evaluating'] },
        $or: [
          { evaluationLeaseUntil: null },
          { evaluationLeaseUntil: { $lte: now } },
        ],
      }, {
        $set: {
          status: 'ocr_processing',
          evaluationLeaseUntil: new Date(now.getTime() + EVALUATION_LEASE_MS),
        },
      }, {
        sort: { createdAt: 1 },
        new: true,
      });
      if (!submission) break;

      const heartbeat = setInterval(() => {
        SubjectiveSubmission.updateOne({
          _id: submission._id,
          status: { $in: ['ocr_processing', 'evaluating'] },
        }, {
          $set: { evaluationLeaseUntil: new Date(Date.now() + EVALUATION_LEASE_MS) },
        }).catch((error) => console.error('[SubjectiveEvaluation] Lease renewal failed:', error));
      }, EVALUATION_HEARTBEAT_MS);
      heartbeat.unref?.();

      try {
        await evaluateSubmission(submission._id);
      } catch (error) {
        console.error(`[SubjectiveEvaluation] Submission ${submission._id} failed:`, error);
        await SubjectiveSubmission.updateOne({ _id: submission._id }, {
          $set: {
            status: 'failed',
            errorMessage: error.message,
            evaluationLeaseUntil: null,
          },
        });
      } finally {
        clearInterval(heartbeat);
      }
    }
  } finally {
    evaluationWorkerRunning = false;
  }
}

export function startSubjectiveEvaluationWorker() {
  if (evaluationRecoveryTimer) return;
  scheduleEvaluationWorker();
  evaluationRecoveryTimer = setInterval(scheduleEvaluationWorker, 10 * 1000);
  evaluationRecoveryTimer.unref?.();
}

function normalizeQuestionNumber(value) {
  const normalized = String(value)
    .replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const questionNumber = Number(normalized);
  return Number.isInteger(questionNumber) && questionNumber > 0 ? questionNumber : null;
}

function detectQuestionNumbers(text, reportedNumbers = []) {
  const found = [];
  const seen = new Set();
  const addNumber = (value) => {
    const number = normalizeQuestionNumber(value);
    if (number && !seen.has(number)) {
      seen.add(number);
      found.push(number);
    }
  };
  const markerPattern = /(?:\b(?:Q(?:uestion)?|Ans(?:wer)?)\s*\.?\s*|प्रश्न\s*|प्र\.\s*)[:#.)-]?\s*([0-9०-९٠-٩]{1,3})/giu;
  for (const match of String(text || '').matchAll(markerPattern)) addNumber(match[1]);
  for (const number of reportedNumbers) addNumber(number);
  return found;
}

function getSectionLimit(questions, configuredCount, configuredLimit) {
  const count = Number(configuredCount) > 0
    ? Math.min(questions.length, Number(configuredCount))
    : questions.length;
  return Number(configuredLimit) > 0 ? Math.min(count, Number(configuredLimit)) : count;
}

function getSectionMaxMarks(questions, count, limit, configuredMarks) {
  const includedCount = Math.min(questions.length, count, limit);
  if (!includedCount) return 0;
  if (Number(configuredMarks) > 0) return includedCount * Number(configuredMarks);
  return questions.slice(0, includedCount).reduce((total, question) => total + Number(question.maxMarks || 0), 0);
}

export function selectSubjectiveQuestionsByAnswerOrder(targetQuestions, pages, pattern = {}) {
  const targetByNumber = new Map(targetQuestions.map((question) => [Number(question.questionNumber), question]));
  const detectedOrder = [];
  const detectedSet = new Set();
  for (const page of pages) {
    const pageNumbers = detectQuestionNumbers(page.ocrText, page.detectedQuestions);
    for (const questionNumber of pageNumbers) {
      if (targetByNumber.has(questionNumber) && !detectedSet.has(questionNumber)) {
        detectedSet.add(questionNumber);
        detectedOrder.push(questionNumber);
      }
    }
  }

  const shortQuestions = targetQuestions.filter((question) => question.questionType === 'short');
  const longQuestions = targetQuestions.filter((question) => question.questionType === 'long');
  const otherQuestions = targetQuestions.filter((question) => !['short', 'long'].includes(question.questionType));
  const shortLimit = getSectionLimit(shortQuestions, pattern.shortCount, pattern.shortAttemptLimit);
  const longLimit = getSectionLimit(longQuestions, pattern.longCount, pattern.longAttemptLimit);
  const selectedQuestionNumbers = new Set();
  let shortSelected = 0;
  let longSelected = 0;
  for (const questionNumber of detectedOrder) {
    const question = targetByNumber.get(questionNumber);
    if (question.questionType === 'short') {
      if (shortSelected < shortLimit) {
        selectedQuestionNumbers.add(questionNumber);
        shortSelected++;
      }
    } else if (question.questionType === 'long') {
      if (longSelected < longLimit) {
        selectedQuestionNumbers.add(questionNumber);
        longSelected++;
      }
    } else {
      selectedQuestionNumbers.add(questionNumber);
    }
  }

  return {
    detectedOrder,
    questionsToEvaluate: targetQuestions.filter((question) =>
      selectedQuestionNumbers.has(Number(question.questionNumber)),
    ),
    totalMaxMarks: getSectionMaxMarks(
      shortQuestions,
      Number(pattern.shortCount) || shortQuestions.length,
      shortLimit,
      pattern.shortMarks,
    ) + getSectionMaxMarks(
      longQuestions,
      Number(pattern.longCount) || longQuestions.length,
      longLimit,
      pattern.longMarks,
    ) + otherQuestions.reduce((total, question) => total + Number(question.maxMarks || 0), 0),
  };
}

/**
 * Phase 6: Handwriting OCR & Rubric-based Subjective Evaluator Service
 */

export async function processPageOCR(submissionId, pageNumber) {
  const submission = await SubjectiveSubmission.findById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }

  const page = submission.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) {
    throw new Error(`Page ${pageNumber} not found in submission`);
  }

  page.processingStatus = 'processing';
  await submission.save();

  try {
    // 👇 NAYA: AGAR PDF HAI TOH DIRECT TEXT NIKALO 👇
    if (page.mimeType === 'application/pdf') {
      try {
        let pdfBuffer;
        if (page.imageBase64) {
          pdfBuffer = Buffer.from(page.imageBase64, 'base64');
        } else if (page.imageUrl) {
          const res = await fetch(page.imageUrl);
          pdfBuffer = Buffer.from(await res.arrayBuffer());
        }
        
        if (pdfBuffer) {
          const pdfData = await pdfParse(pdfBuffer);
          if (pdfData.text?.trim()) {
            page.ocrText = pdfData.text;
            page.ocrConfidence = 99;
            page.detectedQuestions = detectQuestionNumbers(page.ocrText);
            page.processingStatus = 'completed';
            await submission.save();
            return page.ocrText;
          }
        }
      } catch (pdfErr) {
        console.error("PDF Parse Error:", pdfErr);
        // Agar PDF parse fail ho jaye, toh neeche wala Gemini try karega
      }
    }

    // Agar Image hai, toh Gemini Vision use karo
    const prompt = `You are a high-precision OCR engine specializing in Indian state board handwritten examination answer copies in Hindi (Devanagari) and English.
Transcribe all handwritten student answers visible on this page accurately.
Preserve question numbers (e.g., "प्रश्न 1", "Q1", "Ans 2") and mathematical or chemical notations.
DO NOT summarize. DO NOT hallucinate. If the page is blank or unreadable, return an empty string.

Return STRICT JSON matching this schema:
{
  "extractedText": "full transcript with line breaks",
  "confidence": 92,
  "detectedLanguages": ["Hindi", "English"],
  "detectedQuestions": [1, 2]
}`;

    let imageBase64Data = page.imageBase64;
    
    if (!imageBase64Data && page.imageUrl) {
      try {
        const response = await fetch(page.imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        imageBase64Data = Buffer.from(arrayBuffer).toString('base64');
      } catch (fetchErr) {
        console.error(`Failed to fetch image from Cloudinary: ${fetchErr.message}`);
      }
    }

    const { result } = await executeGeminiVisionWithFailover({
      imageBase64: imageBase64Data, 
      mimeType: page.mimeType || 'image/jpeg',
      prompt,
      systemInstruction: 'You are an accurate OCR system for handwritten examination papers in Hindi and English.',
    });

    page.ocrText = result.extractedText || '';
    page.ocrConfidence = typeof result.confidence === 'number' ? result.confidence : 85;
    page.detectedQuestions = detectQuestionNumbers(
      page.ocrText,
      Array.isArray(result.detectedQuestions) ? result.detectedQuestions : [],
    );
    page.processingStatus = 'completed';

    await submission.save();
    return page.ocrText;
  } catch (err) {
    console.error(`OCR error on page ${pageNumber} for submission ${submissionId}:`, err);
    page.processingStatus = 'failed';
    page.ocrText = `[OCR Failed: Could not read handwriting on page ${pageNumber}.]`;
    await submission.save();
    return page.ocrText;
  }
}

export async function evaluateSubmission(submissionId) {
  const submission = await SubjectiveSubmission.findById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }

  submission.status = 'ocr_processing';
  submission.pages.forEach((page) => {
    if (page.processingStatus === 'processing') page.processingStatus = 'pending';
  });
  await submission.save();

  for (const page of submission.pages) {
    if (page.processingStatus === 'pending') {
      await processPageOCR(submissionId, page.pageNumber);
    }
  }

  const updatedSubmission = await SubjectiveSubmission.findById(submissionId);
  if (updatedSubmission.pages.some((page) => page.processingStatus === 'failed')) {
    throw new Error('One or more answer-sheet files could not be read. Please upload clearer pages and retry.');
  }
  updatedSubmission.status = 'evaluating';

  const combinedTranscript = updatedSubmission.pages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => `--- [Page ${p.pageNumber}] ---\n${p.ocrText}`)
    .join('\n\n');

  updatedSubmission.combinedTranscript = combinedTranscript;
  await updatedSubmission.save();

  let targetQuestions = (updatedSubmission.expectedQuestions || []).map((question) => ({
    questionNumber: question.questionNumber,
    questionType: question.questionType || 'subjective',
    questionText: question.questionText,
    hindiQuestionText: question.hindiQuestionText || question.questionText,
    maxMarks: question.maxMarks,
    modelAnswer: question.modelAnswer,
  }));
  if (!targetQuestions.length && updatedSubmission.paperId) {
    const paper = await OfficialPaper.findById(updatedSubmission.paperId).lean();
    if (paper && paper.questions && paper.questions.length > 0) {
      targetQuestions = paper.questions.filter((q) => q.questionType === 'subjective').map((q, idx) => ({
        questionNumber: q.questionNumber || idx + 1,
        questionType: 'subjective',
        questionText: q.questionText,
        hindiQuestionText: q.hindiQuestionText || q.questionText,
        maxMarks: q.marks || 5,
        modelAnswer: q.hindiModelAnswer || q.modelAnswer || '',
      }));
    }
  }

  if (!combinedTranscript.trim()) {
    throw new Error('No readable handwriting was found in the uploaded answer sheet.');
  }
  if (!targetQuestions.length || targetQuestions.some((question) => !question.modelAnswer?.trim())) {
    updatedSubmission.status = 'review_required';
    updatedSubmission.errorMessage = 'Exact subjective questions and official model answers are required before AI evaluation.';
    updatedSubmission.evaluationLeaseUntil = null;
    await updatedSubmission.save();
    return updatedSubmission;
  }
  if (targetQuestions.some((question) => !Number.isFinite(Number(question.maxMarks)) || Number(question.maxMarks) <= 0)) {
    updatedSubmission.status = 'review_required';
    updatedSubmission.errorMessage = 'Valid maximum marks are required for every subjective question before evaluation.';
    updatedSubmission.evaluationLeaseUntil = null;
    await updatedSubmission.save();
    return updatedSubmission;
  }

  const pattern = updatedSubmission.attemptPatternSnapshot || {};
  const selection = selectSubjectiveQuestionsByAnswerOrder(targetQuestions, updatedSubmission.pages, pattern);
  if (!selection.detectedOrder.length) {
    updatedSubmission.status = 'review_required';
    updatedSubmission.errorMessage = 'Question numbers could not be identified. Number each written answer clearly, then upload the answer sheet again.';
    updatedSubmission.evaluationLeaseUntil = null;
    await updatedSubmission.save();
    return updatedSubmission;
  }
  if (!selection.questionsToEvaluate.length) {
    updatedSubmission.status = 'review_required';
    updatedSubmission.errorMessage = 'No numbered answers matched the written questions in this exam.';
    updatedSubmission.evaluationLeaseUntil = null;
    await updatedSubmission.save();
    return updatedSubmission;
  }

  const evaluations = [];
  const totalMaxMarks = selection.totalMaxMarks;
  let totalAwardedMarks = 0;

  for (const q of selection.questionsToEvaluate) {
    const evaluationPrompt = `You are a strict, fair Indian State Board (BSEB/CBSE) examiner checking a handwritten subjective answer copy.

Subject: ${updatedSubmission.subjectName || updatedSubmission.subjectCode}
Question ${q.questionNumber}: ${q.questionText} (${q.hindiQuestionText})
Maximum Marks: ${q.maxMarks}
Official Model Answer / Marking Scheme: ${q.modelAnswer}

Student's Transcribed Copy:
"""
${combinedTranscript}
"""

Evaluate Question ${q.questionNumber} from the student's transcript strictly against the model answer and award step marks.
If the student's answer is completely missing or irrelevant, award 0 marks.

Return STRICT JSON:
{
  "studentAnswerFound": true,
  "studentAnswer": "excerpt of answer found for this question, or 'Not found'",
  "awardedMarks": 4.5,
  "feedback": "constructive examiner review in bilingual style (Hindi + English)",
  "keywordsCovered": ["keyword1"],
  "keywordsMissed": ["keyword2"],
  "stepMarksBreakdown": [
    { "step": "Definition and Concept", "marks": 2, "awarded": 2, "comment": "Accurate definition provided." }
  ],
  "diagramCredit": {
    "required": false,
    "awarded": 0,
    "maxMarks": 0,
    "comment": "No diagram required"
  },
  "examinerRemarks": "Overall feedback."
}`;

    try {
      const { result } = await executeAiJsonWithFailover({
        prompt: evaluationPrompt,
        systemInstruction: 'You are an experienced board examiner evaluating subjective student answer copies with fair step-marking.',
        taskType: 'heavy',
      });

      const rawAwardedMarks = result.awardedMarks;
      const awardedValue = Number(rawAwardedMarks);
      if ((typeof rawAwardedMarks !== 'number'
        && (typeof rawAwardedMarks !== 'string' || !rawAwardedMarks.trim()))
        || !Number.isFinite(awardedValue)
        || awardedValue < 0
        || awardedValue > q.maxMarks) {
        throw new Error('AI returned an invalid mark value');
      }
      const awarded = awardedValue;
      totalAwardedMarks += awarded;

      evaluations.push({
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        hindiQuestionText: q.hindiQuestionText,
        modelAnswer: q.modelAnswer,
        studentAnswer: result.studentAnswer || 'Not found in transcript.',
        maxMarks: q.maxMarks,
        awardedMarks: awarded,
        feedback: result.feedback || 'Checked as per board criteria.',
        keywordsCovered: Array.isArray(result.keywordsCovered) ? result.keywordsCovered : [],
        keywordsMissed: Array.isArray(result.keywordsMissed) ? result.keywordsMissed : [],
        stepMarksBreakdown: Array.isArray(result.stepMarksBreakdown) ? result.stepMarksBreakdown : [],
        diagramCredit: result.diagramCredit || { required: false, awarded: 0, maxMarks: 0, comment: '' },
        examinerRemarks: result.examinerRemarks || 'Evaluated.',
      });
    } catch (evalErr) {
      throw new Error(`AI evaluation failed for question ${q.questionNumber}: ${evalErr.message}`);
    }
  }

  const percentage = totalMaxMarks > 0 ? Math.round((totalAwardedMarks / totalMaxMarks) * 100) : 0;
  updatedSubmission.evaluations = evaluations;
  updatedSubmission.totalMarks = totalMaxMarks;
  updatedSubmission.obtainedMarks = totalAwardedMarks;
  updatedSubmission.percentage = percentage;
  updatedSubmission.status = 'completed';
  updatedSubmission.evaluationLeaseUntil = null;
  updatedSubmission.completedAt = new Date();
  updatedSubmission.durationMs = updatedSubmission.completedAt.getTime() - updatedSubmission.startedAt.getTime();

  updatedSubmission.overallFeedback = percentage >= 80
    ? 'उत्कृष्ट प्रदर्शन! Your answer structuring and keyword coverage match the board toppers pattern.'
    : percentage >= 60
    ? 'अच्छा प्रयास! Focus on writing detailed steps and using key terminology to gain full marks.'
    : 'सुधार की आवश्यकता है। Review the official model answers and practice writing key concepts clearly.';

  updatedSubmission.strengths = ['Good attempt', 'Handwriting detected'];
  updatedSubmission.areasOfImprovement = ['More detailed step marks', 'Include key terminology'];

  await updatedSubmission.save();
  if (updatedSubmission.attemptId) {
    const attempt = await TestAttempt.findOne({
      _id: updatedSubmission.attemptId,
      userId: updatedSubmission.userId,
    });
    if (attempt) {
      attempt.subjectiveSubmissionId = updatedSubmission._id;
      attempt.subjectiveScore = {
        totalMarks: totalMaxMarks,
        obtainedMarks: totalAwardedMarks,
        percentage,
      };
      const combinedTotalMarks = (attempt.score?.totalMarks || 0) + totalMaxMarks;
      const combinedObtainedMarks = (attempt.score?.obtainedMarks || 0) + totalAwardedMarks;
      attempt.combinedScore = {
        totalMarks: combinedTotalMarks,
        obtainedMarks: combinedObtainedMarks,
        percentage: combinedTotalMarks ? Math.round((combinedObtainedMarks / combinedTotalMarks) * 100) : 0,
      };
      await attempt.save();
    }
  }

  if (!updatedSubmission.attemptId) {
    try {
      await Notification.create({
        userId: updatedSubmission.userId,
        title: 'Answer Sheet Evaluated! 📄',
        message: `Your handwritten answer copy for ${updatedSubmission.subjectName || updatedSubmission.subjectCode} has been checked. Scored ${totalAwardedMarks}/${totalMaxMarks} (${percentage}%).`,
        type: 'subjective_result',
        link: `upload-sheet.html?submissionId=${updatedSubmission._id}`,
      });
    } catch (notifErr) {}
  }

  return updatedSubmission;
}

export async function getSubmissionResult(submissionId, userId) {
  const submission = await SubjectiveSubmission.findOne({ _id: submissionId, userId }).lean();
  if (!submission) {
    throw new Error('Submission not found');
  }
  return submission;
}

export async function evaluateAnswerSheet(pages, userId, options = {}) {
  const {
    boardCode = 'bseb',
    classLevel = '10',
    subjectCode = 'science',
    subjectName = 'Science',
    medium = 'Hindi',
    paperId = null,
    paperCode = '',
    year = null,
    examPhase = '',
    setCode = '',
    attemptId = null,
    expectedQuestions = [],
    attemptPatternSnapshot = {},
  } = options;

  const submission = new SubjectiveSubmission({
    userId,
    attemptId,
    boardCode,
    classLevel,
    subjectCode,
    subjectName,
    medium,
    paperId,
    paperCode,
    year,
    examPhase,
    setCode,
    expectedQuestions,
    attemptPatternSnapshot,
    pages: pages.map((p, idx) => {
      const pageData = {
        pageNumber: idx + 1,
        mimeType: p.mimeType || 'image/jpeg',
        imageUrl: p.imageUrl || '',
      };
      if (!p.imageUrl && p.imageBase64) {
        pageData.imageBase64 = p.imageBase64;
      }
      return pageData;
    }),
    totalPages: pages.length,
    status: 'uploading',
    evaluationLeaseUntil: null,
    startedAt: new Date(),
  });

  await submission.save();
  scheduleEvaluationWorker();

  return {
    success: true,
    submissionId: submission._id,
    status: 'uploading',
  };
}

export async function getSubmissionStatus(submissionId, userId) {
  const submission = await SubjectiveSubmission.findOne({ _id: submissionId, userId }).lean();
  if (!submission) {
    throw new Error('Submission not found');
  }

  return {
    success: true,
    status: submission.status,
    totalPages: submission.totalPages,
    processedPages: submission.pages?.filter(p => p.processingStatus === 'completed').length || 0,
    errorMessage: submission.errorMessage,
  };
}

export async function getRecentSubmissions(userId, limit = 10) {
  const submissions = await SubjectiveSubmission.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    success: true,
    submissions,
  };
}

export async function retryEvaluation(submissionId, userId) {
  const submission = await SubjectiveSubmission.findOne({ _id: submissionId, userId });
  if (!submission) {
    throw new Error('Submission not found');
  }

  if (submission.status !== 'failed') {
    throw new Error('Only failed submissions can be retried');
  }

  submission.status = 'uploading';
  submission.evaluationLeaseUntil = null;
  submission.errorMessage = '';
  submission.startedAt = new Date();
  submission.completedAt = null;
  submission.durationMs = 0;
  await submission.save();
  scheduleEvaluationWorker();

  return {
    success: true,
    submissionId: submission._id,
    status: 'uploading',
  };
}