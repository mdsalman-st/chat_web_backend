import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSubjectiveQuestionsByAnswerOrder } from '../services/handwritingEvaluator.js';

const writtenQuestions = [
  { questionNumber: 1, questionType: 'short', maxMarks: 2 },
  { questionNumber: 2, questionType: 'short', maxMarks: 2 },
  { questionNumber: 3, questionType: 'short', maxMarks: 2 },
  { questionNumber: 4, questionType: 'long', maxMarks: 5 },
  { questionNumber: 5, questionType: 'long', maxMarks: 5 },
];

test('subjective attempt limits use first detected answer order separately by question type', () => {
  const selection = selectSubjectiveQuestionsByAnswerOrder(writtenQuestions, [
    { ocrText: 'Q. 3 answer\nप्रश्न 5 उत्तर\nQ1 answer', detectedQuestions: [] },
    { ocrText: 'Answer to Q.2', detectedQuestions: [] },
  ], {
    shortCount: 3,
    shortAttemptLimit: 2,
    longCount: 2,
    longAttemptLimit: 1,
    shortMarks: 2,
    longMarks: 5,
  });

  assert.deepEqual(selection.detectedOrder, [3, 5, 1, 2]);
  assert.deepEqual(selection.questionsToEvaluate.map((question) => question.questionNumber), [1, 3, 5]);
  assert.equal(selection.totalMaxMarks, 9);
});

test('subjective answer numbers reported by OCR preserve order and normalize Hindi digits', () => {
  const selection = selectSubjectiveQuestionsByAnswerOrder(writtenQuestions, [
    { ocrText: '', detectedQuestions: [5, '३', 1] },
  ], {
    shortCount: 3,
    shortAttemptLimit: 1,
    longCount: 2,
    longAttemptLimit: 1,
    shortMarks: 2,
    longMarks: 5,
  });

  assert.deepEqual(selection.detectedOrder, [5, 3, 1]);
  assert.deepEqual(selection.questionsToEvaluate.map((question) => question.questionNumber), [3, 5]);
});

test('subjective evaluation does not infer a question order from unnumbered handwriting', () => {
  const selection = selectSubjectiveQuestionsByAnswerOrder(writtenQuestions, [
    { ocrText: 'An unnumbered written answer.', detectedQuestions: [] },
  ]);

  assert.deepEqual(selection.detectedOrder, []);
  assert.deepEqual(selection.questionsToEvaluate, []);
});
