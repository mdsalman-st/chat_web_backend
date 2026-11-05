export const SUPPORTED_MEDIUMS = Object.freeze([
  'English',
  'Assamese',
  'Bengali',
  'Bodo',
  'Dogri',
  'Gujarati',
  'Hindi',
  'Kannada',
  'Kashmiri',
  'Konkani',
  'Maithili',
  'Malayalam',
  'Manipuri',
  'Marathi',
  'Nepali',
  'Odia',
  'Punjabi',
  'Sanskrit',
  'Santali',
  'Sindhi',
  'Tamil',
  'Telugu',
  'Urdu',
]);

export const CHAPTER_MEDIUMS = Object.freeze([...SUPPORTED_MEDIUMS, 'Both']);

export function normalizeMedium(value, { allowBoth = false } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (allowBoth && normalized === 'both') return 'Both';
  return SUPPORTED_MEDIUMS.find((medium) => medium.toLowerCase() === normalized) || null;
}

/**
 * Returns the chapter title appropriate for the user's chosen medium.
 * - Hindi medium → show hindiTitle (fallback to title)
 * - English or any other medium → show title (fallback to hindiTitle if title looks Hindi)
 */
export function chapterTitleForMedium(chapter, medium) {
  if (medium === 'Hindi') {
    // Hindi medium: prefer hindiTitle, fallback to title
    return chapter.hindiTitle || chapter.title;
  }
  // English or other medium: prefer title, fallback to hindiTitle
  return chapter.title || chapter.hindiTitle;
}
