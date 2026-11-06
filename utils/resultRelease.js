export const RESULT_RELEASE_DELAY_MS = 60 * 60 * 1000;
export const ANSWER_SHEET_UPLOAD_GRACE_MS = 5 * 60 * 1000;

export function getResultReleaseState(attempt, submission, now = new Date()) {
  if (!attempt) {
    return {
      available: false,
      resultReleaseAt: null,
      uploadGraceEndsAt: null,
      evaluationComplete: false,
      subjectiveStatus: 'evaluation_missing',
    };
  }

  const finishedAt = attempt.finishedAt ? new Date(attempt.finishedAt) : null;
  const resultReleaseAt = attempt.resultReleaseAt
    ? new Date(attempt.resultReleaseAt)
    : finishedAt
      ? new Date(finishedAt.getTime() + RESULT_RELEASE_DELAY_MS)
      : null;
  const uploadWindowBase = attempt.deadlineAt ? new Date(attempt.deadlineAt) : finishedAt;
  const uploadGraceEndsAt = attempt.subjectiveUploadDeadlineAt
    ? new Date(attempt.subjectiveUploadDeadlineAt)
    : uploadWindowBase
      ? new Date(uploadWindowBase.getTime() + ANSWER_SHEET_UPLOAD_GRACE_MS)
      : null;
  const subjectiveStatus = !attempt.subjectiveRequired
    ? 'not_required'
    : submission?.status || (attempt.subjectiveSubmissionId
      ? 'evaluation_missing'
      : uploadGraceEndsAt && now >= uploadGraceEndsAt
        ? 'not_submitted'
        : 'awaiting_upload');
  const evaluationComplete = !attempt.subjectiveRequired
    || subjectiveStatus === 'completed'
    || subjectiveStatus === 'not_submitted';
  const available = !!finishedAt
    && !!resultReleaseAt
    && now >= resultReleaseAt
    && evaluationComplete;

  return {
    available,
    resultReleaseAt,
    uploadGraceEndsAt,
    evaluationComplete,
    subjectiveStatus,
  };
}
