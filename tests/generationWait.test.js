import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import TestAttempt from '../models/TestAttempt.js';
import { updateAttemptState } from '../controllers/testController.js';

const originalFindOne = TestAttempt.findOne;

afterEach(() => {
  TestAttempt.findOne = originalFindOne;
});

function makeResponse() {
  return {
    statusCode: 200,
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

test('generation wait pauses and then extends the exam deadline by the exact wait duration', async () => {
  const attempt = {
    _id: 'attempt-1',
    userId: 'student-1',
    status: 'in_progress',
    testType: 'chapter_practice',
    generationJobId: 'job-1',
    currentQuestionIndex: 1,
    totalQuestions: 2,
    currentSection: 'mcq',
    deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
    generationWaitStartedAt: null,
    generationWaitDurationMs: 0,
    async save() {},
  };
  TestAttempt.findOne = async () => attempt;

  const pausedResponse = makeResponse();
  await updateAttemptState({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
    body: { currentQuestionIndex: 1, generationWaiting: true },
  }, pausedResponse);
  assert.equal(pausedResponse.statusCode, 200);
  assert.ok(attempt.generationWaitStartedAt instanceof Date);

  const waitStartedAt = new Date(Date.now() - 60_000);
  attempt.generationWaitStartedAt = waitStartedAt;
  const originalDeadline = attempt.deadlineAt.getTime();
  const resumedResponse = makeResponse();
  await updateAttemptState({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
    body: { generationWaiting: false },
  }, resumedResponse);

  const extendedMs = attempt.deadlineAt.getTime() - originalDeadline;
  assert.equal(resumedResponse.statusCode, 200);
  assert.ok(extendedMs >= 60_000);
  assert.equal(attempt.generationWaitDurationMs, extendedMs);
  assert.equal(attempt.generationWaitStartedAt, null);
  assert.equal(new Date(resumedResponse.payload.deadlineAt).getTime(), attempt.deadlineAt.getTime());
});
