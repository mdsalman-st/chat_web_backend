import Question from '../models/Question.js';

let lastRunDate = null;

/**
 * Remove legacy blind TTL index from MongoDB Atlas if it exists
 * This prevents MongoDB from automatically deleting questions after 7 days.
 */
export async function dropLegacyTtlIndex() {
  try {
    const indexes = await Question.collection.indexes();
    const ttlIndex = indexes.find(
      (idx) => idx.name === 'createdAt_1' || (idx.expireAfterSeconds !== undefined && idx.key?.createdAt)
    );
    if (ttlIndex) {
      await Question.collection.dropIndex(ttlIndex.name);
      console.log(`[SmartCleaner] Dropped legacy TTL index '${ttlIndex.name}'. Questions are now preserved based on demand.`);
    }
  } catch (err) {
    // Index may already be gone or collection not yet initialized
    if (err.codeName !== 'IndexNotFound') {
      console.warn('[SmartCleaner] Legacy index drop check:', err.message);
    }
  }
}

/**
 * Smart Demand-Based Cleanup:
 * - SAFE: Official board paper questions (PYQ) are NEVER touched.
 * - SAFE: High-demand questions (keepForever === true or attemptCount >= 2) are NEVER deleted.
 * - SAFE: Any questions used within the last 30 days are preserved.
 * - PURGED: Only completely abandoned AI questions (attemptCount === 0, older than 14 days)
 *   or stale unused questions (attemptCount === 1, not accessed in 60+ days).
 */
export async function runSmartQuestionCleanup() {
  try {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const filter = {
      isAiGenerated: true,
      year: null,
      keepForever: { $ne: true },
      $or: [
        // Condition 1: 0 attempts and older than 14 days
        {
          attemptCount: { $lte: 0 },
          createdAt: { $lt: fourteenDaysAgo },
        },
        // Condition 2: Only 1 attempt and abandoned for over 60 days
        {
          attemptCount: 1,
          lastAccessedAt: { $lt: sixtyDaysAgo },
        },
      ],
    };

    // Safe batch delete (limit to 300 per run to prevent DB lock)
    const candidates = await Question.find(filter).select('_id').limit(300).lean();
    if (candidates.length === 0) {
      console.log('[SmartCleaner] Off-peak scan completed: All existing questions have healthy student demand.');
      return { deletedCount: 0 };
    }

    const idsToDelete = candidates.map((c) => c._id);
    const deleteResult = await Question.deleteMany({ _id: { $in: idsToDelete } });

    console.log(`[SmartCleaner] Off-peak cleanup: Safely purged ${deleteResult.deletedCount} zero-demand questions. Popular chapter questions preserved.`);
    return { deletedCount: deleteResult.deletedCount };
  } catch (err) {
    console.error('[SmartCleaner] Error during smart cleanup:', err);
    return { error: err.message };
  }
}

/**
 * Starts the background off-peak cleaner loop.
 * Runs check every 30 minutes. Executes cleanup between 03:00 AM and 04:30 AM IST.
 */
export function initSmartQuestionCleaner() {
  // Check index on startup
  dropLegacyTtlIndex();

  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check every 30 minutes

  setInterval(async () => {
    try {
      // Get current hour and date in Indian Standard Time (IST = UTC+5:30)
      const now = new Date();
      const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const istHour = istTime.getUTCHours();
      const istDateStr = istTime.toISOString().slice(0, 10);

      // Off-peak window: between 03:00 AM and 04:30 AM IST
      const isOffPeakHour = istHour >= 3 && istHour < 5;

      if (isOffPeakHour && lastRunDate !== istDateStr) {
        lastRunDate = istDateStr;
        console.log(`[SmartCleaner] Off-peak window detected (${istTime.toISOString()}). Initiating demand-based cleanup...`);
        await runSmartQuestionCleanup();
      }
    } catch (err) {
      console.error('[SmartCleaner] Scheduler tick error:', err);
    }
  }, CHECK_INTERVAL_MS);

  console.log('[SmartCleaner] Initialized: Off-peak cleanup scheduled daily at 03:30 AM IST.');
}
