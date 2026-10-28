import mongoose from 'mongoose';

/**
 * Chapter Schema
 * Dynamic chapter list per Board + Class + Subject (+ optional Stream).
 * Stores syllabus phase cutoff, NCERT/board source text excerpt, and question counts.
 */
const chapterSchema = new mongoose.Schema(
  {
    boardCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    }, // e.g. 'bseb', 'cbse', 'ncert_default'
    classLevel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    }, // e.g. '10', '12', '9', '11'
    stream: {
      type: String,
      trim: true,
      default: null,
    }, // e.g. 'science_pcm', null for 9/10
    subjectCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    }, // e.g. 'sci', 'math', 'phy', 'chem'
    chapterNumber: {
      type: Number,
      required: true,
    }, // e.g. 1, 2, 3...
    title: {
      type: String,
      required: true,
      trim: true,
    }, // e.g. 'Chemical Reactions and Equations'
    hindiTitle: {
      type: String,
      trim: true,
      default: '',
    }, // e.g. 'रासायनिक अभिक्रियाएं एवं समीकरण'
    phaseCutoff: {
      type: String,
      default: 'annual', // 'quarterly', 'half_yearly', 'annual'
      trim: true,
    },
    sourceText: {
      type: String,
      default: '', // Chapter syllabus or NCERT textbook excerpt for strict AI generation
    },
    questionCount: {
      type: Number,
      default: 0,
    },
    verifiedQuestionCount: {
      type: Number,
      default: 0,
    },
    isLive: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup of a subject's chapters
chapterSchema.index({ boardCode: 1, classLevel: 1, subjectCode: 1, chapterNumber: 1 }, { unique: true });
chapterSchema.index({ boardCode: 1, classLevel: 1, subjectCode: 1, phaseCutoff: 1 });

const Chapter = mongoose.model('Chapter', chapterSchema);

export default Chapter;
