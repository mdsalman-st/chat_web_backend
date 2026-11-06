import mongoose from 'mongoose';
import { SUPPORTED_MEDIUMS } from '../utils/medium.js';

const pageEntrySchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    imageUrl: { type: String, required: true }, // Cloudinary ka URL yahan save hoga
    imageBase64: { type: String }, // Purana field, par ab compulsory nahi hai
    mimeType: { type: String, default: 'image/jpeg' },
    ocrText: { type: String, default: '' },
    ocrConfidence: { type: Number, default: 0 },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    detectedQuestions: [{ type: Number }],
  },
  { _id: false }
);

const questionEvaluationSchema = new mongoose.Schema(
  {
    questionNumber: { type: Number, required: true },
    questionText: { type: String, default: '' },
    hindiQuestionText: { type: String, default: '' },
    modelAnswer: { type: String, default: '' },
    studentAnswer: { type: String, default: '' },
    maxMarks: { type: Number, default: 5 },
    awardedMarks: { type: Number, default: 0 },
    feedback: { type: String, default: '' },
    keywordsCovered: [{ type: String }],
    keywordsMissed: [{ type: String }],
    stepMarksBreakdown: [
      {
        step: { type: String },
        marks: { type: Number },
        awarded: { type: Number },
        comment: { type: String },
      },
    ],
    diagramCredit: {
      required: { type: Boolean, default: false },
      awarded: { type: Number, default: 0 },
      maxMarks: { type: Number, default: 0 },
      comment: { type: String, default: '' },
    },
    examinerRemarks: { type: String, default: '' },
  },
  { _id: false }
);

const subjectiveSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // 👇 NAYA FIELD: TestAttempt se link karne ke liye (Digital Board Exam) 👇
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestAttempt',
      default: null,
      index: true,
    },
    boardCode: { type: String, required: true, lowercase: true, trim: true, index: true },
    classLevel: { type: String, required: true, trim: true, index: true },
    subjectCode: { type: String, required: true, lowercase: true, trim: true, index: true },
    subjectName: { type: String, default: '' },
    medium: { type: String, enum: SUPPORTED_MEDIUMS, default: 'Hindi' },

    paperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OfficialPaper',
      default: null,
      index: true,
    },
    paperCode: { type: String, default: '' },
    year: { type: Number, default: null },
    examPhase: { type: String, default: null },
    setCode: { type: String, default: null },

    expectedQuestions: [{
      questionNumber: { type: Number, required: true },
      questionType: { type: String, enum: ['short', 'long', 'subjective'], default: 'subjective' },
      questionText: { type: String, default: '' },
      hindiQuestionText: { type: String, default: '' },
      maxMarks: { type: Number, required: true },
      modelAnswer: { type: String, default: '' },
    }],
    attemptPatternSnapshot: {
      shortCount: { type: Number },
      shortAttemptLimit: { type: Number },
      shortMarks: { type: Number },
      longCount: { type: Number },
      longAttemptLimit: { type: Number },
      longMarks: { type: Number },
    },
    pages: [pageEntrySchema],
    totalPages: { type: Number, default: 0 },
    combinedTranscript: { type: String, default: '' },
    evaluations: [questionEvaluationSchema],

    totalMarks: { type: Number, default: 0 },
    obtainedMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    overallFeedback: { type: String, default: '' },
    strengths: [{ type: String }],
    areasOfImprovement: [{ type: String }],

    status: {
      type: String,
      enum: ['uploading', 'ocr_processing', 'evaluating', 'completed', 'failed', 'review_required'],
      default: 'uploading',
      index: true,
    },
    evaluationLeaseUntil: { type: Date, default: null, index: true },
    errorMessage: { type: String, default: '' },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

subjectiveSubmissionSchema.index({ userId: 1, status: 1, createdAt: -1 });
subjectiveSubmissionSchema.index({ boardCode: 1, classLevel: 1, subjectCode: 1 });

const SubjectiveSubmission = mongoose.model('SubjectiveSubmission', subjectiveSubmissionSchema);
export default SubjectiveSubmission;