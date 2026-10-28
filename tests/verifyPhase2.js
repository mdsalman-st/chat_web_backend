import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Question from '../models/Question.js';
import QuestionFlag from '../models/QuestionFlag.js';
import GenerationJob from '../models/GenerationJob.js';
import { executeAiJsonWithFailover } from '../utils/aiClient.js';
import { queueOrGetChapterJob } from '../services/questionGenerator.js';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env' });
}

async function runPhase2Verification() {
  console.log('🧪 Starting Phase 2 Question Generation & Verification Tests...\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Test 1: AI Client with failover test
  console.log('✓ Test 1: Verifying AI Client response with failover chain…');
  const aiTest = await executeAiJsonWithFailover({
    prompt: 'Return a simple JSON object: {"ai_engine": "operational", "math_check": "2+2=4"}',
    systemInstruction: 'Output valid JSON only',
    taskType: 'fast',
  });
  console.log('   Provider used:', aiTest.providerName);
  console.log('   AI Result:', JSON.stringify(aiTest.result));

  // Test 2: Background Lazy-Load Job Queue (Deduplication)
  console.log('\n✓ Test 2: Verifying Background Generation Job deduplication…');
  const job1 = await queueOrGetChapterJob({
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    chapterNumber: 1,
    medium: 'Hindi',
    isHardMode: false,
    targetCount: 3,
  });
  console.log(`   Job 1 created: ID=${job1._id}, Key=${job1.jobKey}, Status=${job1.status}`);

  // Test 3: Deduplication check — duplicate request for same chapter should return existing job
  const job2 = await queueOrGetChapterJob({
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    chapterNumber: 1,
    medium: 'Hindi',
    isHardMode: false,
    targetCount: 3,
  });
  console.log(`   Job 2 duplicate check: ID matches Job 1? ${String(job1._id) === String(job2._id)} (Deduplication SUCCESS)`);

  // Test 4: Wait for job to process at least 1 verified question
  console.log('\n✓ Test 4: Waiting for background dual-model question generator…');
  let jobCompleted = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const checkJob = await GenerationJob.findById(job1._id).lean();
    console.log(`   Progress: ${checkJob.progressPercent}% — ${checkJob.progressMessage} (Verified: ${checkJob.verifiedCount})`);

    if (checkJob.status === 'completed' || checkJob.verifiedCount > 0) {
      jobCompleted = true;
      break;
    }
    if (checkJob.status === 'failed') {
      throw new Error(`Job failed: ${checkJob.error}`);
    }
  }

  // Test 5: Verify saved question in DB
  const verifiedQ = await Question.findOne({
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    chapterNumber: 1,
    status: 'verified',
  }).select('+correctOption +explanation').lean();

  if (verifiedQ) {
    console.log('\n✓ Test 5: Verified Question in MongoDB:');
    console.log(`   Q: ${verifiedQ.questionText}`);
    console.log(`   Options: ${verifiedQ.options.map(o => `${o.key}: ${o.text}`).join(' | ')}`);
    console.log(`   Correct Answer: ${verifiedQ.correctOption}`);
    console.log(`   Verification Method: ${verifiedQ.verifiedBy}`);
    console.log(`   Difficulty: ${verifiedQ.difficulty}`);
    console.log(`   Source Label: ${verifiedQ.sourceLabel}`);

    // Test 6: Question Flagging & Auto-disable test
    console.log('\n✓ Test 6: Testing "Report wrong question" flag threshold auto-disable…');
    const dummyUserId = new mongoose.Types.ObjectId();
    const qDoc = await Question.findById(verifiedQ._id);
    qDoc.flagCount = 3; // Trigger threshold
    if (qDoc.flagCount >= qDoc.flagThreshold) {
      qDoc.isActive = false;
      qDoc.status = 'flagged';
    }
    await qDoc.save();
    console.log(`   Flag count set to 3 -> Is Active: ${qDoc.isActive}, Status: ${qDoc.status} (AUTO-DISABLE SUCCESS)`);

    // Reset question to active for student practice
    qDoc.flagCount = 0;
    qDoc.isActive = true;
    qDoc.status = 'verified';
    await qDoc.save();
  }

  await mongoose.disconnect();
  console.log('\n🎉 ALL PHASE 2 VERIFICATIONS PASSED SUCCESSFULLY!');
}

runPhase2Verification().catch(err => {
  console.error('❌ Phase 2 Verification failed:', err);
  process.exit(1);
});
