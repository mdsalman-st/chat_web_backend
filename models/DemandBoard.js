import mongoose from 'mongoose';

/**
 * DemandBoard Schema
 * When a student selects "Other" board and types a custom board name,
 * it is recorded here so administrators can see real student demand.
 */
const demandBoardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    requestedCount: {
      type: Number,
      default: 1,
    },
    students: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        email: String,
        classLevel: String,
        requestedAt: { type: Date, default: Date.now },
      },
    ],
    lastRequestedAt: {
      type: Date,
      default: Date.now,
    },
    isReviewed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const DemandBoard = mongoose.model('DemandBoard', demandBoardSchema);

export default DemandBoard;
