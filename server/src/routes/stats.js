import { Router } from "express";
import { requireAuth } from "../auth.js";
import { asyncHandler } from "../http.js";

const DAY_MS = 86_400_000;

function localDay(value, timeZoneOffsetMinutes) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return new Date(timestamp + timeZoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function calculateStreak(days, timeZoneOffsetMinutes) {
  if (!days.length) return 0;
  const normalized = new Set(days);
  const cursor = new Date(Date.now() + timeZoneOffsetMinutes * 60_000);
  cursor.setUTCHours(0, 0, 0, 0);
  const today = cursor.toISOString().slice(0, 10);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  const yesterday = cursor.toISOString().slice(0, 10);
  if (!normalized.has(today) && !normalized.has(yesterday)) return 0;
  if (normalized.has(today)) cursor.setUTCDate(cursor.getUTCDate() + 1);

  let streak = 0;
  while (normalized.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function mastery(row) {
  return Math.min(
    100,
    Number(row.repetitions || 0) * 20 + Math.min(20, Number(row.intervalDays || 0) * 2),
  );
}

export function statsRoutes({ db, timeZoneOffsetMinutes = 420 }) {
  const { Word, Structure, Review } = db.models;
  const router = Router();
  router.get("/", requireAuth, asyncHandler(async (req, res) => {
    const userId = String(req.user._id ?? req.user.id);
    const now = new Date();
    const [wordRows, structureRows, reviewRows] = await Promise.all([
      Word.find({ userId }).select("bookmarked dueAt repetitions intervalDays").lean(),
      Structure.find({ userId }).select("bookmarked dueAt repetitions intervalDays").lean(),
      Review.find({ userId }).select("correct reviewedAt").lean(),
    ]);

    const words = wordRows.length;
    const structures = structureRows.length;
    const total = words + structures;
    const allItems = [...wordRows, ...structureRows];
    const bookmarked = allItems.filter((row) => Boolean(row.bookmarked)).length;
    const due = allItems.filter((row) => new Date(row.dueAt).getTime() <= now.getTime()).length;
    const masteryValues = allItems.map(mastery);
    const mastered = masteryValues.filter((value) => value >= 80).length;
    const masteryPoints = masteryValues.reduce((sum, value) => sum + value, 0);

    const today = localDay(now, timeZoneOffsetMinutes);
    const dailyReviews = new Map();
    let correctReviews = 0;
    let reviewedToday = 0;
    for (const review of reviewRows) {
      if (review.correct) correctReviews += 1;
      const day = localDay(review.reviewedAt, timeZoneOffsetMinutes);
      if (day === today) reviewedToday += 1;
      const summary = dailyReviews.get(day) || { reviews: 0, correct: 0 };
      summary.reviews += 1;
      if (review.correct) summary.correct += 1;
      dailyReviews.set(day, summary);
    }

    const shiftedNow = now.getTime() + timeZoneOffsetMinutes * 60_000;
    const weeklyReviews = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(shiftedNow - offset * DAY_MS).toISOString().slice(0, 10);
      const summary = dailyReviews.get(date);
      weeklyReviews.push({ date, reviews: summary?.reviews || 0, correct: summary?.correct || 0 });
    }

    res.json({
      totals: { words, structures, all: total },
      words,
      structures,
      totalWords: words,
      totalStructures: structures,
      bookmarked,
      due,
      dueToday: due,
      reviewedToday,
      reviews: reviewRows.length,
      mastered,
      masteryPercent: total ? Math.round((mastered / total) * 100) : 0,
      averageMastery: total ? Math.round(masteryPoints / total) : 0,
      streak: calculateStreak([...dailyReviews.keys()], timeZoneOffsetMinutes),
      accuracy: reviewRows.length ? Math.round((correctReviews / reviewRows.length) * 100) : 0,
      weeklyReviews,
      timeZoneOffsetMinutes,
    });
  }));
  return router;
}
