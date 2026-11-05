import BoardConfig from '../models/BoardConfig.js';
import Chapter from '../models/Chapter.js';
import { normalizeMedium } from './medium.js';

/**
 * Board Engine — The core dynamic engine for Nexus Test Module.
 * ZERO board names, subjects, classes or patterns are hardcoded here.
 * Everything is resolved dynamically from the BoardConfig database collection.
 */

/**
 * Fetch resolved board configuration.
 * If board config does not exist, seamlessly falls back to NCERT Default.
 */
export async function getResolvedBoardConfig(boardCode) {
  let config = null;

  if (boardCode && boardCode !== 'other' && boardCode !== 'custom') {
    config = await BoardConfig.findOne({
      code: String(boardCode).toLowerCase().trim(),
      isActive: true,
    }).lean();
  }

  if (config) {
    return {
      ...config,
      isUsingFallback: false,
      fallbackNotice: null,
    };
  }

  // Fallback to NCERT default pattern
  const fallback = await BoardConfig.findOne({ isFallback: true, isActive: true }).lean() ||
                   await BoardConfig.findOne({ code: 'ncert_default' }).lean();

  if (!fallback) {
    throw new Error('Default NCERT board configuration is missing. Please run database seeders.');
  }

  return {
    ...fallback,
    isUsingFallback: true,
    fallbackNotice: 'Using default NCERT curriculum pattern (custom board configuration not found).',
  };
}

/**
 * Get available classes for a board
 */
export function getAvailableClasses(boardConfig) {
  if (!boardConfig || !Array.isArray(boardConfig.classes)) return [];
  return boardConfig.classes.map((c) => ({
    classLevel: c.classLevel,
    name: c.name,
    hindiName: c.hindiName,
    hasStreams: !!c.hasStreams,
    order: c.order || 1,
  })).sort((a, b) => a.order - b.order);
}

/**
 * Get streams available for a specific class (e.g. Class 11 or 12)
 */
export function getStreamsForClass(boardConfig, classLevel) {
  if (!boardConfig || !Array.isArray(boardConfig.classes)) return [];
  const cls = boardConfig.classes.find((c) => String(c.classLevel) === String(classLevel));
  if (!cls || !cls.hasStreams || !Array.isArray(cls.streams)) return [];
  return cls.streams.map((s) => ({
    streamId: s.streamId,
    name: s.name,
    hindiName: s.hindiName,
  }));
}

/**
 * Get subjects available for a class and optional stream
 */
export function getSubjectsForClass(boardConfig, classLevel, streamId) {
  if (!boardConfig || !Array.isArray(boardConfig.classes)) return [];
  const cls = boardConfig.classes.find((c) => String(c.classLevel) === String(classLevel));
  if (!cls) return [];

  if (cls.hasStreams) {
    if (!streamId && cls.streams.length > 0) {
      // Default to first stream if not specified
      return cls.streams[0].subjects || [];
    }
    const safeStreamId = String(streamId || '').toLowerCase().trim();
    const stream = cls.streams.find((s) => String(s.streamId || '').toLowerCase().trim() === safeStreamId);
    return stream ? stream.subjects : [];
  }

  return cls.subjects || [];
}

/**
 * Get chapters for a subject with fallback support
 */
function preferredChapters(chapters, medium) {
  const byChapterNumber = new Map();
  for (const chapter of chapters) {
    const current = byChapterNumber.get(chapter.chapterNumber);
    const rank = chapter.medium === medium ? 2 : chapter.medium === 'Both' ? 1 : 0;
    const currentRank = current
      ? (current.medium === medium ? 2 : current.medium === 'Both' ? 1 : 0)
      : -1;
    if (rank > currentRank) byChapterNumber.set(chapter.chapterNumber, chapter);
  }
  return [...byChapterNumber.values()].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

async function findChaptersForBoard({ boardCode, query, medium }) {
  const chapters = await Chapter.find({
    boardCode,
    ...query,
    medium: { $in: [medium, 'Both', null] },
  })
    .sort({ chapterNumber: 1 })
    .lean();
  return preferredChapters(chapters, medium);
}

export async function getChapterForMedium({
  boardCode,
  classLevel,
  subjectCode,
  chapterNumber,
  stream,
  medium = 'Hindi',
}) {
  const normalizedMedium = normalizeMedium(medium);
  if (!normalizedMedium) throw new Error(`Unsupported medium: ${medium}`);

  const query = {
    classLevel: String(classLevel),
    subjectCode: String(subjectCode).toLowerCase().trim(),
    chapterNumber: Number(chapterNumber),
    isActive: true,
  };
  if (stream) query.stream = stream;

  const normalizedBoardCode = String(boardCode).toLowerCase().trim();
  const boardCodes = normalizedBoardCode === 'ncert_default'
    ? ['ncert_default']
    : [normalizedBoardCode, 'ncert_default'];

  const candidates = [];
  for (const code of boardCodes) {
    candidates.push(...await findChaptersForBoard({ boardCode: code, query, medium: normalizedMedium }));
  }
  return preferredChapters(candidates, normalizedMedium)[0] || null;
}

export async function getChaptersForSubject({
  boardCode,
  classLevel,
  subjectCode,
  stream,
  phase,
  medium = 'Hindi',
}) {
  const normalizedMedium = normalizeMedium(medium);
  if (!normalizedMedium) throw new Error(`Unsupported medium: ${medium}`);

  const query = {
    classLevel: String(classLevel),
    subjectCode: String(subjectCode).toLowerCase().trim(),
    isActive: true,
  };

  if (stream) query.stream = stream;

  // First try board specific chapters
  const normalizedBoardCode = String(boardCode).toLowerCase().trim();
  const boardChapters = await findChaptersForBoard({
    boardCode: normalizedBoardCode,
    query,
    medium: normalizedMedium,
  });

  const fallbackChapters = normalizedBoardCode === 'ncert_default'
    ? []
    : await findChaptersForBoard({
      boardCode: 'ncert_default',
      query,
      medium: normalizedMedium,
    });
  let chapters = preferredChapters([...boardChapters, ...fallbackChapters], normalizedMedium);
  const usedFallbackChapters = chapters.some(chapter => chapter.boardCode === 'ncert_default')
    && normalizedBoardCode !== 'ncert_default';

  // Filter by phase if specified
  if (phase && chapters.length > 0) {
    const phaseWeights = { quarterly: 1, half_yearly: 2, sent_up: 3, annual: 4 };
    const currentWeight = phaseWeights[phase] || 4;
    chapters = chapters.filter((ch) => {
      const chWeight = phaseWeights[ch.phaseCutoff] || 4;
      return chWeight <= currentWeight;
    });
  }

  return {
    chapters,
    usedFallbackChapters,
  };
}
