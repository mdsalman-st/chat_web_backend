import SubjectiveSubmission from '../models/SubjectiveSubmission.js';
import OfficialPaper from '../models/OfficialPaper.js';
import Notification from '../models/Notification.js';
import { executeGeminiVisionWithFailover, executeAiJsonWithFailover } from '../utils/aiClient.js';

// 👇 PDF Parse ke liye import 👇
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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
          page.ocrText = pdfData.text || '';
          page.ocrConfidence = 99;
          page.processingStatus = 'completed';
          await submission.save();
          return page.ocrText;
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
    page.detectedQuestions = Array.isArray(result.detectedQuestions) ? result.detectedQuestions : [];
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
  await submission.save();

  for (const page of submission.pages) {
    if (page.processingStatus === 'pending') {
      await processPageOCR(submissionId, page.pageNumber);
    }
  }

  const updatedSubmission = await SubjectiveSubmission.findById(submissionId);
  updatedSubmission.status = 'evaluating';

  const combinedTranscript = updatedSubmission.pages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => `--- [Page ${p.pageNumber}] ---\n${p.ocrText}`)
    .join('\n\n');

  updatedSubmission.combinedTranscript = combinedTranscript;
  await updatedSubmission.save();

  let targetQuestions = [];
  if (updatedSubmission.paperId) {
    const paper = await OfficialPaper.findById(updatedSubmission.paperId).lean();
    if (paper && paper.questions && paper.questions.length > 0) {
      targetQuestions = paper.questions.slice(0, 5).map((q, idx) => ({
        questionNumber: q.questionNumber || idx + 1,
        questionText: q.questionText,
        hindiQuestionText: q.hindiQuestionText || q.questionText,
        maxMarks: q.marks || 5,
        modelAnswer: q.options?.find((o) => o.key === q.correctOption)?.text || 'Official standard answer and key principles.',
      }));
    }
  }

  if (targetQuestions.length === 0) {
    const subjectName = updatedSubmission.subjectName || updatedSubmission.subjectCode || 'General';
    
    if (!combinedTranscript || combinedTranscript.trim().length < 10) {
       updatedSubmission.status = 'completed';
       updatedSubmission.totalMarks = 0;
       updatedSubmission.obtainedMarks = 0;
       updatedSubmission.percentage = 0;
       updatedSubmission.overallFeedback = 'No readable answer found in the uploaded sheet. Please write your answers clearly.';
       updatedSubmission.evaluations = [];
       await updatedSubmission.save();
       return updatedSubmission;
    }

    const extractQuestionsPrompt = `You are an expert ${subjectName} examiner.
The student has written answers for a subjective test but we don't have the exact question paper.
Read the following student transcript and infer what the questions might have been based on their answers.

Transcript:
"""
${combinedTranscript}
"""

Return JSON:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Inferred question in English",
      "hindiQuestionText": "Inferred question in Hindi",
      "maxMarks": 5,
      "modelAnswer": "Standard ideal answer for this question"
    }
  ]
}`;

    try {
      const genRes = await executeAiJsonWithFailover({
        prompt: extractQuestionsPrompt,
        systemInstruction: 'You are a strict examiner inferring subjective questions from student answers.',
        taskType: 'heavy',
      });
      targetQuestions = genRes.result?.questions || [];
    } catch (e) {
      console.error("Failed to infer questions from transcript", e);
    }

    if (targetQuestions.length === 0) {
      targetQuestions = [{
        questionNumber: 1,
        questionText: `General Assessment for ${subjectName}`,
        hindiQuestionText: `${subjectName} के लिए सामान्य मूल्यांकन`,
        maxMarks: 10,
        modelAnswer: 'Evaluated based on general board standards for this subject.'
      }];
    }
  }

  const evaluations = [];
  let totalMaxMarks = 0;
  let totalAwardedMarks = 0;

  for (const q of targetQuestions) {
    totalMaxMarks += q.maxMarks;

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

      const awarded = Math.min(q.maxMarks, Math.max(0, Number(result.awardedMarks) || 0));
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
      console.warn(`Fallback evaluation for Q${q.questionNumber}:`, evalErr.message);
      
      const fallbackAwarded = 0; 
      totalAwardedMarks += fallbackAwarded;

      evaluations.push({
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        hindiQuestionText: q.hindiQuestionText,
        modelAnswer: q.modelAnswer,
        studentAnswer: 'Evaluation Error',
        maxMarks: q.maxMarks,
        awardedMarks: fallbackAwarded,
        feedback: 'AI was unable to evaluate this answer due to formatting or unreadable text.',
        keywordsCovered: [],
        keywordsMissed: [],
        stepMarksBreakdown: [],
        diagramCredit: { required: false, awarded: 0, maxMarks: 0, comment: 'N/A' },
        examinerRemarks: 'Could not evaluate.',
      });
    }
  }

  const percentage = totalMaxMarks > 0 ? Math.round((totalAwardedMarks / totalMaxMarks) * 100) : 0;
  updatedSubmission.evaluations = evaluations;
  updatedSubmission.totalMarks = totalMaxMarks;
  updatedSubmission.obtainedMarks = totalAwardedMarks;
  updatedSubmission.percentage = percentage;
  updatedSubmission.status = 'completed';
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

  try {
    await Notification.create({
      userId: updatedSubmission.userId,
      title: 'Answer Sheet Evaluated! 📄',
      message: `Your handwritten answer copy for ${updatedSubmission.subjectName || updatedSubmission.subjectCode} has been checked. Scored ${totalAwardedMarks}/${totalMaxMarks} (${percentage}%).`,
      type: 'subjective_result',
      link: `upload-sheet.html?submissionId=${updatedSubmission._id}`,
    });
  } catch (notifErr) {}

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
  } = options;

  const submission = new SubjectiveSubmission({
    userId,
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
    startedAt: new Date(),
  });

  await submission.save();

  setImmediate(async () => {
    try {
      await evaluateSubmission(submission._id);
    } catch (err) {
      console.error('Background evaluation error:', err);
      const failedSubmission = await SubjectiveSubmission.findById(submission._id);
      if (failedSubmission) {
        failedSubmission.status = 'failed';
        failedSubmission.errorMessage = err.message;
        await failedSubmission.save();
      }
    }
  });

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
  submission.errorMessage = '';
  submission.startedAt = new Date();
  submission.completedAt = null;
  submission.durationMs = 0;
  await submission.save();

  setImmediate(async () => {
    try {
      await evaluateSubmission(submission._id);
    } catch (err) {
      console.error('Retry evaluation error:', err);
      const failedSubmission = await SubjectiveSubmission.findById(submission._id);
      if (failedSubmission) {
        failedSubmission.status = 'failed';
        failedSubmission.errorMessage = err.message;
        await failedSubmission.save();
      }
    }
  });

  return {
    success: true,
    submissionId: submission._id,
    status: 'uploading',
  };
}