import mongoose from 'mongoose';

/**
 * Question Schema
 * Stores both AI-generated chapter practice questions and official board paper questions.
 * SECURITY: correctOption and explanation have select: false by default
 * so they are NEVER leaked over the test taking API.
 */
const optionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // 'A', 'B', 'C', 'D'
    text: { type: String, required: true },
    hindiText: { type: String },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    hindiQuestionText: {
      type: String,
      trim: true,
    },
    options: {
      type: [optionSchema],
      validate: [val => val.length >= 2, 'At least 2 options required'],
    },
    correctOption: {
      type: String,
      required: true,
      trim: true,
      select: false, // Hidden by default from student mid-test
    },
    explanation: {
      type: String,
      default: '',
      select: false, // Hidden by default until test submission / analysis
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      default: 'Medium',
      index: true,
    },
    subtopic: {
      type: String,
      trim: true,
      default: '',
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
    chapterNumber: {
      type: Number,
      required: true,
      index: true,
    },
    chapterTitle: {
      type: String,
      default: '',
    },
    medium: {
      type: String,
      enum: ['Hindi', 'English'],
      default: 'Hindi',
      index: true,
    },
    type: {
      type: String,
      enum: ['mcq', 'short', 'long'],
      default: 'mcq',
    },
    marks: {
      type: Number,
      default: 1,
    },
    isAiGenerated: {
      type: Boolean,
      default: true,
    },
    sourceLabel: {
      type: String,
      default: 'AI-generated practice question',
    },
    status: {
      type: String,
      enum: ['verified', 'unverified', 'flagged', 'rejected'],
      default: 'verified',
      index: true,
    },
    verifiedBy: {
      type: String,
      default: 'dual-model-cross-check',
    },
    flagCount: {
      type: Number,
      default: 0,
      index: true,
    },
    flagThreshold: {
      type: Number,
      default: 3,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Fields for Phase 5 (Official Board Papers)
    year: { type: Number, default: null, index: true },
    examPhase: { type: String, default: null }, // e.g. 'annual', 'half_yearly'
    setCode: { type: String, default: null }, // e.g. 'A', 'B'
    isVVI: { type: Boolean, default: false },
    isMVVI: { type: Boolean, default: false },
    officialPaperSource: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

questionSchema.index({ boardCode: 1, classLevel: 1, subjectCode: 1, chapterNumber: 1, medium: 1, isActive: 1 });
questionSchema.index({ status: 1, flagCount: 1 });

const Question = mongoose.model('Question', questionSchema);

export default Question;
