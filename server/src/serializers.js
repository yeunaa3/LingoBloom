const raw = (value) => (typeof value?.toObject === "function" ? value.toObject() : value);
const iso = (value) => (value ? new Date(value).toISOString() : null);

const masteryOf = (item) => Math.min(
  100,
  Math.round(Number(item.repetitions || 0) * 20 + Math.min(20, Number(item.intervalDays || 0) * 2)),
);

export function word(value) {
  const row = raw(value);
  const id = String(row._id ?? row.id);
  return {
    id,
    term: row.term,
    word: row.term,
    translation: row.translation,
    meaning: row.translation,
    pronunciation: row.pronunciation || "",
    partOfSpeech: row.partOfSpeech || "",
    example: row.example || "",
    notes: row.notes || "",
    source: row.source || "manual",
    language: row.language,
    learningLanguage: row.language,
    nativeLanguage: row.nativeLanguage,
    bookmarked: Boolean(row.bookmarked),
    repetitions: Number(row.repetitions || 0),
    intervalDays: Number(row.intervalDays || 0),
    easeFactor: Number(row.easeFactor || 2.5),
    dueAt: iso(row.dueAt),
    nextReviewAt: iso(row.dueAt),
    mastery: masteryOf(row),
    lastReviewedAt: iso(row.lastReviewedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function structure(value) {
  const row = raw(value);
  const id = String(row._id ?? row.id);
  return {
    id,
    pattern: row.pattern,
    structure: row.pattern,
    meaning: row.meaning,
    translation: row.meaning,
    example: row.example || "",
    notes: row.notes || "",
    language: row.language,
    learningLanguage: row.language,
    bookmarked: Boolean(row.bookmarked),
    repetitions: Number(row.repetitions || 0),
    intervalDays: Number(row.intervalDays || 0),
    easeFactor: Number(row.easeFactor || 2.5),
    dueAt: iso(row.dueAt),
    nextReviewAt: iso(row.dueAt),
    mastery: masteryOf(row),
    lastReviewedAt: iso(row.lastReviewedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
