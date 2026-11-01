import mongoose from 'mongoose';

/**
 * SubjectiveSubmission Schema
 * Phase 6: Multi-page handwritten answer sheet upload and AI handwriting evaluation.
 */
const pageEntrySchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    imageBase64: { type: String, required: true },
    mimeType: { type: String, default: 'image/jpeg' },
    ocrText: { type: String, default: '' },
    ocrConfidence: { type: Number, default: 0 }, // 0 to 100
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
    boardCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subjectCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subjectName: { type: String, default: '' },
    medium: {
      type: String,
      enum: ['Hindi', 'English'],
      default: 'Hindi',
    },

    // Reference to official paper if evaluating against PYQ
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

    // Uploaded pages
    pages: [pageEntrySchema],
    totalPages: { type: Number, default: 0 },

    // Extracted combined transcription
    combinedTranscript: { type: String, default: '' },

    // Evaluation results
    evaluations: [questionEvaluationSchema],

    // Score & Summary
    totalMarks: { type: Number, default: 0 },
    obtainedMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    overallFeedback: { type: String, default: '' },
    strengths: [{ type: String }],
    areasOfImprovement: [{ type: String }],

    // Status tracking
    status: {
      type: String,
      enum: ['uploading', 'ocr_processing', 'evaluating', 'completed', 'failed'],
      default: 'uploading',
      index: true,
    },
    errorMessage: { type: String, default: '' },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

subjectiveSubmissionSchema.index({ userId: 1, status: 1, createdAt: -1 });
subjectiveSubmissionSchema.index({ boardCode: 1, classLevel: 1, subjectCode: 1 });

const SubjectiveSubmission = mongoose.model('SubjectiveSubmission', subjectiveSubmissionSchema);

export default SubjectiveSubmission;
