import TestAttempt from '../models/TestAttempt.js';
import Question from '../models/Question.js';
import Notification from '../models/Notification.js';
import { executeAiJsonWithFailover } from '../utils/aiClient.js';

class AnalysisQueueService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Enqueue a completed test attempt for deep diagnostic analysis
   */
  async enqueueAttempt(attemptId) {
    try {
      const attempt = await TestAttempt.findById(attemptId);
      if (!attempt) return null;

      // Calculate queue position & ETA
      const queuePosition = this.queue.length + 1;
      const etaMinutes = queuePosition * 2; // ~2 min per in-depth batch analysis

      attempt.aiAnalysisStatus = 'queued';
      attempt.aiAnalysisEta = `${etaMinutes} min`;
      await attempt.save();

      this.queue.push(String(attemptId));
      console.log(`[AnalysisQueue] Enqueued attempt ${attemptId}. Queue size: ${this.queue.length}`);

      // Trigger worker
      this.processNext();

      return {
        queuePosition,
        etaMinutes,
        status: 'queued',
      };
    } catch (err) {
      console.error('[AnalysisQueue] enqueueAttempt error:', err);
      return null;
    }
  }

  /**
   * Process queue items one at a time
   */
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const attemptId = this.queue.shift();

    try {
      console.log(`[AnalysisQueue] Processing attempt ${attemptId}...`);
      await this.runAnalysisJob(attemptId);
    } catch (err) {
      console.error(`[AnalysisQueue] Failed processing attempt ${attemptId}:`, err);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 1000);
      }
    }
  }

  /**
   * Run the actual analysis and mistake insight generation
   */
  async runAnalysisJob(attemptId) {
    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) return;

    attempt.aiAnalysisStatus = 'processing';
    await attempt.save();

    const incorrectAnswers = attempt.answers.filter((a) => !a.isCorrect && !a.isSkipped);

    if (incorrectAnswers.length > 0) {
      // Fetch question documents for incorrect answers
      const qIds = incorrectAnswers.map((a) => a.questionId);
      const questions = await Question.find({ _id: { $in: qIds } }).select('+correctOption +explanation').lean();
      const qMap = {};
      questions.forEach((q) => { qMap[q._id.toString()] = q; });

      // Build payload for AI mistake analysis
      const questionsToAnalyze = incorrectAnswers.slice(0, 5).map((ans) => {
        const q = qMap[ans.questionId.toString()] || {};
        return {
          id: ans.questionId.toString(),
          questionText: q.questionText || '',
          studentChoice: ans.selectedOption,
          correctChoice: ans.correctOption,
          explanation: q.explanation || '',
        };
      });

      try {
        const aiPrompt = `Analyze the student's incorrect answers in a school exam and provide a brief, constructive mistake reason for each (max 12 words per question, e.g. "Confused sign convention", "Formula correct but calculation error", "Misread question keywords").
Questions:
${JSON.stringify(questionsToAnalyze, null, 2)}

Return JSON in this format:
{
  "mistakes": [
    { "id": "...", "reason": "brief reason" }
  ],
  "studyTip": "A 1-sentence actionable tip"
}`;

        const aiRes = await executeAiJsonWithFailover({
          prompt: aiPrompt,
          systemInstruction: 'You are an empathetic school exam evaluator. Return only valid JSON.',
          taskType: 'fast',
        });

        const mistakesList = aiRes.result?.mistakes || [];
        const mistakeMap = {};
        mistakesList.forEach((m) => {
          if (m.id && m.reason) mistakeMap[m.id] = m.reason;
        });

        // Apply mistake reasons to attempt answers
        attempt.answers.forEach((ans) => {
          if (mistakeMap[ans.questionId.toString()]) {
            ans.mistakeReason = mistakeMap[ans.questionId.toString()];
          } else if (!ans.isCorrect && !ans.isSkipped) {
            ans.mistakeReason = 'Conceptual review recommended for this subtopic.';
          }
        });

        if (aiRes.result?.studyTip) {
          attempt.aiAnalysis.recommendations = attempt.aiAnalysis.recommendations || [];
          if (!attempt.aiAnalysis.recommendations.includes(aiRes.result.studyTip)) {
            attempt.aiAnalysis.recommendations.unshift(aiRes.result.studyTip);
          }
        }
      } catch (aiErr) {
        console.warn('[AnalysisQueue] AI mistake generation warning (fallback applied):', aiErr.message);
        // Fallback heuristic mistake reasons
        attempt.answers.forEach((ans) => {
          if (!ans.isCorrect && !ans.isSkipped) {
            ans.mistakeReason = `Review key principles of ${ans.subtopic || 'this chapter'}.`;
          }
        });
      }
    }

    attempt.aiAnalysisStatus = 'completed';
    attempt.aiAnalysisEta = 'Ready';
    await attempt.save();

    // Create student notification
    try {
      await Notification.create({
        userId: attempt.userId,
        type: 'analysis_ready',
        title: 'Diagnostic Test Analysis Ready!',
        message: `Your AI performance review and PDF report for "${attempt.chapterTitle || attempt.subjectName}" is ready to view.`,
        link: `test-results.html?attemptId=${attempt._id}`,
      });
      console.log(`[AnalysisQueue] Created ready notification for student ${attempt.userId}`);
    } catch (notifErr) {
      console.error('[AnalysisQueue] Notification creation error:', notifErr);
    }
  }
}

export const analysisQueue = new AnalysisQueueService();
export default analysisQueue;
