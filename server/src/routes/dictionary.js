import { Router } from "express";
import { requireAuth } from "../auth.js";
import { normalizeKey } from "../db.js";
import { ApiError, asyncHandler, boolean, text } from "../http.js";
import { word as serializeWord } from "../serializers.js";

const plain = (document) => document?.toObject?.() || document;
const authenticatedUserId = (req) => String(req.user._id ?? req.user.id);

export function dictionaryRoutes({ db, service }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/search",
    asyncHandler(async (req, res) => {
      const query = text(req.query.q, { name: "Từ cần tra", max: 200, required: true });
      const source = text(req.query.source || req.user.learningLanguage, { name: "Ngôn ngữ nguồn", max: 12, required: true }).toLowerCase();
      const target = text(req.query.target || req.user.nativeLanguage, { name: "Ngôn ngữ đích", max: 12, required: true }).toLowerCase();
      const entries = await service.search(query, source, target);
      res.json({
        entries,
        data: entries,
        meta: {
          provider: service.providerName,
          source,
          target,
          note: "Định nghĩa do từ điển đơn ngữ cung cấp; bạn có thể chỉnh nghĩa trước khi lưu.",
        },
      });
    }),
  );

  router.post(
    "/import",
    asyncHandler(async (req, res) => {
      const term = text(req.body.term ?? req.body.word, { name: "Từ cần tra", max: 200, required: true });
      const source = text(req.body.source || req.body.language || req.user.learningLanguage, { name: "Ngôn ngữ nguồn", max: 12, required: true }).toLowerCase();
      const target = text(req.body.target || req.body.nativeLanguage || req.user.nativeLanguage, { name: "Ngôn ngữ đích", max: 12, required: true }).toLowerCase();
      const entries = await service.search(term, source, target);
      if (!entries.length) throw new ApiError(404, "DICTIONARY_ENTRY_NOT_FOUND", "Không tìm thấy từ phù hợp trong từ điển.");
      const entryIndex = Number(req.body.entryIndex ?? 0);
      if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= entries.length) {
        throw new ApiError(400, "INVALID_DICTIONARY_ENTRY", "Kết quả từ điển đã chọn không hợp lệ.");
      }
      const candidate = entries[entryIndex];
      const importedTerm = text(candidate.term || term, {
        name: "Từ vựng",
        max: 200,
        required: true,
      });
      const createdAt = new Date();
      const row = await db.models.Word.create({
        userId: authenticatedUserId(req),
        term: importedTerm,
        termKey: normalizeKey(importedTerm),
        translation: text(req.body.translation ?? candidate.translation, {
          name: "Nghĩa",
          max: 1000,
          required: true,
        }),
        pronunciation: text(req.body.pronunciation ?? candidate.pronunciation, {
          name: "Phiên âm",
          max: 300,
        }),
        partOfSpeech: text(req.body.partOfSpeech ?? candidate.partOfSpeech, {
          name: "Từ loại",
          max: 80,
        }),
        example: text(req.body.example ?? candidate.example, { name: "Ví dụ", max: 3000 }),
        notes: text(req.body.notes, { name: "Ghi chú", max: 5000 }),
        source: "dictionary",
        language: source,
        nativeLanguage: target,
        bookmarked: boolean(req.body.bookmarked),
        dueAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
      res.status(201).json({ word: serializeWord(plain(row)), dictionaryEntry: candidate });
    }),
  );

  return router;
}
