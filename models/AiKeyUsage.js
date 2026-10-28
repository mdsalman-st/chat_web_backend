import mongoose from 'mongoose';

/**
 * AiKeyUsage Schema
 * Tracks per-key daily requests, rate-limit hits, and errors.
 */
const aiKeyUsageSchema = new mongoose.Schema(
  {
    keyIdentifier: {
      type: String,
      required: true,
      index: true, // 'gemini_1', 'gemini_2', 'gemini_3', 'groq'
    },
    date: {
      type: String,
      required: true,
      index: true, // 'YYYY-MM-DD'
    },
    requestCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    rateLimitCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

aiKeyUsageSchema.index({ keyIdentifier: 1, date: 1 }, { unique: true });

const AiKeyUsage = mongoose.model('AiKeyUsage', aiKeyUsageSchema);

export default AiKeyUsage;
