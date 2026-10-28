import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BoardConfig from '../models/BoardConfig.js';
import OfficialPaper from '../models/OfficialPaper.js';
import User from '../models/user.js';
import {
  ingestOfficialPaper,
  matchPaperQuestions,
  applyMvviVviTags,
} from '../services/paperIngestion.js';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env' });
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI missing in .env');
  process.exit(1);
}

const SAMPLE_PAPERS = [
  {
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    subjectName: 'Science',
    medium: 'Hindi',
    year: 2023,
    examPhase: 'annual',
    setCode: 'A',
    sourceUrl: 'https://biharboardonline.bihar.gov.in/pyq-2023-sci-setA.pdf',
    sourceCreditText: 'Bihar School Examination Board (BSEB) Official Question Papers',
    officialKeyUrl: 'https://biharboardonline.bihar.gov.in/keys-2023-sci-setA.pdf',
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
        correctOption: 'B', // OFFICIAL ANSWER KEY
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
        correctOption: 'D', // OFFICIAL ANSWER KEY
        marks: 1,
        difficulty: 'Medium',
        subtopic: 'Corrosion',
        chapterNumber: 1,
        chapterTitle: 'Chemical Reactions and Equations',
      },
      {
        questionNumber: 3,
        questionText: 'What is the pH value of a neutral solution at 25°C?',
        hindiQuestionText: '25°C पर उदासीन विलयन का pH मान क्या होता है?',
        options: [
          { key: 'A', text: '0', hindiText: '0' },
          { key: 'B', text: '7', hindiText: '7' },
          { key: 'C', text: '14', hindiText: '14' },
          { key: 'D', text: '1', hindiText: '1' },
        ],
        correctOption: 'B', // OFFICIAL ANSWER KEY
        marks: 1,
        difficulty: 'Easy',
        subtopic: 'pH Scale',
        chapterNumber: 2,
        chapterTitle: 'Acids, Bases and Salts',
      },
      {
        questionNumber: 4,
        questionText: 'Which gas is released when zinc reacts with dilute sulphuric acid?',
        hindiQuestionText: 'जिंक तनु सल्फ्यूरिक अम्ल के साथ अभिक्रिया करने पर कौन सी गैस निकलती है?',
        options: [
          { key: 'A', text: 'O2', hindiText: 'O2' },
          { key: 'B', text: 'CO2', hindiText: 'CO2' },
          { key: 'C', text: 'H2', hindiText: 'H2' },
          { key: 'D', text: 'N2', hindiText: 'N2' },
        ],
        correctOption: 'C', // OFFICIAL ANSWER KEY
        marks: 1,
        difficulty: 'Easy',
        subtopic: 'Acid-Metal Reactions',
        chapterNumber: 2,
        chapterTitle: 'Acids, Bases and Salts',
      },
      {
        questionNumber: 5,
        questionText: 'The focal length of a concave mirror having radius of curvature 20 cm is:',
        hindiQuestionText: 'वक्रता त्रिज्या 20 सेमी वाले अवतल दर्पण की फोकस दूरी होगी:',
        options: [
          { key: 'A', text: '20 cm', hindiText: '20 सेमी' },
          { key: 'B', text: '10 cm', hindiText: '10 सेमी' },
          { key: 'C', text: '40 cm', hindiText: '40 सेमी' },
          { key: 'D', text: '5 cm', hindiText: '5 सेमी' },
        ],
        correctOption: 'B', // OFFICIAL ANSWER KEY (f = R/2)
        marks: 1,
        difficulty: 'Medium',
        subtopic: 'Reflection of Light',
        chapterNumber: 10,
        chapterTitle: 'Light - Reflection and Refraction',
      },
    ],
  },
  {
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    subjectName: 'Science',
    medium: 'Hindi',
    year: 2022,
    examPhase: 'annual',
    setCode: 'B',
    sourceUrl: 'https://biharboardonline.bihar.gov.in/pyq-2022-sci-setB.pdf',
    sourceCreditText: 'Bihar School Examination Board (BSEB) Official Question Papers',
    officialKeyUrl: 'https://biharboardonline.bihar.gov.in/keys-2022-sci-setB.pdf',
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
        subtopic: 'Corrosion',
        chapterNumber: 1,
        chapterTitle: 'Chemical Reactions and Equations',
      },
      {
        questionNumber: 3,
        questionText: 'What is the pH value of a neutral solution at 25°C?',
        hindiQuestionText: '25°C पर उदासीन विलयन का pH मान क्या होता है?',
        options: [
          { key: 'A', text: '0', hindiText: '0' },
          { key: 'B', text: '7', hindiText: '7' },
          { key: 'C', text: '14', hindiText: '14' },
          { key: 'D', text: '1', hindiText: '1' },
        ],
        correctOption: 'B',
        marks: 1,
        difficulty: 'Easy',
        subtopic: 'pH Scale',
        chapterNumber: 2,
        chapterTitle: 'Acids, Bases and Salts',
      },
    ],
  },
  {
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    subjectName: 'Science',
    medium: 'Hindi',
    year: 2021,
    examPhase: 'annual',
    setCode: 'C',
    sourceUrl: 'https://biharboardonline.bihar.gov.in/pyq-2021-sci-setC.pdf',
    sourceCreditText: 'Bihar School Examination Board (BSEB) Official Question Papers',
    officialKeyUrl: 'https://biharboardonline.bihar.gov.in/keys-2021-sci-setC.pdf',
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
        subtopic: 'Corrosion',
        chapterNumber: 1,
        chapterTitle: 'Chemical Reactions and Equations',
      },
    ],
  },
];

async function seedOfficialPapers() {
  console.log('🏛️ Seeding Official Board Papers (Phase 5)...');
  await mongoose.connect(MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.create({
      name: 'System Admin',
      email: 'admin_seeder@nexus.local',
      phone: '9998887776',
      passwordHash: 'dummy_hash',
      salt: 'dummy_salt',
      role: 'admin',
    });
    console.log('✓ Created admin user for ingestion');
  }

  for (const paperData of SAMPLE_PAPERS) {
    const existing = await OfficialPaper.findOne({
      boardCode: paperData.boardCode,
      classLevel: paperData.classLevel,
      subjectCode: paperData.subjectCode,
      year: paperData.year,
      examPhase: paperData.examPhase,
      setCode: paperData.setCode,
    });

    if (existing) {
      console.log(`- Paper already exists: ${existing.paperCode}`);
      await matchPaperQuestions(existing._id);
      await applyMvviVviTags(existing._id);
      await OfficialPaper.findByIdAndUpdate(existing._id, { status: 'published' });
      continue;
    }

    const paper = await ingestOfficialPaper({
      ...paperData,
      ingestedBy: admin._id,
    });
    console.log(`✓ Ingested: ${paper.paperCode}`);

    await matchPaperQuestions(paper._id);
    const tagRes = await applyMvviVviTags(paper._id);
    console.log(`  Tags applied: ${tagRes.tagsApplied}`);

    await OfficialPaper.findByIdAndUpdate(paper._id, { status: 'published' });
  }

  console.log('🎉 Official Papers seeded and published successfully!');
  await mongoose.disconnect();
}

seedOfficialPapers().catch(console.error);

