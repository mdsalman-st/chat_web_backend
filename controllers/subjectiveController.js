import {
  evaluateAnswerSheet,
  getSubmissionStatus,
  getSubmissionResult,
  getRecentSubmissions,
  retryEvaluation,
} from '../services/handwritingEvaluator.js';

import { uploadBase64Image } from '../services/cloudinaryUploader.js';
import mongoose from 'mongoose';
import TestAttempt from '../models/TestAttempt.js';
import Question from '../models/Question.js';
import GenerationJob from '../models/GenerationJob.js';
import OfficialPaper from '../models/OfficialPaper.js';
import {
  ANSWER_SHEET_UPLOAD_GRACE_MS,
  getResultReleaseState,
} from '../utils/resultRelease.js';

export async function uploadAnswerSheet(req, res) {
  try {
    const userId = req.user._id;
    const {
      boardCode, classLevel, subjectCode, subjectName, medium,
      paperId, paperCode, year, examPhase, setCode, pages, attemptId,
    } = req.body;

    if (!Array.isArray(pages) || pages.length === 0 || pages.length > 20) {
      return res.status(400).json({ error: 'Provide between 1 and 20 answer-sheet files' });
    }

    let attempt = null;
    let expectedQuestions = [];
    if (attemptId) {
      if (!mongoose.isValidObjectId(attemptId)) return res.status(400).json({ error: 'Invalid attemptId' });
      attempt = await TestAttempt.findOne({
        _id: attemptId,
        userId,
        status: { $in: ['in_progress', 'completed'] },
      });
      if (!attempt) return res.status(404).json({ error: 'Active exam attempt not found' });
      if (!attempt.subjectiveRequired) {
        return res.status(400).json({ error: 'This exam attempt does not have an answer-sheet section' });
      }

      const generationJob = attempt.generationJobId
        ? await GenerationJob.findById(attempt.generationJobId).select('status completedAt').lean()
        : null;
      if (attempt.generationJobId && generationJob?.status !== 'completed') {
        return res.status(409).json({ error: 'Wait until all written questions have finished generating before uploading your answer sheet' });
      }

      const uploadWindowBase = Math.max(
        attempt.deadlineAt?.getTime() || 0,
        attempt.finishedAt?.getTime() || 0,
        generationJob?.completedAt?.getTime() || 0,
      );
      const uploadDeadline = attempt.subjectiveUploadDeadlineAt
        ? new Date(attempt.subjectiveUploadDeadlineAt)
        : new Date((uploadWindowBase || Date.now()) + ANSWER_SHEET_UPLOAD_GRACE_MS);
      if (new Date() > uploadDeadline) {
        return res.status(400).json({ error: 'The answer-sheet upload window has closed' });
      }
      if (!attempt.subjectiveUploadDeadlineAt) {
        attempt.subjectiveUploadDeadlineAt = uploadDeadline;
        await attempt.save();
      }

      const existing = await SubjectiveSubmission.findOne({
        attemptId: attempt._id,
        userId,
      }).select('_id status').lean();
      if (existing && !['failed', 'review_required'].includes(existing.status)) {
        if (!attempt.subjectiveSubmissionId) {
          attempt.subjectiveSubmissionId = existing._id;
          await attempt.save();
        }
        return res.json({
          success: true,
          submissionId: existing._id,
          status: existing.status,
          alreadySubmitted: true,
        });
      }

      if (attempt.paperId) {
        const paper = await OfficialPaper.findById(attempt.paperId).select('questions').lean();
        expectedQuestions = (paper?.questions || [])
          .filter((question) => question.questionType === 'subjective')
          .map((question) => ({
            questionNumber: Number(question.questionNumber),
            questionType: question.questionType || 'subjective',
            questionText: question.questionText || '',
            hindiQuestionText: question.hindiQuestionText || '',
            maxMarks: Number(question.marks),
            modelAnswer: question.hindiModelAnswer || question.modelAnswer || '',
          }));
      } else {
        const questionOrder = new Map(attempt.questionIds.map((id, index) => [id.toString(), index]));
        const writtenQuestions = await Question.find({
          _id: { $in: attempt.questionIds },
          type: { $in: ['short', 'long'] },
        }).select('+modelAnswer +hindiModelAnswer').lean();
        writtenQuestions.sort((left, right) =>
          questionOrder.get(left._id.toString()) - questionOrder.get(right._id.toString()),
        );
        expectedQuestions = writtenQuestions.map((question, index) => ({
          questionNumber: index + 1,
          questionType: question.type,
          questionText: question.questionText || '',
          hindiQuestionText: question.hindiQuestionText || '',
          maxMarks: Number(question.marks),
          modelAnswer: question.hindiModelAnswer || question.modelAnswer || '',
        }));
      }
      if (!expectedQuestions.length) {
        return res.status(400).json({ error: 'This exam attempt has no available written questions' });
      }
    } else if (!subjectCode) {
      return res.status(400).json({ error: 'subjectCode is required' });
    }

    let totalBytes = 0;
    const validatedPages = [];
    for (const page of pages) {
      if (!page || typeof page !== 'object' || typeof page.imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Each file must include base64 data' });
      }
      const dataUrlMatch = page.imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
      const mimeType = page.mimeType || dataUrlMatch?.[1];
      const base64 = dataUrlMatch ? dataUrlMatch[2] : page.imageBase64;
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType)) {
        return res.status(400).json({ error: 'Only JPEG, PNG, WebP images and PDF files are supported' });
      }
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
        return res.status(400).json({ error: 'Invalid base64 file data' });
      }
      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Each file must be smaller than 10 MB' });
      }
      totalBytes += buffer.length;
      if (totalBytes > 20 * 1024 * 1024) {
        return res.status(400).json({ error: 'The combined upload must be smaller than 20 MB' });
      }
      const validSignature = mimeType === 'application/pdf'
        ? buffer.subarray(0, 5).toString() === '%PDF-'
        : mimeType === 'image/jpeg'
          ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
          : mimeType === 'image/png'
            ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
      if (!validSignature) return res.status(400).json({ error: 'File content does not match its file type' });
      validatedPages.push({ ...page, imageBase64: base64, mimeType });
    }

    const processedPages = [];
    for (const page of validatedPages) {
      const cloudinaryUrl = await uploadBase64Image(page.imageBase64, 'nexus_answersheets', page.mimeType);
      
      processedPages.push({
        ...page,
        imageUrl: cloudinaryUrl, 
        imageBase64: undefined,
      });
    }

    const result = await evaluateAnswerSheet(processedPages, userId, {
      boardCode: attempt?.boardCode || boardCode,
      classLevel: attempt?.classLevel || classLevel,
      subjectCode: attempt?.subjectCode || subjectCode,
      subjectName: attempt?.subjectName || subjectName,
      medium: attempt?.medium || medium,
      paperId: attempt?.paperId || paperId,
      paperCode: attempt?.paperCode || paperCode,
      year: attempt?.paperYear || year,
      examPhase: attempt?.paperExamPhase || examPhase,
      setCode: attempt?.paperSetCode || setCode,
      attemptId: attempt?._id || null,
      expectedQuestions,
      attemptPatternSnapshot: attempt?.boardPatternSnapshot || {},
    });

    if (attempt) {
      attempt.subjectiveSubmissionId = result.submissionId;
      await attempt.save();
    }
    res.status(201).json(result);
  } catch (error) {
    console.error('Upload answer sheet error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getSubmissionStatusController(req, res) {
  try {
    const userId = req.user._id;
    const { submissionId } = req.params;
    const result = await getSubmissionStatus(submissionId, userId);
    res.json(result);
  } catch (error) {
    console.error('Get submission status error:', error);
    if (error.message === 'Submission not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getSubmissionResultController(req, res) {
  try {
    const userId = req.user._id;
    const { submissionId } = req.params;
    const result = await getSubmissionResult(submissionId, userId);
    if (result.attemptId) {
      const attempt = await TestAttempt.findOne({
        _id: result.attemptId,
        userId,
      }).lean();
      const releaseState = attempt
        ? getResultReleaseState(attempt, result)
        : { available: false, resultReleaseAt: null };
      if (!releaseState.available) {
        return res.json({
          success: true,
          resultAvailable: false,
          status: result.status,
          resultReleaseAt: releaseState.resultReleaseAt,
        });
      }
    }
    res.json({ success: true, submission: result });
  } catch (error) {
    console.error('Get submission result error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getRecentSubmissionsController(req, res) {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const result = await getRecentSubmissions(userId, limit);
    const attemptIds = result.submissions.map((submission) => submission.attemptId).filter(Boolean);
    const attempts = await TestAttempt.find({ _id: { $in: attemptIds }, userId })
      .select('_id finishedAt resultReleaseAt deadlineAt subjectiveRequired subjectiveSubmissionId')
      .lean();
    const attemptsById = new Map(attempts.map((attempt) => [attempt._id.toString(), attempt]));
    result.submissions = result.submissions.map((submission) => {
      if (!submission.attemptId) return submission;
      const attempt = attemptsById.get(submission.attemptId.toString());
      if (attempt && getResultReleaseState(attempt, submission).available) return submission;
      const {
        evaluations,
        expectedQuestions,
        combinedTranscript,
        totalMarks,
        obtainedMarks,
        percentage,
        overallFeedback,
        strengths,
        areasOfImprovement,
        ...pendingSubmission
      } = submission;
      return {
        ...pendingSubmission,
        resultAvailable: false,
        resultReleaseAt: getResultReleaseState(attempt, submission).resultReleaseAt,
      };
    });
    res.json(result);
  } catch (error) {
    console.error('Get recent submissions error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function retryEvaluationController(req, res) {
  try {
    const userId = req.user._id;
    const { submissionId } = req.params;
    const result = await retryEvaluation(submissionId, userId);
    res.json(result);
  } catch (error) {
    console.error('Retry evaluation error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}