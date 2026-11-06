import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import BoardConfig from '../models/BoardConfig.js';
import { BOARD_SUBJECTIVE_ATTEMPT_LIMITS } from '../config/boardSubjectiveAttemptLimits.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const ATTEMPT_FIELDS = ['shortAttemptLimit', 'longAttemptLimit'];

async function migrateBoardAttemptLimits() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to run this targeted migration.');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  const configs = new Map();
  for (const [boardCode, expected] of Object.entries(BOARD_SUBJECTIVE_ATTEMPT_LIMITS)) {
    const config = await BoardConfig.findOne({ code: boardCode, isActive: true })
      .select('code paperPattern')
      .lean();
    if (!config) throw new Error(`Active board configuration not found: ${boardCode}`);

    for (const field of ['shortCount', 'longCount']) {
      if (Number(config.paperPattern?.[field]) !== expected[field]) {
        throw new Error(
          `${boardCode} ${field} is ${config.paperPattern?.[field]}; expected ${expected[field]}. No values were changed.`,
        );
      }
    }

    for (const field of ATTEMPT_FIELDS) {
      const currentValue = config.paperPattern?.[field];
      if (currentValue != null && Number(currentValue) !== expected[field]) {
        throw new Error(
          `${boardCode} ${field} is already ${currentValue}; expected ${expected[field]}. No values were changed.`,
        );
      }
    }
    configs.set(boardCode, config);
  }

  for (const [boardCode, expected] of Object.entries(BOARD_SUBJECTIVE_ATTEMPT_LIMITS)) {
    for (const field of ATTEMPT_FIELDS) {
      const currentValue = configs.get(boardCode).paperPattern?.[field];
      if (currentValue != null) continue;

      const result = await BoardConfig.updateOne(
        {
          code: boardCode,
          [`paperPattern.${field}`]: null,
        },
        { $set: { [`paperPattern.${field}`]: expected[field] } },
      );
      if (!result.matchedCount) {
        const latest = await BoardConfig.findOne({ code: boardCode })
          .select(`paperPattern.${field}`)
          .lean();
        if (Number(latest?.paperPattern?.[field]) !== expected[field]) {
          throw new Error(`Could not safely set ${boardCode} ${field}.`);
        }
      }
    }
  }

  for (const [boardCode, expected] of Object.entries(BOARD_SUBJECTIVE_ATTEMPT_LIMITS)) {
    const config = await BoardConfig.findOne({ code: boardCode })
      .select('paperPattern')
      .lean();
    for (const field of ATTEMPT_FIELDS) {
      if (Number(config?.paperPattern?.[field]) !== expected[field]) {
        throw new Error(`Post-migration verification failed for ${boardCode} ${field}.`);
      }
    }
    console.log(
      `${boardCode}: short ${expected.shortAttemptLimit}/${expected.shortCount}, long ${expected.longAttemptLimit}/${expected.longCount}`,
    );
  }
}

migrateBoardAttemptLimits()
  .catch((error) => {
    console.error('Board attempt-limit migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
