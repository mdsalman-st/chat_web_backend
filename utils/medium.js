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

export function chapterTitleForMedium(chapter, medium) {
  if (medium === 'Hindi' && (!chapter.medium || chapter.medium === 'Both') && chapter.hindiTitle) {
    return chapter.hindiTitle;
  }
  return chapter.title;
}
