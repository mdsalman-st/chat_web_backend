import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BoardConfig from '../models/BoardConfig.js';
import Chapter from '../models/Chapter.js';

dotenv.config();

const BOARDS_DATA = [
  {
    code: 'ncert_default',
    name: 'NCERT Curriculum (Default Pattern)',
    shortName: 'NCERT',
    hindiName: 'एनसीईआरटी पाठ्यक्रम',
    state: 'National',
    supportedMediums: ['Hindi', 'English'],
    hasSetCode: false,
    setCodes: [],
    answerKeyFormat: 'letters',
    sourceCreditText: 'NCERT National Curriculum & Textbook Guidelines',
    isFallback: true,
    isActive: true,
    examPhases: [
      { phaseId: 'quarterly', name: 'Quarterly Exam', hindiName: 'त्रैमासिक परीक्षा', syllabusCutoffRatio: 0.35, order: 1, examMonth: 'September' },
      { phaseId: 'half_yearly', name: 'Half-Yearly Exam', hindiName: 'अर्धवार्षिक परीक्षा', syllabusCutoffRatio: 0.70, order: 2, examMonth: 'December' },
      { phaseId: 'annual', name: 'Annual Board Exam', hindiName: 'वार्षिक परीक्षा', syllabusCutoffRatio: 1.0, order: 3, examMonth: 'March' },
    ],
    paperPattern: {
      mcqCount: 40,
      attemptLimit: 40,
      marksPerMcq: 1,
      durationMinutes: 90,
      negativeMarking: 0,
      optionsCount: 4,
      hasShortAnswer: true,
      shortCount: 10,
      shortMarks: 2,
      hasLongAnswer: true,
      longCount: 4,
      longMarks: 5,
      totalMarks: 80,
    },
    classes: [
      {
        classLevel: '10',
        name: 'Class 10',
        hindiName: 'कक्षा 10',
        hasStreams: false,
        order: 2,
        subjects: [
          { code: 'sci', name: 'Science', hindiName: 'विज्ञान', icon: '🔬', color: '#06b6d4', order: 1 },
          { code: 'math', name: 'Mathematics', hindiName: 'गणित', icon: '📐', color: '#3b82f6', order: 2 },
          { code: 'sst', name: 'Social Science', hindiName: 'सामाजिक विज्ञान', icon: '🌍', color: '#10b981', order: 3 },
          { code: 'hin', name: 'Hindi', hindiName: 'हिन्दी', icon: '📖', color: '#f59e0b', order: 4 },
          { code: 'eng', name: 'English', hindiName: 'अंग्रेज़ी', icon: '🔤', color: '#8b5cf6', order: 5 },
        ],
      },
      {
        classLevel: '12',
        name: 'Class 12',
        hindiName: 'कक्षा 12',
        hasStreams: true,
        order: 4,
        streams: [
          {
            streamId: 'science_pcm',
            name: 'Science (PCM)',
            hindiName: 'विज्ञान (PCM)',
            subjects: [
              { code: 'phy', name: 'Physics', hindiName: 'भौतिक विज्ञान', icon: '⚛️', color: '#06b6d4', order: 1 },
              { code: 'chem', name: 'Chemistry', hindiName: 'रसायन विज्ञान', icon: '🧪', color: '#3b82f6', order: 2 },
              { code: 'math', name: 'Mathematics', hindiName: 'गणित', icon: '📐', color: '#8b5cf6', order: 3 },
              { code: 'eng', name: 'English Core', hindiName: 'अंग्रेज़ी कोर', icon: '🔤', color: '#10b981', order: 4 },
              { code: 'hin', name: 'Hindi Core', hindiName: 'हिन्दी कोर', icon: '📖', color: '#f59e0b', order: 5 },
            ],
          },
          {
            streamId: 'science_pcb',
            name: 'Science (PCB)',
            hindiName: 'विज्ञान (PCB)',
            subjects: [
              { code: 'phy', name: 'Physics', hindiName: 'भौतिक विज्ञान', icon: '⚛️', color: '#06b6d4', order: 1 },
              { code: 'chem', name: 'Chemistry', hindiName: 'रसायन विज्ञान', icon: '🧪', color: '#3b82f6', order: 2 },
              { code: 'bio', name: 'Biology', hindiName: 'जीव विज्ञान', icon: '🧬', color: '#10b981', order: 3 },
              { code: 'eng', name: 'English Core', hindiName: 'अंग्रेज़ी कोर', icon: '🔤', color: '#8b5cf6', order: 4 },
              { code: 'hin', name: 'Hindi Core', hindiName: 'हिन्दी कोर', icon: '📖', color: '#f59e0b', order: 5 },
            ],
          },
          {
            streamId: 'commerce',
            name: 'Commerce',
            hindiName: 'वाणिज्य',
            subjects: [
              { code: 'acc', name: 'Accountancy', hindiName: 'लेखाशास्त्र', icon: '📊', color: '#10b981', order: 1 },
              { code: 'bst', name: 'Business Studies', hindiName: 'व्यवसाय अध्ययन', icon: '💼', color: '#3b82f6', order: 2 },
              { code: 'eco', name: 'Economics', hindiName: 'अर्थशास्त्र', icon: '📈', color: '#f59e0b', order: 3 },
              { code: 'eng', name: 'English Core', hindiName: 'अंग्रेज़ी कोर', icon: '🔤', color: '#8b5cf6', order: 4 },
            ],
          },
          {
            streamId: 'arts',
            name: 'Arts / Humanities',
            hindiName: 'कला / मानविकी',
            subjects: [
              { code: 'hist', name: 'History', hindiName: 'इतिहास', icon: '🏛️', color: '#f59e0b', order: 1 },
              { code: 'pol', name: 'Political Science', hindiName: 'राजनीति विज्ञान', icon: '⚖️', color: '#3b82f6', order: 2 },
              { code: 'geo', name: 'Geography', hindiName: 'भूगोल', icon: '🗺️', color: '#10b981', order: 3 },
              { code: 'eng', name: 'English Core', hindiName: 'अंग्रेज़ी कोर', icon: '🔤', color: '#8b5cf6', order: 4 },
            ],
          },
        ],
      },
      {
        classLevel: '9',
        name: 'Class 9',
        hindiName: 'कक्षा 9',
        hasStreams: false,
        order: 1,
        subjects: [
          { code: 'sci', name: 'Science', hindiName: 'विज्ञान', icon: '🔬', color: '#06b6d4', order: 1 },
          { code: 'math', name: 'Mathematics', hindiName: 'गणित', icon: '📐', color: '#3b82f6', order: 2 },
          { code: 'sst', name: 'Social Science', hindiName: 'सामाजिक विज्ञान', icon: '🌍', color: '#10b981', order: 3 },
          { code: 'hin', name: 'Hindi', hindiName: 'हिन्दी', icon: '📖', color: '#f59e0b', order: 4 },
          { code: 'eng', name: 'English', hindiName: 'अंग्रेज़ी', icon: '🔤', color: '#8b5cf6', order: 5 },
        ],
      },
      {
        classLevel: '11',
        name: 'Class 11',
        hindiName: 'कक्षा 11',
        hasStreams: true,
        order: 3,
        streams: [
          {
            streamId: 'science_pcm',
            name: 'Science (PCM)',
            hindiName: 'विज्ञान (PCM)',
            subjects: [
              { code: 'phy', name: 'Physics', hindiName: 'भौतिक विज्ञान', icon: '⚛️', color: '#06b6d4', order: 1 },
              { code: 'chem', name: 'Chemistry', hindiName: 'रसायन विज्ञान', icon: '🧪', color: '#3b82f6', order: 2 },
              { code: 'math', name: 'Mathematics', hindiName: 'गणित', icon: '📐', color: '#8b5cf6', order: 3 },
              { code: 'eng', name: 'English Core', hindiName: 'अंग्रेज़ी कोर', icon: '🔤', color: '#10b981', order: 4 },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'bseb',
    name: 'Bihar School Examination Board (BSEB)',
    shortName: 'BSEB',
    hindiName: 'बिहार विद्यालय परीक्षा समिति (BSEB)',
    state: 'Bihar',
    supportedMediums: ['Hindi', 'English'],
    hasSetCode: true,
    setCodes: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    answerKeyFormat: 'letters',
    sourceCreditText: 'Bihar School Examination Board Official Question Papers & Textbooks',
    isFallback: false,
    isActive: true,
    examPhases: [
      { phaseId: 'quarterly', name: 'Quarterly Exam (मासिक/त्रैमासिक)', hindiName: 'त्रैमासिक परीक्षा', syllabusCutoffRatio: 0.35, order: 1, examMonth: 'September' },
      { phaseId: 'half_yearly', name: 'Half-Yearly Exam (अर्धवार्षिक)', hindiName: 'अर्धवार्षिक परीक्षा', syllabusCutoffRatio: 0.70, order: 2, examMonth: 'November' },
      { phaseId: 'sent_up', name: 'Sent-Up Test (सेंट-अप जांच परीक्षा)', hindiName: 'सेंट-अप परीक्षा', syllabusCutoffRatio: 1.0, order: 3, examMonth: 'January' },
      { phaseId: 'annual', name: 'Annual Board Exam (वार्षिक बोर्ड परीक्षा)', hindiName: 'वार्षिक बोर्ड परीक्षा', syllabusCutoffRatio: 1.0, order: 4, examMonth: 'February' },
    ],
    paperPattern: {
      mcqCount: 100, // BSEB gives 100 MCQs
      attemptLimit: 50, // Student answers any 50
      marksPerMcq: 1,
      durationMinutes: 195, // 3 hours 15 minutes
      negativeMarking: 0,
      optionsCount: 4,
      hasShortAnswer: true,
      shortCount: 30,
      shortMarks: 2,
      hasLongAnswer: true,
      longCount: 8,
      longMarks: 5,
      totalMarks: 100,
    },
    classes: [
      {
        classLevel: '10',
        name: 'Matric (Class 10)',
        hindiName: 'मैट्रिक (कक्षा 10)',
        hasStreams: false,
        order: 1,
        subjects: [
          { code: 'sci', name: 'Science (विज्ञान)', hindiName: 'विज्ञान', icon: '🔬', color: '#06b6d4', order: 1 },
          { code: 'math', name: 'Mathematics (गणित)', hindiName: 'गणित', icon: '📐', color: '#3b82f6', order: 2 },
          { code: 'sst', name: 'Social Science (सामाजिक विज्ञान)', hindiName: 'सामाजिक विज्ञान', icon: '🌍', color: '#10b981', order: 3 },
          { code: 'hin', name: 'Hindi (मातृभाषा हिन्दी)', hindiName: 'हिन्दी', icon: '📖', color: '#f59e0b', order: 4 },
          { code: 'skt', name: 'Sanskrit (द्वितीय भाषा संस्कृत)', hindiName: 'संस्कृत', icon: '🕉️', color: '#ec4899', order: 5 },
          { code: 'eng', name: 'English (अंग्रेज़ी)', hindiName: 'अंग्रेज़ी', icon: '🔤', color: '#8b5cf6', order: 6 },
        ],
      },
      {
        classLevel: '12',
        name: 'Intermediate (Class 12)',
        hindiName: 'इंटरमीडिएट (कक्षा 12)',
        hasStreams: true,
        order: 2,
        streams: [
          {
            streamId: 'science_pcm',
            name: 'I.Sc. Science (PCM)',
            hindiName: 'आई.एससी. (PCM)',
            subjects: [
              { code: 'phy', name: 'Physics (भौतिकी)', hindiName: 'भौतिकी', icon: '⚛️', color: '#06b6d4', order: 1 },
              { code: 'chem', name: 'Chemistry (रसायन शास्त्र)', hindiName: 'रसायन शास्त्र', icon: '🧪', color: '#3b82f6', order: 2 },
              { code: 'math', name: 'Mathematics (गणित)', hindiName: 'गणित', icon: '📐', color: '#8b5cf6', order: 3 },
              { code: 'hin', name: 'Hindi 100 Marks (हिन्दी)', hindiName: 'हिन्दी 100 अंक', icon: '📖', color: '#f59e0b', order: 4 },
              { code: 'eng', name: 'English 100 Marks (अंग्रेज़ी)', hindiName: 'अंग्रेज़ी 100 अंक', icon: '🔤', color: '#10b981', order: 5 },
            ],
          },
          {
            streamId: 'science_pcb',
            name: 'I.Sc. Science (PCB)',
            hindiName: 'आई.एससी. (PCB)',
            subjects: [
              { code: 'phy', name: 'Physics (भौतिकी)', hindiName: 'भौतिकी', icon: '⚛️', color: '#06b6d4', order: 1 },
              { code: 'chem', name: 'Chemistry (रसायन शास्त्र)', hindiName: 'रसायन शास्त्र', icon: '🧪', color: '#3b82f6', order: 2 },
              { code: 'bio', name: 'Biology (जीव विज्ञान)', hindiName: 'जीव विज्ञान', icon: '🧬', color: '#10b981', order: 3 },
              { code: 'hin', name: 'Hindi 100 Marks (हिन्दी)', hindiName: 'हिन्दी 100 अंक', icon: '📖', color: '#f59e0b', order: 4 },
              { code: 'eng', name: 'English 100 Marks (अंग्रेज़ी)', hindiName: 'अंग्रेज़ी 100 अंक', icon: '🔤', color: '#8b5cf6', order: 5 },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'cbse',
    name: 'Central Board of Secondary Education (CBSE)',
    shortName: 'CBSE',
    hindiName: 'केंद्रीय माध्यमिक शिक्षा बोर्ड (CBSE)',
    state: 'National',
    supportedMediums: ['English', 'Hindi'],
    hasSetCode: false,
    setCodes: [],
    answerKeyFormat: 'letters',
    sourceCreditText: 'CBSE Official Question Papers, Marking Schemes & NCERT',
    isFallback: false,
    isActive: true,
    examPhases: [
      { phaseId: 'mid_term', name: 'Mid-Term Exam', hindiName: 'मध्य-सत्र परीक्षा', syllabusCutoffRatio: 0.50, order: 1, examMonth: 'September' },
      { phaseId: 'pre_board', name: 'Pre-Board Exam', hindiName: 'प्री-बोर्ड परीक्षा', syllabusCutoffRatio: 1.0, order: 2, examMonth: 'January' },
      { phaseId: 'annual', name: 'CBSE Board Exam', hindiName: 'वार्षिक बोर्ड परीक्षा', syllabusCutoffRatio: 1.0, order: 3, examMonth: 'February' },
    ],
    paperPattern: {
      mcqCount: 20,
      attemptLimit: 20,
      marksPerMcq: 1,
      durationMinutes: 180,
      negativeMarking: 0,
      optionsCount: 4,
      hasShortAnswer: true,
      shortCount: 15,
      shortMarks: 2,
      hasLongAnswer: true,
      longCount: 6,
      longMarks: 5,
      totalMarks: 80,
    },
    classes: [
      {
        classLevel: '10',
        name: 'Class 10',
        hindiName: 'कक्षा 10',
        hasStreams: false,
        order: 1,
        subjects: [
          { code: 'sci', name: 'Science', hindiName: 'विज्ञान', icon: '🔬', color: '#06b6d4', order: 1 },
          { code: 'math', name: 'Mathematics (Standard / Basic)', hindiName: 'गणित', icon: '📐', color: '#3b82f6', order: 2 },
          { code: 'sst', name: 'Social Science', hindiName: 'सामाजिक विज्ञान', icon: '🌍', color: '#10b981', order: 3 },
          { code: 'eng', name: 'English Language & Literature', hindiName: 'अंग्रेज़ी', icon: '🔤', color: '#8b5cf6', order: 4 },
          { code: 'hin', name: 'Hindi Course A / B', hindiName: 'हिन्दी', icon: '📖', color: '#f59e0b', order: 5 },
        ],
      },
      {
        classLevel: '12',
        name: 'Class 12',
        hindiName: 'कक्षा 12',
        hasStreams: true,
        order: 2,
        streams: [
          {
            streamId: 'science_pcm',
            name: 'Science (PCM)',
            hindiName: 'विज्ञान (PCM)',
            subjects: [
              { code: 'phy', name: 'Physics', hindiName: 'भौतिक विज्ञान', icon: '⚛️', color: '#06b6d4', order: 1 },
              { code: 'chem', name: 'Chemistry', hindiName: 'रसायन विज्ञान', icon: '🧪', color: '#3b82f6', order: 2 },
              { code: 'math', name: 'Mathematics', hindiName: 'गणित', icon: '📐', color: '#8b5cf6', order: 3 },
              { code: 'eng', name: 'English Core', hindiName: 'अंग्रेज़ी कोर', icon: '🔤', color: '#10b981', order: 4 },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'up_board',
    name: 'Uttar Pradesh Madhyamik Shiksha Parishad (UP Board)',
    shortName: 'UP Board',
    hindiName: 'उत्तर प्रदेश माध्यमिक शिक्षा परिषद',
    state: 'Uttar Pradesh',
    supportedMediums: ['Hindi', 'English'],
    hasSetCode: true,
    setCodes: ['801', '802', '803', '804', '805', '806', '807'],
    answerKeyFormat: 'letters',
    sourceCreditText: 'UPMSP Official Question Papers & Syllabus',
    isFallback: false,
    isActive: true,
    examPhases: [
      { phaseId: 'half_yearly', name: 'Half-Yearly Exam', hindiName: 'अर्धवार्षिक परीक्षा', syllabusCutoffRatio: 0.50, order: 1, examMonth: 'October' },
      { phaseId: 'pre_board', name: 'Pre-Board Exam', hindiName: 'प्री-बोर्ड परीक्षा', syllabusCutoffRatio: 1.0, order: 2, examMonth: 'January' },
      { phaseId: 'annual', name: 'UP Board High School / Inter Exam', hindiName: 'वार्षिक बोर्ड परीक्षा', syllabusCutoffRatio: 1.0, order: 3, examMonth: 'February' },
    ],
    paperPattern: {
      mcqCount: 20, // OMR sheet based 20 MCQs in UP Board
      attemptLimit: 20,
      marksPerMcq: 1,
      durationMinutes: 195,
      negativeMarking: 0,
      optionsCount: 4,
      hasShortAnswer: true,
      shortCount: 10,
      shortMarks: 2,
      hasLongAnswer: true,
      longCount: 5,
      longMarks: 6,
      totalMarks: 70,
    },
    classes: [
      {
        classLevel: '10',
        name: 'High School (Class 10)',
        hindiName: 'हाई स्कूल (कक्षा 10)',
        hasStreams: false,
        order: 1,
        subjects: [
          { code: 'sci', name: 'Science (विज्ञान)', hindiName: 'विज्ञान', icon: '🔬', color: '#06b6d4', order: 1 },
          { code: 'math', name: 'Mathematics (गणित)', hindiName: 'गणित', icon: '📐', color: '#3b82f6', order: 2 },
          { code: 'sst', name: 'Social Science (सामाजिक विज्ञान)', hindiName: 'सामाजिक विज्ञान', icon: '🌍', color: '#10b981', order: 3 },
          { code: 'hin', name: 'Hindi (हिन्दी)', hindiName: 'हिन्दी', icon: '📖', color: '#f59e0b', order: 4 },
          { code: 'eng', name: 'English (अंग्रेज़ी)', hindiName: 'अंग्रेज़ी', icon: '🔤', color: '#8b5cf6', order: 5 },
        ],
      },
    ],
  },
];

const SEED_CHAPTERS = [
  // Class 10 Science (NCERT & Fallback)
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 1, title: 'Chemical Reactions and Equations', hindiTitle: 'रासायनिक अभिक्रियाएँ एवं समीकरण', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 2, title: 'Acids, Bases and Salts', hindiTitle: 'अम्ल, क्षारक एवं लवण', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 3, title: 'Metals and Non-metals', hindiTitle: 'धातु एवं अधातु', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 4, title: 'Carbon and its Compounds', hindiTitle: 'कार्बन एवं उसके यौगिक', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 5, title: 'Life Processes', hindiTitle: 'जैव प्रक्रम', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 6, title: 'Control and Coordination', hindiTitle: 'नियंत्रण एवं समन्वय', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 7, title: 'How do Organisms Reproduce?', hindiTitle: 'जीव जनन कैसे करते हैं?', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 8, title: 'Heredity and Evolution', hindiTitle: 'आनुवंशिकता एवं जैव विकास', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 9, title: 'Light - Reflection and Refraction', hindiTitle: 'प्रकाश - परावर्तन तथा अपवर्तन', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 10, title: 'The Human Eye and Colourful World', hindiTitle: 'मानव नेत्र तथा रंगबिरंगा संसार', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 11, title: 'Electricity', hindiTitle: 'विद्युत', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 12, title: 'Magnetic Effects of Electric Current', hindiTitle: 'विद्युत धारा के चुंबकीय प्रभाव', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'sci', chapterNumber: 13, title: 'Our Environment', hindiTitle: 'हमारा पर्यावरण', phaseCutoff: 'annual', isLive: false },

  // Class 10 Mathematics (NCERT & Fallback)
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 1, title: 'Real Numbers', hindiTitle: 'वास्तविक संख्याएँ', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 2, title: 'Polynomials', hindiTitle: 'बहुपद', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 3, title: 'Pair of Linear Equations in Two Variables', hindiTitle: 'दो चर वाले रैखिक समीकरण युग्म', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 4, title: 'Quadratic Equations', hindiTitle: 'द्विघात समीकरण', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 5, title: 'Arithmetic Progressions', hindiTitle: 'समान्तर श्रेढ़ी', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 6, title: 'Triangles', hindiTitle: 'त्रिभुज', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 7, title: 'Coordinate Geometry', hindiTitle: 'निर्देशांक ज्यामिति', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 8, title: 'Introduction to Trigonometry', hindiTitle: 'त्रिकोणमिति का परिचय', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 9, title: 'Some Applications of Trigonometry', hindiTitle: 'त्रिकोणमिति के कुछ अनुप्रयोग', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 10, title: 'Circles', hindiTitle: 'वृत्त', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 11, title: 'Areas Related to Circles', hindiTitle: 'वृत्तों से संबंधित क्षेत्रफल', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 12, title: 'Surface Areas and Volumes', hindiTitle: 'पृष्ठीय क्षेत्रफल और आयतन', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 13, title: 'Statistics', hindiTitle: 'सांख्यिकी', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '10', subjectCode: 'math', chapterNumber: 14, title: 'Probability', hindiTitle: 'प्रायिकता', phaseCutoff: 'annual', isLive: false },

  // Class 12 Physics (NCERT & Fallback)
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 1, title: 'Electric Charges and Fields', hindiTitle: 'वैद्युत आवेश तथा क्षेत्र', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 2, title: 'Electrostatic Potential and Capacitance', hindiTitle: 'स्थिरवैद्युत विभव तथा धारिता', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 3, title: 'Current Electricity', hindiTitle: 'विद्युत धारा', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 4, title: 'Moving Charges and Magnetism', hindiTitle: 'गतिमान आवेश और चुंबकत्व', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 5, title: 'Magnetism and Matter', hindiTitle: 'चुंबकत्व एवं द्रव्य', phaseCutoff: 'half_yearly', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 6, title: 'Electromagnetic Induction', hindiTitle: 'वैद्युतचुंबकीय प्रेरण', phaseCutoff: 'half_yearly', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 7, title: 'Alternating Current', hindiTitle: 'प्रत्यावर्ती धारा', phaseCutoff: 'half_yearly', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 8, title: 'Electromagnetic Waves', hindiTitle: 'वैद्युतचुंबकीय तरंगें', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 9, title: 'Ray Optics and Optical Instruments', hindiTitle: 'किरण प्रकाशिकी एवं प्रकाशिक यंत्र', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 10, title: 'Wave Optics', hindiTitle: 'तरंग प्रकाशिकी', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 11, title: 'Dual Nature of Radiation and Matter', hindiTitle: 'विकिरण तथा द्रव्य की द्वैत प्रकृति', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 12, title: 'Atoms', hindiTitle: 'परमाणु', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 13, title: 'Nuclei', hindiTitle: 'नाभिक', phaseCutoff: 'annual', isLive: false },
  { boardCode: 'ncert_default', classLevel: '12', subjectCode: 'phy', stream: 'science_pcm', chapterNumber: 14, title: 'Semiconductor Electronics', hindiTitle: 'अर्धचालक इलेक्ट्रॉनिकी', phaseCutoff: 'annual', isLive: false },

  // BSEB specific chapters for Class 10 Science (mirroring BSEB state text with special local focus)
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 1, title: 'रासायनिक अभिक्रियाएँ एवं समीकरण', hindiTitle: 'रासायनिक अभिक्रियाएँ एवं समीकरण', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 2, title: 'अम्ल, क्षारक एवं लवण', hindiTitle: 'अम्ल, क्षारक एवं लवण', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 3, title: 'धातु एवं अधातु', hindiTitle: 'धातु एवं अधातु', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 4, title: 'कार्बन एवं उसके यौगिक', hindiTitle: 'कार्बन एवं उसके यौगिक', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 5, title: 'जैव प्रक्रम', hindiTitle: 'जैव प्रक्रम', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 6, title: 'नियंत्रण एवं समन्वय', hindiTitle: 'नियंत्रण एवं समन्वय', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 7, title: 'जीव जनन कैसे करते हैं?', hindiTitle: 'जीव जनन कैसे करते हैं?', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 8, title: 'आनुवंशिकता एवं जैव विकास', hindiTitle: 'आनुवंशिकता एवं जैव विकास', phaseCutoff: 'sent_up', isLive: false },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 9, title: 'प्रकाश - परावर्तन तथा अपवर्तन', hindiTitle: 'प्रकाश - परावर्तन तथा अपवर्तन', phaseCutoff: 'quarterly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 10, title: 'मानव नेत्र तथा रंगबिरंगा संसार', hindiTitle: 'मानव नेत्र तथा रंगबिरंगा संसार', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 11, title: 'विद्युत', hindiTitle: 'विद्युत', phaseCutoff: 'half_yearly', isLive: true },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 12, title: 'विद्युत धारा के चुंबकीय प्रभाव', hindiTitle: 'विद्युत धारा के चुंबकीय प्रभाव', phaseCutoff: 'sent_up', isLive: false },
  { boardCode: 'bseb', classLevel: '10', subjectCode: 'sci', chapterNumber: 13, title: 'हमारा पर्यावरण', hindiTitle: 'हमारा पर्यावरण', phaseCutoff: 'annual', isLive: false },
];

export async function seedBoardConfigs() {
  console.log('🌱 Seeding Board Configurations & Chapters...');

  for (const board of BOARDS_DATA) {
    await BoardConfig.findOneAndUpdate(
      { code: board.code },
      { $set: board },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Board seeded: ${board.name} (${board.code})`);
  }

  for (const ch of SEED_CHAPTERS) {
    const query = {
      boardCode: ch.boardCode,
      classLevel: ch.classLevel,
      subjectCode: ch.subjectCode,
      chapterNumber: ch.chapterNumber,
    };
    if (ch.stream) query.stream = ch.stream;

    await Chapter.findOneAndUpdate(
      query,
      { $set: ch },
      { upsert: true, new: true }
    );
  }

  console.log(`  ✓ ${SEED_CHAPTERS.length} Chapters seeded successfully.`);
  console.log('✅ Board Configuration Seeding Complete.\n');
}

// Standalone execution runner
if (process.argv[1] && process.argv[1].endsWith('seedBoards.js')) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI missing in .env');
    process.exit(1);
  }

  mongoose
    .connect(uri)
    .then(async () => {
      console.log('Connected to MongoDB for Seeding...');
      await seedBoardConfigs();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seeding error:', err);
      process.exit(1);
    });
}
