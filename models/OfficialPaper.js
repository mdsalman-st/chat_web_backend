import mongoose from 'mongoose';

/**
 * OfficialPaper Schema
 * Stores ingested official board papers (previous years' question papers)
 * with their official answer keys. The official key is the ONLY source of truth
 * for correct answers in full paper tests.
 */
const paperQuestionSchema = new mongoose.Schema(
  {
    questionNumber: { type: Number, required: true },
    // 👇 NAYA FIELD: Question Type (MCQ ya Subjective) 👇
    questionType: { 
      type: String, 
      enum: ['mcq', 'subjective'], 
      default: 'mcq' 
    },
    questionText: { type: String, required: true },
    hindiQuestionText: { type: String },
    // Options sirf MCQ ke liye honge
    options: [{
      key: { type: String, required: true },
      text: { type: String, required: true },
      hindiText: { type: String },
    }],
    // Correct option sirf MCQ ke liye hoga (isliye required: true hata diya)
    correctOption: { type: String }, 
    // 👇 NAYA FIELD: Subjective questions ke liye Official Model Answer 👇
    modelAnswer: { type: String, default: '' },
    hindiModelAnswer: { type: String, default: '' },
    
    marks: { type: Number, default: 1 },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    subtopic: { type: String, default: '' },
    chapterNumber: { type: Number },
    chapterTitle: { type: String },
  },
  { _id: false }
);

const officialPaperSchema = new mongoose.Schema(
  {
    // Board & Academic Info
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
    stream: {
      type: String,
      trim: true,
      default: null,
    },
    subjectCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subjectName: { type: String, required: true },
    medium: {
      type: String,
      enum: ['Hindi', 'English'],
      default: 'Hindi',
      index: true,
    },

    // Paper Identification
    year: { type: Number, required: true, index: true },
    examPhase: { type: String, required: true, index: true }, // 'quarterly', 'half_yearly', 'sent_up', 'annual'
    setCode: { type: String, default: null, index: true }, // e.g. 'A', 'B', 'C' for BSEB
    paperCode: { type: String, default: '' }, // e.g. 'BSEB-2023-Annual-SetA'

    // Questions from the paper
    questions: [paperQuestionSchema],
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },

    // Source & Attribution
    sourceUrl: { type: String, default: '' },
    sourceCreditText: { type: String, default: '' },
    officialKeyUrl: { type: String, default: '' },

    // ==========================================
    // NEW FIELDS FOR PDF UPLOAD & AI EXTRACTION
    // ==========================================
    fileUrl: { 
      type: String, 
      default: '' 
    },
    originalName: { 
      type: String, 
      default: '' 
    },
    fileSize: { 
      type: Number 
    },
    mimeType: { 
      type: String 
    },
    // AI isko use karega test generate karne ke liye
    extractedText: { 
      type: String, 
      default: '' 
    },
    // ==========================================

    // Ingestion Status
    status: {
      type: String,
      enum: ['draft', 'ingested', 'matched', 'published', 'archived'],
      default: 'draft',
      index: true,
    },

    // Matching Results (Phase 5)
    matchedQuestionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    matchStats: {
      totalQuestions: { type: Number, default: 0 },
      matchedCount: { type: Number, default: 0 },
      highConfidenceCount: { type: Number, default: 0 },
      lowConfidenceCount: { type: Number, default: 0 },
      pendingReviewCount: { type: Number, default: 0 },
    },

    // MVVI/VVI Tags (calculated deterministically)
    mvviTags: [{
      questionNumber: { type: Number },
      tag: { type: String, enum: ['MVVI', 'VVI'] },
      reason: { type: String }, // e.g. "Asked 3+ times in last 5 years"
      frequency: { type: Number },
      years: [{ type: Number }],
    }],

    // Metadata
    ingestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ingestedAt: { type: Date, default: Date.now },
    publishedAt: { type: Date, default: null },
    lastMatchedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

officialPaperSchema.index({ boardCode: 1, classLevel: 1, subjectCode: 1, year: 1, examPhase: 1, setCode: 1 });
officialPaperSchema.index({ status: 1, year: -1 });

const OfficialPaper = mongoose.model('OfficialPaper', officialPaperSchema);

export default OfficialPaper;