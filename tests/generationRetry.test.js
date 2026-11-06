import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import TestAttempt from '../models/TestAttempt.js';
import GenerationJob from '../models/GenerationJob.js';
import { finishTest, retryAttemptGeneration } from '../controllers/testController.js';

const originalMethods = {
  attemptFindOne: TestAttempt.findOne,
  jobFindOne: GenerationJob.findOne,
  jobFindOneAndUpdate: GenerationJob.findOneAndUpdate,
  jobFindById: GenerationJob.findById,
};

afterEach(() => {
  TestAttempt.findOne = originalMethods.attemptFindOne;
  GenerationJob.findOne = originalMethods.jobFindOne;
  GenerationJob.findOneAndUpdate = originalMethods.jobFindOneAndUpdate;
  GenerationJob.findById = originalMethods.jobFindById;
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
    stream: null,
    subjectCode: 'sci',
    chapterNumber: 1,
    medium: 'Hindi',
    isHardMode: false,
    generationJobId: 'job-1',
    ...overrides,
  };
}

function makeJob(overrides = {}) {
  return {
    _id: 'job-1',
    status: 'failed',
    progressMessage: 'Provider request failed',
    ...overrides,
  };
}

test('retry queues the failed job using the owned attempt scope', async () => {
  const attempt = makeAttempt();
  const failedJob = makeJob();
  const queuedJob = makeJob({
    status: 'queued',
    progressMessage: 'Retry queued. Existing questions and answers will be preserved.',
  });
  let updateQuery;
  let update;

  TestAttempt.findOne = async () => attempt;
  GenerationJob.findOne = () => ({ lean: async () => failedJob });
  GenerationJob.findOneAndUpdate = async (query, payload) => {
    updateQuery = query;
    update = payload;
    return queuedJob;
  };

  const response = makeResponse();
  await retryAttemptGeneration({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.status, 'queued');
  assert.equal(response.payload.jobId, queuedJob._id);
  assert.equal(updateQuery.status, 'failed');
  assert.equal(updateQuery.userId, undefined);
  assert.equal(update.$set.status, 'queued');
  assert.equal(update.$set.error, null);
});

test('retry rejects attempts not owned by the current student', async () => {
  let jobLookupCalled = false;
  TestAttempt.findOne = async () => null;
  GenerationJob.findOne = () => {
    jobLookupCalled = true;
    return { lean: async () => makeJob() };
  };

  const response = makeResponse();
  await retryAttemptGeneration({
    params: { attemptId: 'attempt-1' },
    user: { _id: 'another-student' },
  }, response);

  assert.equal(response.statusCode, 404);
  assert.equal(jobLookupCalled, false);
});

test('failed generation cannot be submitted as an incomplete exam', async () => {
  const attempt = makeAttempt();
  TestAttempt.findOne = async () => attempt;
  GenerationJob.findById = () => ({ lean: async () => makeJob() });

  const response = makeResponse();
  await finishTest({
    params: { attemptId: attempt._id },
    user: { _id: attempt.userId },
    body: {},
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.payload.error, /retry generation/i);
});
