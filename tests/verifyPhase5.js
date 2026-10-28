import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BoardConfig from '../models/BoardConfig.js';
import OfficialPaper from '../models/OfficialPaper.js';
import Question from '../models/Question.js';
import User from '../models/user.js';
import {
  ingestOfficialPaper,
  matchPaperQuestions,
  calculateMvviVviTags,
  applyMvviVviTags,
  getAvailablePapers,
  getPaperForTest,
  getPaperWithAnswers,
} from '../services/paperIngestion.js';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env' });
}

// Use the same connection logic as the main app
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

async function getTestUser() {
  let user = await User.findOne({ email: 'test@nexus.dev' }).lean();
  if (!user) {
    user = await User.create({
      name: 'Test Student',
      email: 'test@nexus.dev',
      phone: '9876543210',
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
    console.log('✅ Created test user');
  }
  return user;
}

async function getAdminUser() {
  let user = await User.findOne({ email: 'admin@nexus.dev' }).lean();
  if (!user) {
    user = await User.create({
      name: 'Admin User',
      email: 'admin@nexus.dev',
      phone: '9876543210',
      passwordHash: 'dummy_hash',
      salt: 'dummy_salt',
      role: 'admin',
    });
    console.log('✅ Created admin user');
  }
  return user;
}

async function testPhase5() {
  await connectDB();
  
  const student = await getTestUser();
  const admin = await getAdminUser();
  
  console.log('\n🧪 ===== PHASE 5 VERIFICATION STARTED =====\n');
  
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
    // Test 1: Verify BSEB board config exists with set codes
    console.log('\n📋 Test 1: Board Configuration');
    const bsebConfig = await BoardConfig.findOne({ code: 'bseb', isActive: true }).lean();
    assert(bsebConfig !== null, 'BSEB board config exists');
    assert(bsebConfig.hasSetCode === true, 'BSEB has set codes enabled');
    assert(bsebConfig.setCodes.length === 10, 'BSEB has 10 set codes (A-J)');
    assert(bsebConfig.examPhases.length === 4, 'BSEB has 4 exam phases');
    
    // Test 2: Ingest an official paper
    console.log('\n📋 Test 2: Paper Ingestion');
    const paperData = {
      boardCode: 'bseb',
      classLevel: '10',
      subjectCode: 'sci',
      subjectName: 'Science',
      medium: 'Hindi',
      year: 2023,
      examPhase: 'annual',
      setCode: 'A',
      questions: [
        {
          questionNumber: 1,
          questionText: 'Which of the following is a chemical change?',
          hindiQuestionText: 'निम्नलिखित में से कौन सा रासायनिक परिवर्तन है?',
          options: [
            { key: 'A', text: 'Melting of ice', hindiText: 'बर्फ का पिघलना' },
            { key: 'B', text: 'Burning of magnesium ribbon', hindiText: 'मैग्नीशियम रिबन का जलना' },
            { key: 'C', text: 'Dissolving sugar in water', hindiText: 'पानी में चीनी घोलना' },
            { key: 'D', text: 'Evaporation of water', hindiText: 'पानी का वाष्पीकरण' },
          ],
          correctOption: 'B',
          marks: 1,
          difficulty: 'Easy',
          subtopic: 'Chemical Reactions',
          chapterNumber: 1,
          chapterTitle: 'Chemical Reactions and Equations',
        },
        {
          questionNumber: 2,
          questionText: 'The chemical formula of rust is:',
          hindiQuestionText: 'जंग का रासायनिक सूत्र है:',
          options: [
            { key: 'A', text: 'FeO', hindiText: 'FeO' },
            { key: 'B', text: 'Fe2O3', hindiText: 'Fe2O3' },
            { key: 'C', text: 'Fe3O4', hindiText: 'Fe3O4' },
            { key: 'D', text: 'Fe2O3·xH2O', hindiText: 'Fe2O3·xH2O' },
          ],
          correctOption: 'D',
          marks: 1,
          difficulty: 'Medium',
          subtopic: 'Chemical Reactions',
          chapterNumber: 1,
          chapterTitle: 'Chemical Reactions and Equations',
        },
        {
          questionNumber: 3,
          questionText: 'What is the pH of a neutral solution at 25°C?',
          hindiQuestionText: '25°C पर एक उदासीन विलयन का pH क्या होता है?',
          options: [
            { key: 'A', text: '0', hindiText: '0' },
            { key: 'B', text: '7', hindiText: '7' },
            { key: 'C', text: '14', hindiText: '14' },
            { key: 'D', text: '1', hindiText: '1' },
          ],
          correctOption: 'B',
          marks: 1,
          difficulty: 'Easy',
          subtopic: 'Acids, Bases and Salts',
          chapterNumber: 2,
          chapterTitle: 'Acids, Bases and Salts',
        },
      ],
      sourceUrl: 'https://bseb.bihar.gov.in/papers/2023-science-setA.pdf',
      sourceCreditText: 'Bihar School Examination Board Official Question Papers',
      officialKeyUrl: 'https://bseb.bihar.gov.in/keys/2023-science-setA-key.pdf',
      ingestedBy: admin._id,
    };
    
    const paper = await ingestOfficialPaper(paperData);
    assert(paper !== null, 'Paper ingested successfully');
    assert(paper.paperCode === 'BSEB-2023-Annual-SetA', 'Paper code generated correctly');
    assert(paper.totalQuestions === 3, 'Total questions count correct');
    assert(paper.status === 'ingested', 'Paper status is ingested');
    console.log(`   Paper ID: ${paper._id}`);
    
    // Test 3: Match paper questions with existing question bank
    console.log('\n📋 Test 3: Question Matching');
    const matchResults = await matchPaperQuestions(paper._id);
    assert(matchResults !== null, 'Matching completed');
    assert(matchResults.totalQuestions === 3, 'All questions processed');
    console.log(`   Matched: ${matchResults.matchedCount}, High Confidence: ${matchResults.highConfidenceCount}, Low Confidence: ${matchResults.lowConfidenceCount}, Pending Review: ${matchResults.pendingReviewCount}`);
    
    // Test 4: Apply MVVI/VVI tags
    console.log('\n📋 Test 4: MVVI/VVI Tag Calculation');
    const tagResult = await applyMvviVviTags(paper._id);
    assert(tagResult !== null, 'Tags applied');
    console.log(`   Tags applied: ${tagResult.tagsApplied}`);
    
    // Test 5: Get available papers for student
    console.log('\n📋 Test 5: Available Papers for Student');
    const availablePapers = await getAvailablePapers({
      boardCode: 'bseb',
      classLevel: '10',
      subjectCode: 'sci',
      medium: 'Hindi',
    });
    assert(Array.isArray(availablePapers), 'Returns array of papers');
    assert(availablePapers.length > 0, 'At least one paper available');
    const availablePaper = availablePapers[0];
    assert(availablePaper.paperCode === 'BSEB-2023-Annual-SetA', 'Correct paper returned');
    console.log(`   Available papers: ${availablePapers.length}`);
    
    // Test 6: Get paper for test taking (no answers)
    console.log('\n📋 Test 6: Paper for Test Taking');
    const testPaper = await getPaperForTest(paper._id);
    assert(testPaper !== null, 'Paper retrieved for test');
    assert(testPaper.questions.length === 3, 'All questions present');
    assert(testPaper.questions[0].correctOption === undefined, 'Correct option hidden from student');
    assert(testPaper.questions[0].options.length === 4, 'Options present');
    console.log(`   Questions for test: ${testPaper.questions.length}`);
    
    // Test 7: Get paper with answers (for review)
    console.log('\n📋 Test 7: Paper with Official Answers');
    const answerPaper = await getPaperWithAnswers(paper._id);
    assert(answerPaper !== null, 'Paper with answers retrieved');
    assert(answerPaper.questions[0].correctOption === 'B', 'Official answer key exposed');
    assert(answerPaper.questions[1].correctOption === 'D', 'Second question answer correct');
    assert(answerPaper.questions[2].correctOption === 'B', 'Third question answer correct');
    console.log(`   Official answers exposed for review`);
    
    // Test 8: MVVI/VVI Analysis
    console.log('\n📋 Test 8: MVVI/VVI Analysis');
    const mvviAnalysis = await calculateMvviVviTags('bseb', '10', 'sci');
    assert(Array.isArray(mvviAnalysis), 'Returns array of tags');
    console.log(`   Total tagged questions: ${mvviAnalysis.length}`);
    const mvviCount = mvviAnalysis.filter(t => t.tag === 'MVVI').length;
    const vviCount = mvviAnalysis.filter(t => t.tag === 'VVI').length;
    console.log(`   MVVI: ${mvviCount}, VVI: ${vviCount}`);
    
    // Test 9: Ingest another paper for frequency analysis (same questions different year)
    console.log('\n📋 Test 9: Multi-Year Frequency Analysis');
    const paperData2022 = {
      ...paperData,
      year: 2022,
      setCode: 'B',
      questions: [
        {
          questionNumber: 1,
          questionText: 'Which of the following is a chemical change?', // Same as 2023 Q1
          hindiQuestionText: 'निम्नलिखित में से कौन सा रासायनिक परिवर्तन है?',
          options: [
            { key: 'A', text: 'Melting of ice', hindiText: 'बर्फ का पिघलना' },
            { key: 'B', text: 'Burning of magnesium ribbon', hindiText: 'मैग्नीशियम रिबन का जलना' },
            { key: 'C', text: 'Dissolving sugar in water', hindiText: 'पानी में चीनी घोलना' },
            { key: 'D', text: 'Evaporation of water', hindiText: 'पानी का वाष्पीकरण' },
          ],
          correctOption: 'B',
          marks: 1,
          difficulty: 'Easy',
          subtopic: 'Chemical Reactions',
          chapterNumber: 1,
          chapterTitle: 'Chemical Reactions and Equations',
        },
        {
          questionNumber: 2,
          questionText: 'The chemical formula of rust is:', // Same as 2023 Q2
          hindiQuestionText: 'जंग का रासायनिक सूत्र है:',
          options: [
            { key: 'A', text: 'FeO', hindiText: 'FeO' },
            { key: 'B', text: 'Fe2O3', hindiText: 'Fe2O3' },
            { key: 'C', text: 'Fe3O4', hindiText: 'Fe3O4' },
            { key: 'D', text: 'Fe2O3·xH2O', hindiText: 'Fe2O3·xH2O' },
          ],
          correctOption: 'D',
          marks: 1,
          difficulty: 'Medium',
          subtopic: 'Chemical Reactions',
          chapterNumber: 1,
          chapterTitle: 'Chemical Reactions and Equations',
        },
      ],
    };
    
    const paper2022 = await ingestOfficialPaper(paperData2022);
    await matchPaperQuestions(paper2022._id);
    await applyMvviVviTags(paper2022._id);
    
    // Now check MVVI tags - should have 2 questions asked 2 times (VVI)
    const mvviAnalysis2 = await calculateMvviVviTags('bseb', '10', 'sci');
    const vviQuestions = mvviAnalysis2.filter(t => t.tag === 'VVI');
    assert(vviQuestions.length >= 2, 'Questions asked 2 times tagged as VVI');
    console.log(`   VVI questions after 2 years: ${vviQuestions.length}`);
    
    // Test 10: Ingest third year for MVVI
    console.log('\n📋 Test 10: MVVI Tag (3+ occurrences)');
    const paperData2021 = {
      ...paperData,
      year: 2021,
      setCode: 'C',
      questions: [
        {
          questionNumber: 1,
          questionText: 'Which of the following is a chemical change?', // Same question 3rd time
          hindiQuestionText: 'निम्नलिखित में से कौन सा रासायनिक परिवर्तन है?',
          options: [
            { key: 'A', text: 'Melting of ice', hindiText: 'बर्फ का पिघलना' },
            { key: 'B', text: 'Burning of magnesium ribbon', hindiText: 'मैग्नीशियम रिबन का जलना' },
            { key: 'C', text: 'Dissolving sugar in water', hindiText: 'पानी में चीनी घोलना' },
            { key: 'D', text: 'Evaporation of water', hindiText: 'पानी का वाष्पीकरण' },
          ],
          correctOption: 'B',
          marks: 1,
          difficulty: 'Easy',
          subtopic: 'Chemical Reactions',
          chapterNumber: 1,
          chapterTitle: 'Chemical Reactions and Equations',
        },
      ],
    };
    
    const paper2021 = await ingestOfficialPaper(paperData2021);
    await matchPaperQuestions(paper2021._id);
    await applyMvviVviTags(paper2021._id);
    
    const mvviAnalysis3 = await calculateMvviVviTags('bseb', '10', 'sci');
    const mvviQuestions = mvviAnalysis3.filter(t => t.tag === 'MVVI');
    assert(mvviQuestions.length >= 1, 'Question asked 3 times tagged as MVVI');
    console.log(`   MVVI questions after 3 years: ${mvviQuestions.length}`);
    if (mvviQuestions.length > 0) {
      console.log(`   MVVI reason: ${mvviQuestions[0].reason}`);
    }
    
    // Test 11: Exam phase cutoff - only past phases available
    console.log('\n📋 Test 11: Exam Phase Cutoff Validation');
    const currentMonth = new Date().getMonth() + 1;
    console.log(`   Current month: ${currentMonth}`);
    // Papers from future phases should not be available
    const futurePaperData = {
      ...paperData,
      year: 2024,
      examPhase: 'annual', // February exam - if current month < 2, should not be available
      setCode: 'A',
    };
    const futurePaper = await ingestOfficialPaper(futurePaperData);
    await matchPaperQuestions(futurePaper._id);
    await applyMvviVviTags(futurePaper._id);
    
    const availablePapers2 = await getAvailablePapers({
      boardCode: 'bseb',
      classLevel: '10',
      subjectCode: 'sci',
      medium: 'Hindi',
    });
    const futurePaperAvailable = availablePapers2.find(p => p._id.toString() === futurePaper._id.toString());
    // If current month >= 2 (February), annual should be available
    // If current month < 2, annual should NOT be available
    if (currentMonth >= 2) {
      assert(futurePaperAvailable !== undefined, 'Annual paper available (exam month passed)');
    } else {
      assert(futurePaperAvailable === undefined, 'Annual paper NOT available (exam month not passed)');
    }
    console.log(`   Phase cutoff working correctly for month ${currentMonth}`);
    
    // Test 12: Source credit attribution
    console.log('\n📋 Test 12: Source Credit Attribution');
    assert(testPaper.sourceCreditText.includes('Bihar School Examination Board'), 'Source credit present on test paper');
    assert(answerPaper.sourceCreditText.includes('Bihar School Examination Board'), 'Source credit present on answer paper');
    console.log(`   Source credit: ${testPaper.sourceCreditText}`);
    
    // Cleanup test papers
    console.log('\n🧹 Cleaning up test papers...');
    await OfficialPaper.deleteMany({ _id: { $in: [paper._id, paper2022._id, paper2021._id, futurePaper._id] } });
    await Question.deleteMany({ officialPaperSource: { $in: ['BSEB-2023-Annual-SetA', 'BSEB-2022-Annual-SetB', 'BSEB-2021-Annual-SetC', 'BSEB-2024-Annual-SetA'] } });
    console.log('✅ Cleanup complete');
    
  } catch (err) {
    console.error('\n❌ Test error:', err);
    failed++;
  }
  
  console.log('\n📊 ===== PHASE 5 VERIFICATION SUMMARY =====');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${passed / (passed + failed) * 100}%`);
  
  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');
  
  if (failed > 0) {
    process.exit(1);
  }
}

testPhase5().catch(console.error);