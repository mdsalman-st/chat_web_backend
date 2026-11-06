import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BoardConfig from '../models/BoardConfig.js';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env' });
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI missing in .env');
  process.exit(1);
}

async function connectDB() {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

/**
 * Board Blueprint Verification
 * 
 * This test validates that each configured board's paperPattern matches
 * the official board exam pattern for the current academic session.
 * 
 * IMPORTANT: The values in seedBoards.js are currently UNVERIFIED.
 * This test documents the verification status and will FAIL until
 * each pattern is confirmed against an official board source.
 * 
 * Official sources to check:
 * - BSEB: https://bseb.bihar.gov.in/ (Bihar Board official website)
 * - CBSE: https://cbse.gov.in/ (CBSE official website)
 * - UP Board: https://upmsp.edu.in/ (UP Board official website)
 * - NCERT: https://ncert.nic.in/ (NCERT official website)
 */

const VERIFICATION_STATUS = {
  // Format: boardCode: { verified: boolean, sourceUrl: string, verifiedDate: string, notes: string }
  bseb: {
    verified: false,
    sourceUrl: 'https://bseb.bihar.gov.in/',
    verifiedDate: null,
    notes: 'BSEB Class 10/12 annual exam pattern needs verification. Current seed: 100 MCQs with 50 attempted, 195 min, 30 short (attempt 15 × 2m), 8 long (attempt 4 × 5m), configured total 100 marks. Confirm every value against the current official model paper / marking scheme.',
  },
  cbse: {
    verified: false,
    sourceUrl: 'https://cbse.gov.in/',
    verifiedDate: null,
    notes: 'CBSE Class 10/12 pattern needs verification. Current seed: 20 MCQs, attempt 20, 180 min, 15 short (2m), 6 long (5m), total 80 marks. Verify against latest CBSE sample paper / marking scheme.',
  },
  up_board: {
    verified: false,
    sourceUrl: 'https://upmsp.edu.in/',
    verifiedDate: null,
    notes: 'UP Board Class 10/12 pattern needs verification. Current seed: 20 MCQs, attempt 20, 195 min, 10 short (2m), 5 long (6m), total 70 marks. Verify against latest UPMSP model paper.',
  },
  ncert_default: {
    verified: false,
    sourceUrl: 'https://ncert.nic.in/',
    verifiedDate: null,
    notes: 'NCERT default pattern is a fallback, not a real board exam. Current seed: 40 MCQs, attempt 40, 90 min, 10 short (2m), 4 long (5m), total 80 marks. This is a synthetic pattern for practice only.',
  },
};

async function verifyBoardBlueprints() {
  await connectDB();
  
  console.log('\n🧪 ===== BOARD BLUEPRINT VERIFICATION =====\n');
  
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  
  const assert = (condition, message) => {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${message}`);
      failed++;
    }
  };
  
  const warn = (message) => {
    console.log(`⚠️  WARN: ${message}`);
    warnings++;
  };
  
  try {
    // Fetch all active board configs
    const boards = await BoardConfig.find({ isActive: true }).lean();
    
    console.log(`Found ${boards.length} active board configurations:\n`);
    
    for (const board of boards) {
      console.log(`\n📋 Board: ${board.name} (${board.code})`);
      console.log(`   State: ${board.state}`);
      console.log(`   Phases: ${board.examPhases?.length || 0}`);
      console.log(`   Classes: ${board.classes?.length || 0}`);
      
      const pattern = board.paperPattern || {};
      console.log(`   Paper Pattern:`);
      console.log(`     - MCQ Count: ${pattern.mcqCount ?? 'NOT SET'}`);
      console.log(`     - Attempt Limit: ${pattern.attemptLimit ?? 'NOT SET'}`);
      console.log(`     - Marks per MCQ: ${pattern.marksPerMcq ?? 'NOT SET'}`);
      console.log(`     - Duration: ${pattern.durationMinutes ?? 'NOT SET'} minutes`);
      console.log(`     - Negative Marking: ${pattern.negativeMarking ?? 'NOT SET'}`);
      console.log(`     - Options Count: ${pattern.optionsCount ?? 'NOT SET'}`);
      console.log(`     - Short Answer: ${pattern.hasShortAnswer ? 'Yes' : 'No'} (${pattern.shortCount ?? 0} × ${pattern.shortMarks ?? 0}m)`);
      console.log(`     - Long Answer: ${pattern.hasLongAnswer ? 'Yes' : 'No'} (${pattern.longCount ?? 0} × ${pattern.longMarks ?? 0}m)`);
      console.log(`     - Total Marks: ${pattern.totalMarks ?? 'NOT SET'}`);
      console.log(`     - Scored Objective Marks: ${Math.min(pattern.mcqCount || 0, pattern.attemptLimit || 0) * (pattern.marksPerMcq || 0)}`);
      
      // Check verification status
      const verification = VERIFICATION_STATUS[board.code];
      if (verification) {
        if (verification.verified) {
          console.log(`   ✅ VERIFIED: ${verification.sourceUrl} (${verification.verifiedDate})`);
        } else {
          warn(`PATTERN NOT VERIFIED against official source: ${verification.sourceUrl}`);
          console.log(`   Notes: ${verification.notes}`);
        }
      } else {
        warn(`NO VERIFICATION RECORD for board: ${board.code}`);
      }
      
      // Validate required fields are present
      const requiredFields = ['mcqCount', 'attemptLimit', 'marksPerMcq', 'durationMinutes', 'totalMarks'];
      for (const field of requiredFields) {
        if (pattern[field] === undefined || pattern[field] === null) {
          warn(`Missing required pattern field: ${field}`);
        }
      }
      
      // Validate logical consistency
      if (pattern.mcqCount && pattern.attemptLimit && pattern.attemptLimit > pattern.mcqCount) {
        warn(`Attempt limit (${pattern.attemptLimit}) exceeds MCQ count (${pattern.mcqCount})`);
      }
      
      if (pattern.hasShortAnswer && (!pattern.shortCount || !pattern.shortMarks)) {
        warn('Short answer enabled but shortCount/shortMarks not set');
      }
      
      if (pattern.hasLongAnswer && (!pattern.longCount || !pattern.longMarks)) {
        warn('Long answer enabled but longCount/longMarks not set');
      }
      
      // Counts may describe offered questions; use attempt limits for scored marks.
      const shortLimitKnown = !pattern.hasShortAnswer || Number.isFinite(pattern.shortAttemptLimit);
      const longLimitKnown = !pattern.hasLongAnswer || Number.isFinite(pattern.longAttemptLimit);
      if (pattern.mcqCount && pattern.marksPerMcq && shortLimitKnown && longLimitKnown) {
        const calculatedTotal =
          (Math.min(pattern.mcqCount, pattern.attemptLimit) * pattern.marksPerMcq) +
          (pattern.hasShortAnswer ? pattern.shortAttemptLimit * pattern.shortMarks : 0) +
          (pattern.hasLongAnswer ? pattern.longAttemptLimit * pattern.longMarks : 0);
        if (pattern.totalMarks && calculatedTotal !== pattern.totalMarks) {
          warn(`Total marks mismatch: declared ${pattern.totalMarks}, calculated from attempted questions ${calculatedTotal}`);
        }
      } else {
        warn('Cannot verify total marks: short/long section attempt limits are not configured');
      }
      
      // Check exam phases
      if (board.examPhases && board.examPhases.length > 0) {
        console.log(`   Exam Phases:`);
        for (const phase of board.examPhases) {
          console.log(`     - ${phase.phaseId}: ${phase.name} (cutoff: ${phase.syllabusCutoffRatio}, month: ${phase.examMonth})`);
        }
      } else {
        warn('No exam phases defined');
      }
      
      // Check classes and subjects
      if (board.classes && board.classes.length > 0) {
        for (const cls of board.classes) {
          if (cls.hasStreams && cls.streams) {
            for (const stream of cls.streams) {
              console.log(`   Class ${cls.classLevel} / ${stream.streamId}: ${stream.subjects?.length || 0} subjects`);
            }
          } else {
            console.log(`   Class ${cls.classLevel}: ${cls.subjects?.length || 0} subjects`);
          }
        }
      } else {
        warn('No classes defined');
      }
    }
    
    // Summary
    console.log('\n📊 ===== VERIFICATION SUMMARY =====');
    console.log(`✅ Passed checks: ${passed}`);
    console.log(`❌ Failed checks: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    
    const unverifiedBoards = Object.entries(VERIFICATION_STATUS)
      .filter(([code, v]) => !v.verified)
      .map(([code]) => code);
    
    if (unverifiedBoards.length > 0) {
      console.log(`\n🔴 UNVERIFIED BOARDS: ${unverifiedBoards.join(', ')}`);
      console.log('   These boards cannot be used for official-style exam replicas until verified.');
      console.log('   Update VERIFICATION_STATUS in this file after checking official sources.');
    } else {
      console.log('\n🟢 ALL BOARDS VERIFIED');
    }
    
  } catch (err) {
    console.error('\n❌ Test error:', err);
    failed++;
  }
  
  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');
  
  if (failed > 0) {
    process.exit(1);
  }
}

verifyBoardBlueprints().catch(console.error);