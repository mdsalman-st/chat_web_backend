import mongoose from 'mongoose';

/**
 * QuestionFlag Schema
 * Records student reports of wrong questions, ambiguities or out-of-syllabus errors.
 * Automatically disables question when flag threshold is crossed.
 */
const questionFlagSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: ['wrong_answer', 'ambiguous_options', 'out_of_syllabus', 'typo_translation', 'other'],
      default: 'wrong_answer',
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'dismissed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

questionFlagSchema.index({ questionId: 1, userId: 1 }, { unique: true });

const QuestionFlag = mongoose.model('QuestionFlag', questionFlagSchema);

export default QuestionFlag;
