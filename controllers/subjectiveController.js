import {
  evaluateAnswerSheet,
  getSubmissionStatus,
  getSubmissionResult,
  getRecentSubmissions,
  retryEvaluation,
} from '../services/handwritingEvaluator.js';

import { uploadBase64Image } from '../services/cloudinaryUploader.js';

export async function uploadAnswerSheet(req, res) {
  try {
    const userId = req.user._id;
    const {
      boardCode, classLevel, subjectCode, subjectName, medium,
      paperId, paperCode, year, examPhase, setCode, pages,
    } = req.body;

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'No pages provided' });
    }

    if (!subjectCode) {
      return res.status(400).json({ error: 'subjectCode is required' });
    }

    for (const page of pages) {
      if (!page.imageBase64) {
        return res.status(400).json({ error: 'Each page must have imageBase64' });
      }
    }

    const processedPages = [];
    for (const page of pages) {
      // 👇 YAHAN mimeType PASS KIYA HAI 👇
      const cloudinaryUrl = await uploadBase64Image(page.imageBase64, 'nexus_answersheets', page.mimeType);
      
      processedPages.push({
        ...page,
        imageUrl: cloudinaryUrl, 
        imageBase64: page.imageBase64 
      });
    }

    const result = await evaluateAnswerSheet(processedPages, userId, {
      boardCode, classLevel, subjectCode, subjectName, medium,
      paperId, paperCode, year, examPhase, setCode,
    });

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
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getSubmissionResultController(req, res) {
  try {
    const userId = req.user._id;
    const { submissionId } = req.params;
    const result = await getSubmissionResult(submissionId, userId);
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