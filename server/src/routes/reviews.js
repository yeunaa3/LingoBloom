import { Router } from "express";
import { requireAuth } from "../auth.js";
import { ApiError, asyncHandler, boolean, pagination, resourceId } from "../http.js";
import { structure as serializeStructure, word as serializeWord } from "../serializers.js";

const ratingNames = { again: 0, hard: 1, good: 2, easy: 3 };

function parseRating(value) {
  const rating = typeof value === "string" && value in ratingNames ? ratingNames[value] : Number(value);
  if (!Number.isInteger(rating) || rating < 0 || rating > 3) {
    throw new ApiError(400, "INVALID_RATING", "Mức ôn tập phải là again, hard, good, easy hoặc số từ 0 đến 3.");
  }
  return rating;
}

function schedule(row, rating, reviewedAt) {
  let repetitions = Number(row.repetitions || 0);
  let intervalDays;
  let easeFactor = Number(row.easeFactor ?? 2.5);

  if (rating === 0) {
    repetitions = 0;
    intervalDays = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 1) {
    repetitions += 1;
    intervalDays = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === 2) {
    repetitions += 1;
    intervalDays = 3;
  } else {
    repetitions += 1;
    easeFactor = Math.min(3.2, easeFactor + 0.15);
    intervalDays = 7;
  }

  const delayMs = rating === 0 ? 10 * 60 * 1000 : intervalDays * 86_400_000;

  return {
    repetitions,
    intervalDays: Math.round(intervalDays * 100) / 100,
    easeFactor: Math.round(easeFactor * 100) / 100,
    dueAt: new Date(reviewedAt.getTime() + delayMs).toISOString(),
  };
}

function cardFromRow(itemType, row) {
  const itemId = String(row._id ?? row.id);
  if (itemType === "word") {
    return {
      itemType,
      itemId,
      front: row.term,
      back: row.translation,
      example: row.example,
      item: serializeWord(row),
    };
  }
  return {
    itemType,
    itemId,
    front: row.pattern,
    back: row.meaning,
    example: row.example,
    item: serializeStructure(row),
  };
}

const authenticatedUserId = (req) => String(req.user._id ?? req.user.id);

export function reviewRoutes({ db }) {
  const { Word, Structure, Review } = db.models;
  const router = Router();
  router.use(requireAuth);

  router.get("/due", asyncHandler(async (req, res) => {
    const { limit } = pagination(req.query);
    const now = new Date();
    const language = String(req.query.language || req.user.learningLanguage || "en").toLowerCase();
    const onlyBookmarked = boolean(req.query.bookmarked, false);
    const userId = authenticatedUserId(req);
    const filter = { userId, language, dueAt: { $lte: now } };
    if (onlyBookmarked) filter.bookmarked = true;

    const [wordRows, structureRows] = await Promise.all([
      Word.find(filter).sort({ dueAt: 1 }).limit(limit).lean(),
      Structure.find(filter).sort({ dueAt: 1 }).limit(limit).lean(),
    ]);
    const queued = [
      ...wordRows.map((row) => ({ itemType: "word", row })),
      ...structureRows.map((row) => ({ itemType: "structure", row })),
    ]
      .sort((a, b) => new Date(a.row.dueAt).getTime() - new Date(b.row.dueAt).getTime())
      .slice(0, limit);
    const cards = queued.map(({ itemType, row }) => cardFromRow(itemType, row));
    res.json({ cards, data: cards, meta: { count: cards.length, language } });
  }));

  router.post("/", asyncHandler(async (req, res) => {
    const normalizedType = String(req.body.itemType || req.body.type || "word").toLowerCase();
    const typeMap = { word: "word", words: "word", structure: "structure", structures: "structure" };
    const itemType = typeMap[normalizedType];
    if (!itemType) throw new ApiError(400, "INVALID_ITEM_TYPE", "Loại thẻ phải là word hoặc structure.");

    const Model = itemType === "word" ? Word : Structure;
    const userId = authenticatedUserId(req);
    const id = resourceId(req.body.itemId ?? req.body.id);
    const rating = parseRating(req.body.rating ?? (req.body.correct === false ? 0 : 2));
    const reviewedAt = new Date();
    let updated;
    let createdReview;
    let next;
    const session = await db.startSession();

    try {
      await session.withTransaction(async () => {
        const row = await Model.findOne({ _id: id, userId }).session(session);
        if (!row) throw new ApiError(404, "NOT_FOUND", "Thẻ ôn tập không tồn tại.");

        next = schedule(row, rating, reviewedAt);
        row.repetitions = next.repetitions;
        row.intervalDays = next.intervalDays;
        row.easeFactor = next.easeFactor;
        row.dueAt = new Date(next.dueAt);
        row.lastReviewedAt = reviewedAt;
        await row.save({ session });
        [createdReview] = await Review.create([{
          userId,
          itemType,
          itemId: id,
          rating,
          correct: rating >= 2,
          reviewedAt,
          nextDueAt: new Date(next.dueAt),
        }], { session });
        updated = row.toObject();
      });
    } finally {
      await session.endSession();
    }

    res.status(201).json({
      review: {
        id: String(createdReview._id ?? createdReview.id),
        itemType,
        itemId: id,
        rating,
        correct: rating >= 2,
        reviewedAt: reviewedAt.toISOString(),
        nextDueAt: next.dueAt,
      },
      schedule: next,
      item: itemType === "word" ? serializeWord(updated) : serializeStructure(updated),
    });
  }));

  return router;
}
