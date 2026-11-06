import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import GenerationJob from '../models/GenerationJob.js';
import TestAttempt from '../models/TestAttempt.js';
import {
  buildChapterJobKey,
  getAutomaticGenerationRetryAt,
  getNextGenerationBatch,
  recoverFailedActiveAttemptJobs,
} from '../services/questionGenerator.js';

const originalDistinct = TestAttempt.distinct;
const originalUpdateMany = GenerationJob.updateMany;

afterEach(() => {
  TestAttempt.distinct = originalDistinct;
  GenerationJob.updateMany = originalUpdateMany;
});

const jobScope = {
  boardCode: 'bseb',
  classLevel: '10',
  stream: null,
  subjectCode: 'sci',
  chapterNumber: 1,
  medium: 'Hindi',
};

test('MCQ practice jobs have a distinct key from board-exam generation', () => {
  const examKey = buildChapterJobKey(jobScope);
  const practiceKey = buildChapterJobKey({ ...jobScope, generationMode: 'mcq_practice' });

  assert.notEqual(practiceKey, examKey);
  assert.equal(practiceKey, `${examKey}_mcq_practice`);
});

test('generation and attempt schemas persist MCQ practice modes', () => {
  assert.ok(GenerationJob.schema.path('generationMode').enumValues.includes('mcq_practice'));
  assert.ok(TestAttempt.schema.path('testType').enumValues.includes('chapter_mcq_practice'));
});

test('generation retries indefinitely with exponential backoff capped at five minutes', () => {
  const now = 1_800_000_000_000;

  assert.equal(getAutomaticGenerationRetryAt(0, now).getTime(), now + 30_000);
  assert.equal(getAutomaticGenerationRetryAt(1, now).getTime(), now + 60_000);
  assert.equal(getAutomaticGenerationRetryAt(2, now).getTime(), now + 120_000);
  assert.equal(getAutomaticGenerationRetryAt(3, now).getTime(), now + 240_000);
  assert.equal(getAutomaticGenerationRetryAt(4, now).getTime(), now + 300_000);
  assert.equal(getAutomaticGenerationRetryAt(100, now).getTime(), now + 300_000);
});

test('generation schedules one bounded batch at a time, prioritizing exam MCQs', () => {
  assert.deepEqual(
    getNextGenerationBatch({ mcq: 0, short: 0, long: 0 }, { mcq: 100, short: 30, long: 8 }),
    { stage: 'mcq', batchSize: 3 },
  );
  assert.deepEqual(
    getNextGenerationBatch({ mcq: 99, short: 0, long: 0 }, { mcq: 100, short: 30, long: 8 }),
    { stage: 'mcq', batchSize: 1 },
  );
  assert.deepEqual(
    getNextGenerationBatch({ mcq: 100, short: 0, long: 0 }, { mcq: 100, short: 30, long: 8 }),
    { stage: 'short', batchSize: 2 },
  );
  assert.equal(
    getNextGenerationBatch({ mcq: 100, short: 30, long: 8 }, { mcq: 100, short: 30, long: 8 }),
    null,
  );
});

test('failed jobs for active attempts are automatically returned to the queue', async () => {
  let updateQuery;
  let update;
  TestAttempt.distinct = async () => ['job-1'];
  GenerationJob.updateMany = async (query, payload) => {
    updateQuery = query;
    update = payload;
    return { modifiedCount: 1 };
  };

  assert.equal(await recoverFailedActiveAttemptJobs(), 1);
  assert.deepEqual(updateQuery, { _id: { $in: ['job-1'] }, status: 'failed' });
  assert.equal(update.$set.status, 'queued');
  assert.equal(update.$set.nextRetryAt, null);
  assert.match(update.$set.progressMessage, /active exam/i);
});
