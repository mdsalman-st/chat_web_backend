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
    subjectCode: { type: String, required: true },
    chapterNumber: { type: Number, required: true },
    medium: { type: String, default: 'Hindi' },
    isHardMode: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    progressPercent: { type: Number, default: 0 },
    progressMessage: { type: String, default: 'Preparing chapter syllabus…' },
    generatedCount: { type: Number, default: 0 },
    verifiedCount: { type: Number, default: 0 },
    targetCount: { type: Number, default: 10 },
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
