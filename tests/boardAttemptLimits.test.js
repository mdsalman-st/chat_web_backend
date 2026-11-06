import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOARD_SUBJECTIVE_ATTEMPT_LIMITS,
  withResolvedSubjectiveAttemptLimits,
} from '../config/boardSubjectiveAttemptLimits.js';

const BOARD_MARKS = {
  ncert_default: { mcqCount: 40, attemptLimit: 40, marksPerMcq: 1, shortMarks: 2, longMarks: 5, totalMarks: 80 },
  bseb: { mcqCount: 100, attemptLimit: 50, marksPerMcq: 1, shortMarks: 2, longMarks: 5, totalMarks: 100 },
  cbse: { mcqCount: 20, attemptLimit: 20, marksPerMcq: 1, shortMarks: 2, longMarks: 5, totalMarks: 80 },
  up_board: { mcqCount: 20, attemptLimit: 20, marksPerMcq: 1, shortMarks: 2, longMarks: 6, totalMarks: 70 },
};

test('all configured board attempt limits are present, in range, and preserve declared totals', () => {
  assert.deepEqual(
    Object.keys(BOARD_SUBJECTIVE_ATTEMPT_LIMITS).sort(),
    Object.keys(BOARD_MARKS).sort(),
  );

  for (const [boardCode, pattern] of Object.entries(BOARD_SUBJECTIVE_ATTEMPT_LIMITS)) {
    const marks = BOARD_MARKS[boardCode];
    assert.ok(Number.isInteger(pattern.shortAttemptLimit), `${boardCode} short attempt limit is set`);
    assert.ok(Number.isInteger(pattern.longAttemptLimit), `${boardCode} long attempt limit is set`);
    assert.ok(pattern.shortAttemptLimit > 0 && pattern.shortAttemptLimit <= pattern.shortCount);
    assert.ok(pattern.longAttemptLimit > 0 && pattern.longAttemptLimit <= pattern.longCount);

    const computedTotal = marks.attemptLimit * marks.marksPerMcq
      + pattern.shortAttemptLimit * marks.shortMarks
      + pattern.longAttemptLimit * marks.longMarks;
    assert.equal(computedTotal, marks.totalMarks, `${boardCode} keeps its configured total marks`);
  }
});

test('missing limits resolve for known boards only when their section counts match', () => {
  for (const [boardCode, limits] of Object.entries(BOARD_SUBJECTIVE_ATTEMPT_LIMITS)) {
    const resolved = withResolvedSubjectiveAttemptLimits({
      code: boardCode,
      paperPattern: { shortCount: limits.shortCount, longCount: limits.longCount },
    });
    assert.equal(resolved.paperPattern.shortAttemptLimit, limits.shortAttemptLimit);
    assert.equal(resolved.paperPattern.longAttemptLimit, limits.longAttemptLimit);
  }

  const mismatched = withResolvedSubjectiveAttemptLimits({
    code: 'bseb',
    paperPattern: { shortCount: 29, longCount: 8 },
  });
  assert.equal(mismatched.paperPattern.shortAttemptLimit, undefined);
  assert.equal(mismatched.paperPattern.longAttemptLimit, 4);

  const unknownBoard = { code: 'custom_board', paperPattern: { shortCount: 12, longCount: 4 } };
  assert.equal(withResolvedSubjectiveAttemptLimits(unknownBoard), unknownBoard);
});
