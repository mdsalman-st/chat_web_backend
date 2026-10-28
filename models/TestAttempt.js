import mongoose from 'mongoose';

/**
 * TestAttempt Schema
 * Tracks every student test session — chapter practice or full paper.
 * Stores per-question answers, timing, score breakdown, and AI analysis.
 */
const answerEntrySchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: String, default: null }, // 'A','B','C','D' or null if skipped
    correctOption: { type: String, required: true },
    isCorrect: { type: Boolean, default: false },
    isSkipped: { type: Boolean, default: true },
    timeTakenMs: { type: Number, default: 0 }, // time spent on this question
    marks: { type: Number, default: 1 },
    marksAwarded: { type: Number, default: 0 },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    chapterNumber: { type: Number },
    subtopic: { type: String, default: '' },
    mistakeReason: { type: String, default: '' },
  },
  { _id: false }
);

const testAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Test configuration
    testType: {
      type: String,
      enum: ['chapter_practice', 'full_paper', 'mock_exam'],
      default: 'chapter_practice',
    },
    boardCode: { type: String, required: true, lowercase: true },
    classLevel: { type: String, required: true },
    subjectCode: { type: String, required: true, lowercase: true },
    subjectName: { type: String, default: '' },
    chapterNumber: { type: Number, default: null }, // null for full paper
    chapterTitle: { type: String, default: '' },
    medium: { type: String, enum: ['Hindi', 'English'], default: 'Hindi' },

    // Question IDs for this test (order preserved)
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    totalQuestions: { type: Number, default: 0 },

    // Answers
    answers: [answerEntrySchema],

    // Status
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
      index: true,
    },

    // Timing
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 }, // total time taken
    timeLimitMs: { type: Number, default: 0 }, // 0 = unlimited (practice mode)

    // Score breakdown
    score: {
      totalMarks: { type: Number, default: 0 },
      obtainedMarks: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      correct: { type: Number, default: 0 },
      incorrect: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      easyCorrect: { type: Number, default: 0 },
      easyTotal: { type: Number, default: 0 },
      mediumCorrect: { type: Number, default: 0 },
      mediumTotal: { type: Number, default: 0 },
      hardCorrect: { type: Number, default: 0 },
      hardTotal: { type: Number, default: 0 },
    },

    // AI Analysis (populated after test completion)
    aiAnalysis: {
      overallRemark: { type: String, default: '' },
      strengths: [{ type: String }],
      weakAreas: [{ type: String }],
      recommendations: [{ type: String }],
      performanceLevel: {
        type: String,
        enum: ['Excellent', 'Good', 'Average', 'Needs Improvement', 'Critical', ''],
        default: '',
      },
    },

    aiAnalysisStatus: {
      type: String,
      enum: ['pending', 'queued', 'processing', 'completed', 'failed'],
      default: 'completed',
    },
    aiAnalysisEta: { type: String, default: '' },
    pdfGeneratedAt: { type: Date, default: null },

    isHardMode: { type: Boolean, default: false },

    // Phase 5: Official Paper Test fields
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficialPaper', default: null },
    paperYear: { type: Number, default: null },
    paperExamPhase: { type: String, default: null },
    paperSetCode: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

testAttemptSchema.index({ userId: 1, status: 1, createdAt: -1 });
testAttemptSchema.index({ userId: 1, subjectCode: 1, createdAt: -1 });
testAttemptSchema.index({ paperId: 1 });

const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);

export default TestAttempt;
