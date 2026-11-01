import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubjectiveSubmission from '../models/SubjectiveSubmission.js';
import OfficialPaper from '../models/OfficialPaper.js';
import Notification from '../models/Notification.js';
import User from '../models/user.js';
import { processPageOCR, evaluateSubmission, getSubmissionResult } from '../services/handwritingEvaluator.js';

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

async function getOrCreateTestUser() {
  let user = await User.findOne({ email: 'test_phase6@nexus.dev' }).lean();
  if (!user) {
    user = await User.create({
      name: 'Phase 6 Student',
      email: 'test_phase6@nexus.dev',
      phone: '9876543299',
      passwordHash: 'dummy_hash',
      salt: 'dummy_salt',
      role: 'student',
      studentProfile: {
        board: 'bseb',
        boardName: 'BSEB',
        classLevel: '10',
        medium: 'Hindi',
        selectedSubjects: [{ code: 'sci', name: 'Science' }],
        isProfileComplete: true,
      },
    });
    console.log('✓ Created test student for Phase 6');
  }
  return user;
}

async function runPhase6Verification() {
  await connectDB();
  const user = await getOrCreateTestUser();

  console.log('\n🧪 ===== PHASE 6 HANDWRITING EVALUATION VERIFICATION =====\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${message}`);
      failed++;
    }
  };

  try {
    // Test 1: Model Schema Creation
    console.log('\n📋 Test 1: Subjective Submission Model Creation');
    // 1x1 transparent PNG as base64 sample
    const sampleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const submission = await SubjectiveSubmission.create({
      userId: user._id,
      boardCode: 'bseb',
      classLevel: '10',
      subjectCode: 'sci',
      subjectName: 'Science (विज्ञान)',
      medium: 'Hindi',
      paperCode: 'BSEB-2023-Annual-SetA',
      year: 2023,
      examPhase: 'annual',
      setCode: 'A',
      pages: [
        {
          pageNumber: 1,
          imageBase64: sampleImageBase64,
          mimeType: 'image/png',
          processingStatus: 'pending',
        },
        {
          pageNumber: 2,
          imageBase64: sampleImageBase64,
          mimeType: 'image/png',
          processingStatus: 'completed',
          ocrText: 'प्रश्न 2: विस्थापन अभिक्रिया में अधिक क्रियाशील तत्व कम क्रियाशील तत्व को विस्थापित करता है। उदाहरण: Zn + CuSO4 -> ZnSO4 + Cu.',
          ocrConfidence: 92,
        },
      ],
      totalPages: 2,
      status: 'uploading',
    });

    assert(submission !== null, 'SubjectiveSubmission created successfully');
    assert(submission.totalPages === 2, 'Total pages match 2');
    assert(submission.status === 'uploading', 'Status starts at uploading');
    console.log(`   Submission ID: ${submission._id}`);

    // Test 2: OCR Page Processing
    console.log('\n📋 Test 2: OCR Page Processing');
    const ocrResult = await processPageOCR(submission._id, 1);
    assert(typeof ocrResult === 'string' && ocrResult.length > 0, 'Page 1 OCR generated text');

    const updatedSub = await SubjectiveSubmission.findById(submission._id);
    assert(updatedSub.pages[0].processingStatus === 'completed' || updatedSub.pages[0].processingStatus === 'failed', 'Page processing status updated');
    console.log(`   Page 1 OCR Status: ${updatedSub.pages[0].processingStatus}, Confidence: ${updatedSub.pages[0].ocrConfidence}%`);

    // Test 3: Full Evaluation Pipeline & Step Marking
    console.log('\n📋 Test 3: Full Rubric Evaluation Pipeline');
    const evaluated = await evaluateSubmission(submission._id);
    assert(evaluated.status === 'completed', 'Submission status marked completed');
    assert(evaluated.evaluations.length > 0, 'Question evaluations generated');
    assert(evaluated.totalMarks > 0, 'Total maximum marks computed');
    assert(typeof evaluated.obtainedMarks === 'number', 'Obtained marks awarded');
    assert(typeof evaluated.percentage === 'number', 'Percentage computed');
    assert(evaluated.overallFeedback.length > 0, 'Overall examiner feedback present');
    console.log(`   Score: ${evaluated.obtainedMarks}/${evaluated.totalMarks} (${evaluated.percentage}%)`);
    console.log(`   Evaluations count: ${evaluated.evaluations.length}`);

    // Test 4: Verify Question-wise Rubric Details
    console.log('\n📋 Test 4: Question Rubric & Step Marks Breakdown');
    const firstEval = evaluated.evaluations[0];
    assert(firstEval.questionNumber === 1, 'Question 1 evaluated');
    assert(Array.isArray(firstEval.keywordsCovered), 'Keywords covered array present');
    assert(Array.isArray(firstEval.stepMarksBreakdown), 'Step marks breakdown present');
    assert(firstEval.awardedMarks <= firstEval.maxMarks, 'Awarded marks do not exceed maximum');
    console.log(`   Q1 Awarded: ${firstEval.awardedMarks}/${firstEval.maxMarks}`);
    console.log(`   Keywords Covered: ${firstEval.keywordsCovered.join(', ') || 'Standard'}`);
    console.log(`   Examiner Feedback: ${firstEval.feedback}`);

    // Test 5: Verify In-App Notification Created
    console.log('\n📋 Test 5: Student In-App Notification Triggered');
    const notif = await Notification.findOne({
      userId: user._id,
      type: 'subjective_result',
    }).lean();
    assert(notif !== null, 'Notification created for evaluated answer copy');
    if (notif) {
      assert(notif.type === 'subjective_result', 'Notification type is subjective_result');
      assert(notif.link.includes(String(submission._id)), 'Notification links directly to copy review');
      console.log(`   Notification: "${notif.title}" -> ${notif.message}`);
    }

    // Test 6: Result Retrieval Service
    console.log('\n📋 Test 6: Result Retrieval Service');
    const resultDoc = await getSubmissionResult(submission._id, user._id);
    assert(resultDoc !== null, 'Result retrieved for student');
    assert(String(resultDoc._id) === String(submission._id), 'Correct submission retrieved');

    // Clean up test documents
    console.log('\n🧹 Cleaning up test submission...');
    await SubjectiveSubmission.findByIdAndDelete(submission._id);
    await Notification.deleteMany({ userId: user._id });
    console.log('✅ Cleanup complete');

  } catch (err) {
    console.error('\n❌ Test error:', err);
    failed++;
  }

  console.log('\n📊 ===== PHASE 6 VERIFICATION SUMMARY =====');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${passed / (passed + failed) * 100}%`);

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6Verification().catch(console.error);
