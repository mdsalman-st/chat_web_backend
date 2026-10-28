import BoardConfig from '../models/BoardConfig.js';
import Chapter from '../models/Chapter.js';

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
    const stream = cls.streams.find((s) => s.streamId === streamId);
    return stream ? stream.subjects : [];
  }

  return cls.subjects || [];
}

/**
 * Get chapters for a subject with fallback support
 */
export async function getChaptersForSubject({ boardCode, classLevel, subjectCode, stream, phase }) {
  const query = {
    classLevel: String(classLevel),
    subjectCode: String(subjectCode).toLowerCase().trim(),
    isActive: true,
  };

  if (stream) query.stream = stream;

  // First try board specific chapters
  let chapters = await Chapter.find({
    boardCode: String(boardCode).toLowerCase().trim(),
    ...query,
  })
    .sort({ chapterNumber: 1 })
    .lean();

  // If no chapters found for this board, fall back to ncert_default chapters
  let usedFallbackChapters = false;
  if (!chapters || chapters.length === 0) {
    chapters = await Chapter.find({
      boardCode: 'ncert_default',
      ...query,
    })
      .sort({ chapterNumber: 1 })
      .lean();
    if (chapters && chapters.length > 0) {
      usedFallbackChapters = true;
    }
  }

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
