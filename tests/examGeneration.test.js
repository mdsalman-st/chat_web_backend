import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import TestAttempt from '../models/TestAttempt.js';
import Question from '../models/Question.js';
import GenerationJob from '../models/GenerationJob.js';
import { syncAttemptQuestions } from '../controllers/testController.js';

const originalMethods = {
  attemptFindOne: TestAttempt.findOne,
  attemptFindOneAndUpdate: TestAttempt.findOneAndUpdate,
  attemptUpdateOne: TestAttempt.updateOne,
  questionFind: Question.find,
  jobFindOne: GenerationJob.findOne,
};

afterEach(() => {
  TestAttempt.findOne = originalMethods.attemptFindOne;
  TestAttempt.findOneAndUpdate = originalMethods.attemptFindOneAndUpdate;
  TestAttempt.updateOne = originalMethods.attemptUpdateOne;
  Question.find = originalMethods.questionFind;
  GenerationJob.findOne = originalMethods.jobFindOne;
});

function makeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function makeAttempt(overrides = {}) {
  return {
    _id: 'attempt-1',
    userId: 'student-1',
    status: 'in_progress',
    testType: 'chapter_practice',
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    chapterNumber: 1,
    medium: 'Hindi',
    isHardMode: false,
    generationJobId: '507f1f77bcf86cd799439013',
    questionIds: ['507f1f77bcf86cd799439011'],
    totalQuestions: 1,
    ...overrides,
  };
}

function makeJob(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439013',
    boardCode: 'bseb',
    classLevel: '10',
    subjectCode: 'sci',
    chapterNumber: 1,
    medium: 'Hindi',
    isHardMode: false,
    status: 'running',
    progressPercent: 50,
    progressMessage: 'Generating MCQs',
    targetCount: 3,
    targetShortCount: 1,
    verifiedCount: 2,
    error: null,
    ...overrides,
  };
}

test('sync appends new verified questions without exposing answer keys', async () => {
  const attempt = makeAttempt();
  const newQuestion = {
    _id: '507f1f77bcf86cd799439012',
    questionText: 'New question',
    options: [{ key: 'A', text: 'Choice' }],
    correctOption: 'A',
    type: 'mcq',
    marks: 1,
    createdAt: new Date(),
  };
  const newSubjectiveQuestion = {
    _id: '507f1f77bcf86cd799439014',
    questionText: 'Explain the concept',
    type: 'short',
    marks: 2,
    modelAnswer: 'Hidden model answer',
  };
  let updateQuery;
  let updatePayload;
  let savedAttempt;

  TestAttempt.findOne = async () => attempt;
  TestAttempt.findOneAndUpdate = async (query, payload) => {
    updateQuery = query;
    updatePayload = payload;
    return {
      ...attempt,
      questionIds: [...attempt.questionIds, newQuestion._id, newSubjectiveQuestion._id],
      async save() {
        savedAttempt = this;
      },
    };
  };
  GenerationJob.findOne = () => ({ lean: async () => makeJob() });
  let questionFindCount = 0;
  Question.find = () => {
    questionFindCount++;
    let candidatesQuery = false;
    return {
      select() {
        return this;
      },
      sort() {
        candidatesQuery = true;
        return this;
      },
      lean: async () => {
        if (questionFindCount === 1) return [{ _id: attempt.questionIds[0], type: 'mcq' }];
        if (candidatesQuery) return [newQuestion, newSubjectiveQuestion];
        return [
          { _id: attempt.questionIds[0], type: 'mcq' },
          { _id: newQuestion._id, type: 'mcq' },
          { _id: newSubjectiveQuestion._id, type: 'short' },
        ];
      },
    };
  };

  const response = makeResponse();
  await syncAttemptQuestions({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.addedQuestions.length, 1);
  assert.equal(response.payload.addedSubjectiveQuestions.length, 1);
  assert.equal(response.payload.addedQuestions[0].id, newQuestion._id);
  assert.equal(response.payload.addedSubjectiveQuestions[0].id, newSubjectiveQuestion._id);
  assert.equal('correctOption' in response.payload.addedQuestions[0], false);
  assert.equal('modelAnswer' in response.payload.addedSubjectiveQuestions[0], false);
  assert.deepEqual(updatePayload.$addToSet.questionIds.$each, [newQuestion._id, newSubjectiveQuestion._id]);
  assert.equal(String(updateQuery.userId), attempt.userId);
  assert.equal(savedAttempt.totalQuestions, 2);
  assert.equal(savedAttempt.subjectiveRequired, true);
  assert.equal(response.payload.generationJob.status, 'running');
});

test('sync does not mutate an attempt without a linked generation job', async () => {
  const attempt = makeAttempt({ generationJobId: null });
  TestAttempt.findOne = async () => attempt;

  const response = makeResponse();
  await syncAttemptQuestions({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.addedQuestions, []);
  assert.equal(response.payload.generationJob, null);
});

test('sync rejects a job whose scope does not match the attempt', async () => {
  const attempt = makeAttempt();
  TestAttempt.findOne = async () => attempt;
  GenerationJob.findOne = () => ({ lean: async () => null });

  const response = makeResponse();
  await syncAttemptQuestions({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.payload.error, /does not match/i);
});
