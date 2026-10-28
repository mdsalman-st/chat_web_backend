import mongoose from 'mongoose';

/**
 * BoardConfig Schema
 * Dynamic board configuration for Nexus Student Test Module.
 * No board names, classes, subjects, exam phases or patterns are hardcoded.
 */
const examPhaseSchema = new mongoose.Schema(
  {
    phaseId: { type: String, required: true }, // e.g. 'quarterly', 'half_yearly', 'sent_up', 'annual'
    name: { type: String, required: true }, // e.g. 'Quarterly Exam', 'Annual Board Exam'
    hindiName: { type: String }, // e.g. 'त्रैमासिक परीक्षा', 'वार्षिक बोर्ड परीक्षा'
    syllabusCutoffRatio: { type: Number, default: 1.0 }, // 0.35, 0.70, 1.0 (proportion of syllabus)
    order: { type: Number, default: 1 },
    examMonth: { type: String }, // e.g. 'September', 'February'
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const subjectDefSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, // e.g. 'phy', 'chem', 'math', 'sci'
    name: { type: String, required: true }, // e.g. 'Physics', 'Science'
    hindiName: { type: String }, // e.g. 'भौतिक विज्ञान'
    icon: { type: String, default: '📚' }, // Emoji icon
    color: { type: String, default: '#06b6d4' },
    isElective: { type: Boolean, default: false },
    order: { type: Number, default: 1 },
  },
  { _id: false }
);

const streamDefSchema = new mongoose.Schema(
  {
    streamId: { type: String, required: true }, // e.g. 'science_pcm', 'science_pcb', 'commerce', 'arts'
    name: { type: String, required: true }, // e.g. 'Science (PCM)'
    hindiName: { type: String },
    subjects: [subjectDefSchema],
  },
  { _id: false }
);

const classDefSchema = new mongoose.Schema(
  {
    classLevel: { type: String, required: true }, // e.g. '9', '10', '11', '12'
    name: { type: String, required: true }, // e.g. 'Class 10'
    hindiName: { type: String },
    hasStreams: { type: Boolean, default: false },
    streams: [streamDefSchema], // For classes with streams (11, 12)
    subjects: [subjectDefSchema], // For classes without streams (9, 10)
    order: { type: Number, default: 1 },
  },
  { _id: false }
);

const paperPatternSchema = new mongoose.Schema(
  {
    mcqCount: { type: Number, default: 50 },
    attemptLimit: { type: Number, default: 50 }, // For boards like BSEB where student solves 50 out of 100
    marksPerMcq: { type: Number, default: 1 },
    durationMinutes: { type: Number, default: 90 },
    negativeMarking: { type: Number, default: 0 },
    optionsCount: { type: Number, default: 4 },
    hasShortAnswer: { type: Boolean, default: false },
    shortCount: { type: Number, default: 0 },
    shortMarks: { type: Number, default: 2 },
    hasLongAnswer: { type: Boolean, default: false },
    longCount: { type: Number, default: 0 },
    longMarks: { type: Number, default: 5 },
    totalMarks: { type: Number, default: 50 },
  },
  { _id: false }
);

const boardConfigSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    }, // e.g. 'bseb', 'cbse', 'up_board', 'ncert_default'
    name: {
      type: String,
      required: true,
      trim: true,
    }, // e.g. 'Bihar School Examination Board'
    shortName: {
      type: String,
      required: true,
      trim: true,
    }, // e.g. 'BSEB'
    hindiName: {
      type: String,
      trim: true,
    }, // e.g. 'बिहार विद्यालय परीक्षा समिति'
    state: {
      type: String,
      default: 'National',
    },
    supportedMediums: {
      type: [String],
      default: ['Hindi', 'English'],
    },
    hasSetCode: {
      type: Boolean,
      default: false,
    },
    setCodes: {
      type: [String],
      default: [], // e.g. ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    },
    answerKeyFormat: {
      type: String,
      enum: ['letters', 'numbers', 'fuzzy'],
      default: 'letters',
    },
    sourceCreditText: {
      type: String,
      default: 'Official Board Syllabus & NCERT Guidelines',
    },
    isFallback: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    examPhases: [examPhaseSchema],
    classes: [classDefSchema],
    paperPattern: {
      type: paperPatternSchema,
      default: () => ({}),
    },
    customSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

boardConfigSchema.index({ isActive: 1 });

const BoardConfig = mongoose.model('BoardConfig', boardConfigSchema);

export default BoardConfig;
