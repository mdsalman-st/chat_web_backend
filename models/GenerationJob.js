import mongoose from 'mongoose';

/**
 * GenerationJob Schema
 * Ensures that if 50 students open a chapter without questions at the same moment,
 * only 1 background generation job runs (deduplicated by jobKey).
 */
const generationJobSchema = new mongoose.Schema(
  {
    jobKey: {
      type: String,
      required: true,
      unique: true, // e.g. 'bseb_10_sci_1_hindi_normal'
    },
    boardCode: { type: String, required: true },
    classLevel: { type: String, required: true },
    stream: { type: String, default: null },
    subjectCode: { type: String, required: true },
    chapterNumber: { type: Number, required: true },
    medium: { type: String, default: 'Hindi' },
    isHardMode: { type: Boolean, default: false },
    generationMode: {
      type: String,
      enum: ['board_exam', 'mcq_practice'],
      default: 'board_exam',
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    generationStage: {
      type: String,
      enum: ['mcq', 'short', 'long', 'completed'],
      default: 'mcq',
    },
    progressPercent: { type: Number, default: 0 },
    progressMessage: { type: String, default: 'Preparing chapter syllabus…' },
    generatedCount: { type: Number, default: 0 },
    verifiedCount: { type: Number, default: 0 },
    targetCount: { type: Number, default: 10 },
    marksPerMcq: { type: Number, default: 1 },
    verifiedShortCount: { type: Number, default: 0 },
    targetShortCount: { type: Number, default: 0 },
    shortMarks: { type: Number, default: 2 },
    verifiedLongCount: { type: Number, default: 0 },
    targetLongCount: { type: Number, default: 0 },
    longMarks: { type: Number, default: 5 },
    workerLeaseUntil: { type: Date, default: null, index: true },
    automaticRetryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date, default: null, index: true },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

generationJobSchema.index({ status: 1, createdAt: -1 });

const GenerationJob = mongoose.model('GenerationJob', generationJobSchema);

export default GenerationJob;
