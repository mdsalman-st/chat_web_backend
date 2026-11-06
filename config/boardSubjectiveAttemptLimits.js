export const BOARD_SUBJECTIVE_ATTEMPT_LIMITS = Object.freeze({
  ncert_default: Object.freeze({
    shortCount: 10,
    shortAttemptLimit: 10,
    longCount: 4,
    longAttemptLimit: 4,
  }),
  bseb: Object.freeze({
    shortCount: 30,
    shortAttemptLimit: 15,
    longCount: 8,
    longAttemptLimit: 4,
  }),
  cbse: Object.freeze({
    shortCount: 15,
    shortAttemptLimit: 15,
    longCount: 6,
    longAttemptLimit: 6,
  }),
  up_board: Object.freeze({
    shortCount: 10,
    shortAttemptLimit: 10,
    longCount: 5,
    longAttemptLimit: 5,
  }),
});

export function withResolvedSubjectiveAttemptLimits(boardConfig) {
  const configuredLimits = BOARD_SUBJECTIVE_ATTEMPT_LIMITS[boardConfig?.code];
  if (!configuredLimits) return boardConfig;

  const paperPattern = { ...(boardConfig.paperPattern || {}) };
  for (const section of ['short', 'long']) {
    const countField = `${section}Count`;
    const limitField = `${section}AttemptLimit`;
    if (paperPattern[limitField] != null || Number(paperPattern[countField]) !== configuredLimits[countField]) {
      continue;
    }
    paperPattern[limitField] = configuredLimits[limitField];
  }

  return { ...boardConfig, paperPattern };
}
