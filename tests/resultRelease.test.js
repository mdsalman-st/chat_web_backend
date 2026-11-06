import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWER_SHEET_UPLOAD_GRACE_MS,
  RESULT_RELEASE_DELAY_MS,
  getResultReleaseState,
} from '../utils/resultRelease.js';

const finishedAt = new Date('2025-01-01T10:00:00.000Z');
const deadlineAt = new Date('2025-01-01T13:00:00.000Z');

test('objective-only results remain hidden for one hour', () => {
  const attempt = { finishedAt, resultReleaseAt: new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS) };

  assert.equal(getResultReleaseState(attempt, null, new Date('2025-01-01T10:59:59.000Z')).available, false);
  assert.equal(getResultReleaseState(attempt, null, new Date('2025-01-01T11:00:00.000Z')).available, true);
});

test('MCQ chapter practice releases its deterministic result immediately', () => {
  const attempt = { testType: 'chapter_mcq_practice', finishedAt };

  assert.equal(getResultReleaseState(attempt, null, finishedAt).available, true);
  assert.equal(getResultReleaseState(attempt, null, new Date(finishedAt.getTime() - 1)).available, false);
});

test('subjective results wait for evaluation after the result delay', () => {
  const attempt = {
    finishedAt,
    deadlineAt,
    resultReleaseAt: new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS),
    subjectiveRequired: true,
  };

  assert.equal(getResultReleaseState(attempt, { status: 'evaluating' }, new Date('2025-01-01T14:00:00.000Z')).available, false);
  assert.equal(getResultReleaseState(attempt, { status: 'completed' }, new Date('2025-01-01T11:00:00.000Z')).available, true);
});

test('no submitted answer sheet stops blocking after the upload grace period', () => {
  const attempt = {
    finishedAt,
    deadlineAt,
    resultReleaseAt: new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS),
    subjectiveRequired: true,
  };

  assert.equal(
    getResultReleaseState(attempt, null, new Date(deadlineAt.getTime() + ANSWER_SHEET_UPLOAD_GRACE_MS - 1)).available,
    false,
  );
  assert.equal(
    getResultReleaseState(attempt, null, new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS)).available,
    false,
  );
  assert.equal(
    getResultReleaseState(attempt, null, new Date(deadlineAt.getTime() + ANSWER_SHEET_UPLOAD_GRACE_MS)).available,
    true,
  );
});

test('generation-extended answer-sheet deadlines keep results pending until the actual upload window closes', () => {
  const attempt = {
    finishedAt,
    deadlineAt,
    subjectiveUploadDeadlineAt: new Date(deadlineAt.getTime() + 30 * 60 * 1000),
    resultReleaseAt: new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS),
    subjectiveRequired: true,
  };

  assert.equal(getResultReleaseState(attempt, null, new Date('2025-01-01T13:10:00.000Z')).available, false);
  assert.equal(getResultReleaseState(attempt, null, new Date('2025-01-01T13:30:00.000Z')).available, true);
});

test('failed or unlinked answer-sheet evaluation does not produce a result', () => {
  const attempt = {
    finishedAt,
    resultReleaseAt: new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS),
    subjectiveRequired: true,
    subjectiveSubmissionId: 'submission-id',
  };
  const now = new Date('2025-01-01T11:00:00.000Z');

  assert.equal(getResultReleaseState(attempt, { status: 'failed' }, now).available, false);
  assert.equal(getResultReleaseState(attempt, null, now).subjectiveStatus, 'evaluation_missing');
  assert.equal(getResultReleaseState(null, null, now).available, false);
});
