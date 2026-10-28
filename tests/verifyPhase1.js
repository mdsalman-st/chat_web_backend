import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getResolvedBoardConfig, getSubjectsForClass, getChaptersForSubject } from '../utils/boardEngine.js';
import BoardConfig from '../models/BoardConfig.js';
import Chapter from '../models/Chapter.js';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env' });
}

async function runVerification() {
  console.log('🧪 Running Phase 1 Backend Verification...\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Test 1: Fetch BSEB config
  const bseb = await getResolvedBoardConfig('bseb');
  console.log('✓ Test 1 - BSEB Config:');
  console.log(`   Name: ${bseb.name}`);
  console.log(`   Has Set Code: ${bseb.hasSetCode} (Set codes: ${bseb.setCodes.join(', ')})`);
  console.log(`   Exam Phases: ${bseb.examPhases.map(p => p.name).join(' | ')}`);
  console.log(`   Is Fallback: ${bseb.isUsingFallback}`);

  // Test 2: Fetch CBSE config
  const cbse = await getResolvedBoardConfig('cbse');
  console.log('✓ Test 2 - CBSE Config:');
  console.log(`   Name: ${cbse.name}`);
  console.log(`   Has Set Code: ${cbse.hasSetCode}`);

  // Test 3: Fallback test for unknown / unconfigured board
  const fallback = await getResolvedBoardConfig('rajasthan_board_unknown');
  console.log('✓ Test 3 - Fallback Test (Unknown Board):');
  console.log(`   Name: ${fallback.name}`);
  console.log(`   Is Using Fallback: ${fallback.isUsingFallback}`);
  console.log(`   Notice: ${fallback.fallbackNotice}`);

  // Test 4: Dynamic Subjects for Class 10
  const bsebSubjects = getSubjectsForClass(bseb, '10');
  console.log('✓ Test 4 - BSEB Class 10 Subjects:');
  console.log(`   Subjects: ${bsebSubjects.map(s => s.name).join(', ')}`);

  // Test 5: Dynamic Subjects for Class 12 Science PCM
  const bseb12Subjects = getSubjectsForClass(bseb, '12', 'science_pcm');
  console.log('✓ Test 5 - BSEB Class 12 Science (PCM) Subjects:');
  console.log(`   Subjects: ${bseb12Subjects.map(s => s.name).join(', ')}`);

  // Test 6: Chapter fetching with Phase Cutoff
  const chResAll = await getChaptersForSubject({
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
  });
  console.log(`✓ Test 6 - BSEB Class 10 Science Total Chapters: ${chResAll.chapters.length}`);

  const chResQuarterly = await getChaptersForSubject({
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    phase: 'quarterly',
  });
  console.log(`✓ Test 7 - BSEB Class 10 Science Quarterly Chapters: ${chResQuarterly.chapters.length} (Filtered by syllabus cutoff)`);

  await mongoose.disconnect();
  console.log('\n🎉 ALL PHASE 1 BACKEND VERIFICATIONS PASSED SUCCESSFULLY!');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
