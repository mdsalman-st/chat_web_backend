import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Font paths
const DEVANAGARI_FONT = path.resolve(__dirname, '../fonts/NotoSansDevanagari-Regular.ttf');
const FALLBACK_FONT = 'Helvetica';

/**
 * Generate a time-limited signed PDF download token
 */
export function generatePdfToken(attemptId, userId, expiresInSeconds = 7200) {
  const secret = process.env.JWT_SECRET || 'nexus_fallback_secret_key_2026';
  return jwt.sign(
    { attemptId: String(attemptId), userId: String(userId), scope: 'pdf_download' },
    secret,
    { expiresIn: expiresInSeconds }
  );
}

/**
 * Verify signed PDF download token
 */
export function verifyPdfToken(token, attemptId) {
  try {
    const secret = process.env.JWT_SECRET || 'nexus_fallback_secret_key_2026';
    const decoded = jwt.verify(token, secret);
    if (decoded.scope !== 'pdf_download' || decoded.attemptId !== String(attemptId)) {
      return null;
    }
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Build PDF stream for a Test Attempt
 * @param {Object} attempt - Completed TestAttempt document
 * @param {Array} questions - Array of populated questions (MCQ)
 * @param {Object} student - User document / studentProfile
 * @param {Boolean} wrongOnly - If true, only print incorrect or skipped questions
 * @param {WritableStream} outputStream - Stream to pipe PDF into
 */
export function buildTestReportPdf(attempt, questions = [], student = {}, wrongOnly = false, outputStream) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        info: {
          Title: `Nexus Test Report - ${attempt.subjectName || attempt.subjectCode}`,
          Author: 'Nexus Adaptive Learning System',
          Subject: 'Academic Diagnostic Test Report',
        },
      });

      doc.pipe(outputStream);

      // Check if Devanagari font exists
      const hasDevanagari = fs.existsSync(DEVANAGARI_FONT);
      if (hasDevanagari) {
        doc.registerFont('Devanagari', DEVANAGARI_FONT);
      }
      const fontRegular = hasDevanagari ? 'Devanagari' : 'Helvetica';
      const fontBold = hasDevanagari ? 'Devanagari' : 'Helvetica-Bold';

      // Use combined score if available, otherwise fallback to MCQ score
      const score = attempt.combinedScore || attempt.score || {};
      const mcqScore = attempt.score || {};
      const subjScore = attempt.subjectiveScore || {};
      const ai = attempt.aiAnalysis || {};

      // ── Header Bar ──
      doc.rect(45, 40, 505, 54).fill('#0f172a');
      doc.fillColor('#06b6d4').font(fontBold).fontSize(16).text('NEXUS ACADEMIC TEST REPORT', 60, 52);
      doc.fillColor('#94a3b8').font(fontRegular).fontSize(9).text('Adaptive Performance & Diagnostic Evaluation', 60, 72);

      const percent = score.percentage || 0;
      doc.fillColor('#ffffff').font(fontBold).fontSize(20).text(`${percent}%`, 480, 50, { align: 'right' });
      doc.fillColor('#38bdf8').font(fontRegular).fontSize(8).text(ai.performanceLevel || 'Performance', 480, 72, { align: 'right' });

      doc.moveDown(3);

      // ── Student & Test Info Table ──
      const infoTop = 110;
      doc.rect(45, infoTop, 505, 75).fill('#f8fafc').stroke('#e2e8f0');

      doc.fillColor('#475569').font(fontRegular).fontSize(8.5);
      
      const sName = student.name || 'Student';
      const sBoard = attempt.boardCode?.toUpperCase() || 'BSEB';
      const sClass = attempt.classLevel ? `Class ${attempt.classLevel}` : 'Class 10';
      const sSubject = attempt.subjectName || attempt.subjectCode || 'General';
      const sChapter = attempt.chapterTitle || (attempt.chapterNumber ? `Chapter ${attempt.chapterNumber}` : 'Full Paper');
      const sDate = attempt.finishedAt ? new Date(attempt.finishedAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

      doc.text(`Student: `, 55, infoTop + 10, { continued: true }).font(fontBold).fillColor('#0f172a').text(sName);
      doc.font(fontRegular).fillColor('#475569').text(`Board / Class: `, 55, infoTop + 26, { continued: true }).font(fontBold).fillColor('#0f172a').text(`${sBoard} • ${sClass}`);
      doc.font(fontRegular).fillColor('#475569').text(`Subject: `, 55, infoTop + 42, { continued: true }).font(fontBold).fillColor('#0f172a').text(sSubject);

      doc.font(fontRegular).fillColor('#475569').text(`Test Topic: `, 300, infoTop + 10, { continued: true }).font(fontBold).fillColor('#0f172a').text(sChapter);
      doc.font(fontRegular).fillColor('#475569').text(`Test Date: `, 300, infoTop + 26, { continued: true }).font(fontBold).fillColor('#0f172a').text(sDate);
      
      // Combined Score Breakdown
      doc.font(fontRegular).fillColor('#475569').text(`MCQ: `, 300, infoTop + 42, { continued: true }).font(fontBold).fillColor('#0f172a').text(`${mcqScore.obtainedMarks || 0}/${mcqScore.totalMarks || 0}`);
      doc.font(fontRegular).fillColor('#475569').text(`  |  Subj: `, { continued: true }).font(fontBold).fillColor('#0f172a').text(`${subjScore.obtainedMarks || 0}/${subjScore.totalMarks || 0}`);
      doc.font(fontRegular).fillColor('#475569').text(`  |  Total: `, { continued: true }).font(fontBold).fillColor('#0f172a').text(`${score.obtainedMarks || 0}/${score.totalMarks || 0}`);

      // ── AI Diagnostic Analysis Box ──
      const aiTop = 195;
      doc.rect(45, aiTop, 505, 75).fill('#f0f9ff').stroke('#bae6fd');
      doc.fillColor('#0369a1').font(fontBold).fontSize(10).text('AI Diagnostic Analysis & Feedback', 55, aiTop + 8);
      
      doc.fillColor('#334155').font(fontRegular).fontSize(8.5);
      const remark = ai.overallRemark || `Completed overall.`;
      doc.text(remark, 55, aiTop + 23, { width: 485, lineGap: 2 });

      if (ai.strengths?.length) {
        doc.fillColor('#15803d').font(fontBold).fontSize(8).text('Strengths: ', 55, aiTop + 48, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(ai.strengths.slice(0, 2).join('; '), { width: 485 });
      }
      if (ai.weakAreas?.length) {
        doc.fillColor('#b91c1c').font(fontBold).fontSize(8).text('Focus Areas: ', 55, aiTop + 60, { continued: true });
        doc.font(fontRegular).fillColor('#334155').text(ai.weakAreas.slice(0, 2).join('; '), { width: 485 });
      }

      // ── SECTION 1: MCQ Questions Review ──
      let curY = 285;
      doc.fillColor('#0f172a').font(fontBold).fontSize(11).text(
        wrongOnly ? 'Review of Incorrect & Skipped MCQs' : 'MCQ Answer Review',
        45,
        curY
      );
      curY += 18;

      // Filter questions if wrongOnly is requested
      const qMap = {};
      questions.forEach((q) => { qMap[q._id.toString()] = q; });

      let reviewAnswers = attempt.answers || [];
      if (wrongOnly) {
        reviewAnswers = reviewAnswers.filter((a) => !a.isCorrect);
      }

      if (reviewAnswers.length === 0) {
        doc.fillColor('#16a34a').font(fontRegular).fontSize(10).text('Great job! No incorrect or skipped MCQs to review.', 45, curY);
        curY += 20;
      } else {
        reviewAnswers.forEach((ans, idx) => {
          const q = qMap[ans.questionId?.toString()] || {};
          const isCorrect = ans.isCorrect;
          const isSkipped = ans.isSkipped;
          const statusTag = isSkipped ? 'SKIPPED' : (isCorrect ? 'CORRECT' : 'INCORRECT');
          const tagBg = isSkipped ? '#fef3c7' : (isCorrect ? '#dcfce7' : '#fee2e2');
          const tagColor = isSkipped ? '#b45309' : (isCorrect ? '#15803d' : '#b91c1c');

          if (curY > 700) {
            doc.addPage();
            curY = 40;
          }

          const cardHeight = 90;
          doc.rect(45, curY, 505, cardHeight).fill('#ffffff').stroke('#e2e8f0');

          doc.rect(52, curY + 8, 20, 16).fill('#0f172a');
          doc.fillColor('#ffffff').font(fontBold).fontSize(8).text(`${idx + 1}`, 52, curY + 12, { width: 20, align: 'center' });

          doc.rect(460, curY + 8, 80, 16).fill(tagBg);
          doc.fillColor(tagColor).font(fontBold).fontSize(7.5).text(statusTag, 460, curY + 12, { width: 80, align: 'center' });

          const qText = q.hindiQuestionText || q.questionText || 'Question text unavailable';
          doc.fillColor('#0f172a').font(fontBold).fontSize(9).text(qText, 80, curY + 10, { width: 370 });

          const ansTop = curY + 32;
          doc.fillColor('#475569').font(fontRegular).fontSize(8);
          doc.text(`Your Choice: `, 55, ansTop, { continued: true })
             .font(fontBold).fillColor(isCorrect ? '#16a34a' : '#dc2626')
             .text(ans.selectedOption || '(Skipped)')
             .font(fontRegular).fillColor('#475569')
             .text(`   •   Correct Choice: `, { continued: true })
             .font(fontBold).fillColor('#16a34a')
             .text(ans.correctOption || 'N/A')
             .font(fontRegular).fillColor('#64748b')
             .text(`   •   Difficulty: ${ans.difficulty || 'Medium'}`);

          const explanation = q.explanation || 'Refer to textbook concept.';
          doc.fillColor('#0369a1').font(fontBold).fontSize(8).text('Explanation: ', 55, ansTop + 14, { continued: true });
          doc.font(fontRegular).fillColor('#334155').fontSize(7.5).text(explanation, { width: 485, lineGap: 1 });

          if (ans.mistakeReason) {
            doc.fillColor('#b91c1c').font(fontBold).fontSize(7.5).text('Mistake Insight: ', 55, ansTop + 38, { continued: true });
            doc.font(fontRegular).fillColor('#7f1d1d').fontSize(7.5).text(ans.mistakeReason, { width: 485 });
          }

          curY += cardHeight + 10;
        });
      }

      // ── SECTION 2: Subjective Questions Review ──
      if (attempt.subjectiveDetails && attempt.subjectiveDetails.evaluations && attempt.subjectiveDetails.evaluations.length > 0) {
        curY += 15;
        if (curY > 680) { doc.addPage(); curY = 40; }

        doc.fillColor('#0f172a').font(fontBold).fontSize(11).text('Subjective Answer Sheet Evaluation', 45, curY);
        curY += 18;

        attempt.subjectiveDetails.evaluations.forEach((evalData, idx) => {
          if (curY > 660) { doc.addPage(); curY = 40; }

          // Card background
          doc.rect(45, curY, 505, 140).fill('#f8fafc').stroke('#cbd5e1');
          
          // Header
          doc.rect(45, curY, 505, 20).fill('#e2e8f0');
          doc.fillColor('#0f172a').font(fontBold).fontSize(9).text(`Q${evalData.questionNumber || idx+1}: ${evalData.questionText}`, 55, curY + 6, { width: 400 });
          
          // Marks Badge
          doc.rect(460, curY + 3, 80, 14).fill('#cbd5e1');
          doc.fillColor('#0f172a').font(fontBold).fontSize(8).text(`Marks: ${evalData.awardedMarks}/${evalData.maxMarks}`, 460, curY + 6, { width: 80, align: 'center' });

          curY += 25;

          // Student Answer
          doc.fillColor('#475569').font(fontBold).fontSize(8).text('Transcribed Answer:', 55, curY);
          doc.font(fontRegular).fillColor('#0f172a').fontSize(8).text(evalData.studentAnswer || 'Not found', 55, curY + 10, { width: 485, height: 35, ellipsis: true });
          curY += 45;

          // Model Answer
          doc.fillColor('#15803d').font(fontBold).fontSize(8).text('Official Model Answer:', 55, curY);
          doc.font(fontRegular).fillColor('#334155').fontSize(8).text(evalData.modelAnswer || 'Standard board solution', 55, curY + 10, { width: 485, height: 35, ellipsis: true });
          curY += 45;

          // Teacher Note
          doc.fillColor('#0369a1').font(fontBold).fontSize(8).text('AI Feedback: ', 55, curY, { continued: true });
          doc.font(fontRegular).fillColor('#334155').fontSize(7.5).text(evalData.feedback || evalData.examinerRemarks || 'Good attempt.', { width: 485 });

          curY += 25; // Next card
        });
      }

      // ── Footer / Disclaimer ──
      const bottomY = Math.max(curY + 15, 770);
      if (bottomY > 780) {
        doc.addPage();
      }
      doc.rect(45, 770, 505, 30).fill('#f8fafc');
      doc.fillColor('#94a3b8').font(fontRegular).fontSize(7.5).text(
        'Disclaimer: AI-estimated diagnostic analysis for student practice & conceptual revision. Not official board marks.',
        50,
        780,
        { width: 495, align: 'center' }
      );

      doc.end();
      resolve(doc);
    } catch (err) {
      reject(err);
    }
  });
}