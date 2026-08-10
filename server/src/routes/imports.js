import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import { normalizeKey } from "../db.js";
import { ApiError, asyncHandler, text } from "../http.js";
import { parseImportFile } from "../services/import-parser.js";

const authenticatedUserId = (req) => String(req.user._id ?? req.user.id);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

async function importRows({ db, Model, rows, kind, userId, language, nativeLanguage }) {
  const keyField = kind === "words" ? "termKey" : "patternKey";
  const valueField = kind === "words" ? "term" : "pattern";
  const normalizedKeys = [...new Set(rows.map((row) => normalizeKey(row[valueField])))];
  const session = await db.startSession();
  let outcome = { importedIds: [], duplicates: [] };

  try {
    await session.withTransaction(async () => {
      const existingRows = await Model.find({
        userId,
        language,
        [keyField]: { $in: normalizedKeys },
      })
        .select({ _id: 1, [keyField]: 1 })
        .session(session)
        .lean();
      const seen = new Map(existingRows.map((row) => [row[keyField], String(row._id)]));
      const duplicates = [];
      const toInsert = [];
      const createdAt = new Date();

      for (const row of rows) {
        const key = normalizeKey(row[valueField]);
        const existingId = seen.get(key);
        if (existingId) {
          duplicates.push({ line: row.line, value: row[valueField], existingId });
          continue;
        }

        const values = kind === "words"
          ? {
              userId,
              term: row.term,
              termKey: key,
              translation: row.translation,
              pronunciation: row.pronunciation,
              partOfSpeech: row.partOfSpeech,
              example: row.example,
              notes: row.notes,
              source: "file",
              language,
              nativeLanguage,
              bookmarked: Boolean(row.bookmarked),
              dueAt: createdAt,
              createdAt,
              updatedAt: createdAt,
            }
          : {
              userId,
              pattern: row.pattern,
              patternKey: key,
              meaning: row.meaning,
              example: row.example,
              notes: row.notes,
              language,
              bookmarked: Boolean(row.bookmarked),
              dueAt: createdAt,
              createdAt,
              updatedAt: createdAt,
            };
        const document = new Model(values);
        toInsert.push(document);
        seen.set(key, String(document.id));
      }

      if (toInsert.length) await Model.insertMany(toInsert, { session, ordered: true });
      outcome = {
        importedIds: toInsert.map((document) => String(document.id)),
        duplicates,
      };
    });
  } finally {
    await session.endSession();
  }

  return outcome;
}

export function importRoutes({ db }) {
  const router = Router();
  router.post(
    "/",
    requireAuth,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const rawKind = String(req.body.kind || req.body.type || "words").toLowerCase();
      const allowedKinds = [
        "word",
        "words",
        "vocabulary",
        "vocab",
        "structure",
        "structures",
        "sentence",
        "sentences",
      ];
      if (!allowedKinds.includes(rawKind)) {
        throw new ApiError(400, "INVALID_IMPORT_KIND", "Loại dữ liệu nhập không hợp lệ.");
      }
      const kind = ["structure", "structures", "sentence", "sentences"].includes(rawKind)
        ? "structures"
        : "words";
      const parsed = parseImportFile(req.file, kind);
      const language = text(
        req.body.language || req.body.learningLanguage || req.user.learningLanguage,
        { name: "Ngôn ngữ", max: 12, required: true },
      ).toLowerCase();
      const nativeLanguage = text(req.body.nativeLanguage || req.user.nativeLanguage, {
        name: "Ngôn ngữ mẹ đẻ",
        max: 12,
        required: true,
      }).toLowerCase();
      const Model = kind === "words" ? db.models.Word : db.models.Structure;
      const { importedIds, duplicates } = await importRows({
        db,
        Model,
        rows: parsed.rows,
        kind,
        userId: authenticatedUserId(req),
        language,
        nativeLanguage,
      });

      res.status(201).json({
        success: true,
        kind,
        imported: importedIds.length,
        skipped: duplicates.length,
        totalRows: parsed.rows.length,
        importedIds,
        duplicates: duplicates.slice(0, 50),
        format: { delimiter: parsed.delimiter, hasHeader: parsed.hasHeader },
      });
    }),
  );
  return router;
}
