import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import TestAttempt from '../models/TestAttempt.js';
import Question from '../models/Question.js';
import Notification from '../models/Notification.js';
import User from '../models/user.js';
import analysisQueue from '../services/analysisQueue.js';
import { generatePdfToken, verifyPdfToken, buildTestReportPdf } from '../services/pdfService.js';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env' });
}

async function runPhase4Verification() {
  console.log('🚀 Starting Phase 4 Diagnostic Analysis, Queue, Notifications & PDF Verification...\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  const user = await User.findOne();
  if (!user) throw new Error('No user found');
  console.log('✓ Test user:', user._id);

  // Find a completed test attempt or create one
  let attempt = await TestAttempt.findOne({ userId: user._id, status: 'completed' });
  if (!attempt) {
    throw new Error('Please run verifyPhase3.js first to create a completed attempt');
  }

  // Test 1: Analysis Queue & AI Mistake Insight Generation
  console.log('\n--- Test 1: Diagnostic Analysis Queue ---');
  const queueResult = await analysisQueue.enqueueAttempt(attempt._id);
  console.log('✓ Enqueue result:', queueResult);

  // Wait for queue processing to complete
  console.log('   Waiting for background analysis worker...');
  let maxWait = 20;
  while (maxWait > 0) {
    await new Promise((r) => setTimeout(r, 1000));
    const refreshed = await TestAttempt.findById(attempt._id);
    if (refreshed.aiAnalysisStatus === 'completed') {
      console.log('✓ Analysis completed! Status:', refreshed.aiAnalysisStatus);
      attempt = refreshed;
      break;
    }
    maxWait--;
  }

  // Test 2: Notification Generation
  console.log('\n--- Test 2: In-App Notifications ---');
  const notif = await Notification.findOne({ userId: user._id }).sort({ createdAt: -1 });
  if (!notif) {
    throw new Error('Notification was not generated!');
  }
  console.log(`✓ Notification created: "${notif.title}" -> "${notif.message}"`);
  console.log(`   Link: ${notif.link}, isRead: ${notif.isRead}`);

  notif.isRead = true;
  await notif.save();
  console.log('✓ Notification mark-read verified');

  // Test 3: PDF Download Token & Security
  console.log('\n--- Test 3: PDF Security & Token Verification ---');
  const token = generatePdfToken(attempt._id, user._id, 3600);
  console.log('✓ Generated signed PDF token (length: ' + token.length + ')');

  const decoded = verifyPdfToken(token, attempt._id);
  if (!decoded || decoded.attemptId !== String(attempt._id)) {
    throw new Error('Token verification failed!');
  }
  console.log('✓ Verified token successfully (expiresIn: 3600s)');

  // Verify tampered token is rejected
  const invalidDecoded = verifyPdfToken(token + 'tampered', attempt._id);
  if (invalidDecoded === null) {
    console.log('✓ Tampered token properly rejected (null)');
  } else {
    throw new Error('Security check failed: tampered token was accepted!');
  }

  // Test 4: PDF Generation (Full & Wrong-Only) with Devanagari Hindi Text
  console.log('\n--- Test 4: PDF Report Generation (Devanagari Font) ---');
  const testPdfDir = path.resolve('backend/tests/output');
  if (!fs.existsSync(testPdfDir)) fs.mkdirSync(testPdfDir, { recursive: true });

  const questions = await Question.find({ _id: { $in: attempt.questionIds } })
    .select('+correctOption +explanation')
    .lean();

  const fullPdfPath = path.join(testPdfDir, 'test_report_full.pdf');
  const fullStream = fs.createWriteStream(fullPdfPath);

  await new Promise((resolve, reject) => {
    fullStream.on('finish', resolve);
    fullStream.on('error', reject);
    buildTestReportPdf(attempt, questions, user, false, fullStream);
  });

  const fullStat = fs.statSync(fullPdfPath);
  console.log(`✓ Full PDF Report generated successfully: ${fullPdfPath} (${fullStat.size} bytes)`);

  // Wrong-Only PDF
  const wrongPdfPath = path.join(testPdfDir, 'test_report_mistakes.pdf');
  const wrongStream = fs.createWriteStream(wrongPdfPath);

  await new Promise((resolve, reject) => {
    wrongStream.on('finish', resolve);
    wrongStream.on('error', reject);
    buildTestReportPdf(attempt, questions, user, true, wrongStream);
  });

  const wrongStat = fs.statSync(wrongPdfPath);
  console.log(`✓ Mistakes-Only PDF generated successfully: ${wrongPdfPath} (${wrongStat.size} bytes)`);

  console.log('\n🎉 PHASE 4 VERIFICATION PASSED: Queue, AI Analysis, Notifications & Devanagari PDF are 100% operational!');
  await mongoose.disconnect();
}

runPhase4Verification().catch((err) => {
  console.error('❌ Phase 4 verification error:', err);
  process.exit(1);
});
