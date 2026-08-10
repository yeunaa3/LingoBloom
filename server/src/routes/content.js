import { Router } from "express";
import { requireAuth } from "../auth.js";
import { normalizeKey } from "../db.js";
import { asyncHandler, boolean, notFound, pagination, resourceId, text } from "../http.js";
import { structure as serializeStructure, word as serializeWord } from "../serializers.js";

const plain = (document) => document?.toObject?.() || document;
const authenticatedUserId = (req) => String(req.user._id ?? req.user.id);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildListFilter(req, searchFields) {
  const filter = { userId: authenticatedUserId(req) };
  const q = String(req.query.q || req.query.search || "").trim();
  if (q) {
    const matcher = new RegExp(escapeRegex(q), "i");
    filter.$or = searchFields.map((field) => ({ [field]: matcher }));
  }
  if (req.query.bookmarked != null) filter.bookmarked = boolean(req.query.bookmarked);
  if (req.query.language) {
    filter.language = text(req.query.language, { name: "Ngôn ngữ", max: 12, required: true }).toLowerCase();
  }
  if (boolean(req.query.due, false)) filter.dueAt = { $lte: new Date() };
  return filter;
}

async function list(Model, req, searchFields, serializer, key, res, alphabeticalField) {
  const { limit, offset } = pagination(req.query);
  const filter = buildListFilter(req, searchFields);
  const sortFields = {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    dueAt: "dueAt",
    alphabetical: alphabeticalField,
  };
  const sortField = sortFields[req.query.sort] || "createdAt";
  const order = String(req.query.order || "").toLowerCase() === "asc" ? 1 : -1;
  const sort = { [sortField]: order, _id: -1 };
  const [total, rows] = await Promise.all([
    Model.countDocuments(filter),
    Model.find(filter).sort(sort).skip(offset).limit(limit).lean(),
  ]);
  const items = rows.map(serializer);
  res.json({ [key]: items, data: items, meta: { total, limit, offset } });
}

async function ownedDocument(Model, userId, rawId, label) {
  const document = await Model.findOne({ _id: resourceId(rawId), userId });
  if (!document) throw notFound(label);
  return document;
}

export function contentRoutes({ db }) {
  const { Word, Structure } = db.models;
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/words",
    asyncHandler(async (req, res) => {
      await list(
        Word,
        req,
        ["term", "translation", "example", "notes"],
        serializeWord,
        "words",
        res,
        "term",
      );
    }),
  );

  router.get(
    "/words/:id",
    asyncHandler(async (req, res) => {
      const row = await ownedDocument(Word, authenticatedUserId(req), req.params.id, "Từ vựng");
      res.json({ word: serializeWord(plain(row)) });
    }),
  );

  router.post(
    "/words",
    asyncHandler(async (req, res) => {
      const term = text(req.body.term ?? req.body.word, {
        name: "Từ vựng",
        max: 200,
        required: true,
      });
      const translation = text(req.body.translation ?? req.body.meaning, {
        name: "Nghĩa",
        max: 1000,
        required: true,
      });
      const language = text(req.body.language ?? req.user.learningLanguage, {
        name: "Ngôn ngữ",
        max: 12,
        required: true,
      }).toLowerCase();
      const nativeLanguage = text(req.body.nativeLanguage ?? req.user.nativeLanguage, {
        name: "Ngôn ngữ mẹ đẻ",
        max: 12,
        required: true,
      }).toLowerCase();
      const createdAt = new Date();
      const row = await Word.create({
        userId: authenticatedUserId(req),
        term,
        termKey: normalizeKey(term),
        translation,
        pronunciation: text(req.body.pronunciation, { name: "Phiên âm", max: 300 }),
        partOfSpeech: text(req.body.partOfSpeech, { name: "Từ loại", max: 80 }),
        example: text(req.body.example, { name: "Ví dụ", max: 3000 }),
        notes: text(req.body.notes, { name: "Ghi chú", max: 5000 }),
        source: text(req.body.source || "manual", { name: "Nguồn", max: 80 }),
        language,
        nativeLanguage,
        bookmarked: boolean(req.body.bookmarked),
        dueAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
      res.status(201).json({ word: serializeWord(plain(row)) });
    }),
  );

  const patchWord = asyncHandler(async (req, res) => {
    const rawId = req.params.id ?? req.body.id;
    const current = await ownedDocument(Word, authenticatedUserId(req), rawId, "Từ vựng");
    const value = (key, alias, options) =>
      req.body[key] == null && (alias == null || req.body[alias] == null)
        ? current[options.field]
        : text(req.body[key] ?? req.body[alias], options);
    const term = value("term", "word", {
      name: "Từ vựng",
      max: 200,
      required: true,
      field: "term",
    });
    current.set({
      term,
      termKey: normalizeKey(term),
      translation: value("translation", "meaning", {
        name: "Nghĩa",
        max: 1000,
        required: true,
        field: "translation",
      }),
      pronunciation: value("pronunciation", null, {
        name: "Phiên âm",
        max: 300,
        field: "pronunciation",
      }),
      partOfSpeech: value("partOfSpeech", null, {
        name: "Từ loại",
        max: 80,
        field: "partOfSpeech",
      }),
      example: value("example", null, { name: "Ví dụ", max: 3000, field: "example" }),
      notes: value("notes", null, { name: "Ghi chú", max: 5000, field: "notes" }),
      language: value("language", null, {
        name: "Ngôn ngữ",
        max: 12,
        required: true,
        field: "language",
      }).toLowerCase(),
      nativeLanguage: value("nativeLanguage", null, {
        name: "Ngôn ngữ mẹ đẻ",
        max: 12,
        required: true,
        field: "nativeLanguage",
      }).toLowerCase(),
      bookmarked: req.body.bookmarked == null ? current.bookmarked : boolean(req.body.bookmarked),
      updatedAt: new Date(),
    });
    await current.save();
    res.json({ word: serializeWord(plain(current)) });
  });
  router.patch("/words/:id", patchWord);
  router.patch("/words", patchWord);

  const deleteWord = asyncHandler(async (req, res) => {
    const rawId = req.params.id ?? req.body?.id ?? req.query.id;
    const id = resourceId(rawId);
    const row = await Word.findOneAndDelete({ _id: id, userId: authenticatedUserId(req) });
    if (!row) throw notFound("Từ vựng");
    res.json({ success: true, deletedId: String(row.id) });
  });
  router.delete("/words/:id", deleteWord);
  router.delete("/words", deleteWord);

  router.get(
    "/structures",
    asyncHandler(async (req, res) => {
      await list(
        Structure,
        req,
        ["pattern", "meaning", "example", "notes"],
        serializeStructure,
        "structures",
        res,
        "pattern",
      );
    }),
  );

  router.get(
    "/structures/:id",
    asyncHandler(async (req, res) => {
      const row = await ownedDocument(Structure, authenticatedUserId(req), req.params.id, "Cấu trúc");
      res.json({ structure: serializeStructure(plain(row)) });
    }),
  );

  router.post(
    "/structures",
    asyncHandler(async (req, res) => {
      const pattern = text(req.body.pattern ?? req.body.structure, {
        name: "Cấu trúc",
        max: 500,
        required: true,
      });
      const createdAt = new Date();
      const row = await Structure.create({
        userId: authenticatedUserId(req),
        pattern,
        patternKey: normalizeKey(pattern),
        meaning: text(req.body.meaning ?? req.body.translation, {
          name: "Ý nghĩa",
          max: 1500,
          required: true,
        }),
        example: text(req.body.example, { name: "Ví dụ", max: 3000 }),
        notes: text(req.body.notes, { name: "Ghi chú", max: 5000 }),
        language: text(req.body.language ?? req.user.learningLanguage, {
          name: "Ngôn ngữ",
          max: 12,
          required: true,
        }).toLowerCase(),
        bookmarked: boolean(req.body.bookmarked),
        dueAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
      res.status(201).json({ structure: serializeStructure(plain(row)) });
    }),
  );

  const patchStructure = asyncHandler(async (req, res) => {
    const rawId = req.params.id ?? req.body.id;
    const current = await ownedDocument(Structure, authenticatedUserId(req), rawId, "Cấu trúc");
    const value = (key, alias, field, name, max, required = false) =>
      req.body[key] == null && (alias == null || req.body[alias] == null)
        ? current[field]
        : text(req.body[key] ?? req.body[alias], { name, max, required });
    const pattern = value("pattern", "structure", "pattern", "Cấu trúc", 500, true);
    current.set({
      pattern,
      patternKey: normalizeKey(pattern),
      meaning: value("meaning", "translation", "meaning", "Ý nghĩa", 1500, true),
      example: value("example", null, "example", "Ví dụ", 3000),
      notes: value("notes", null, "notes", "Ghi chú", 5000),
      language: value("language", null, "language", "Ngôn ngữ", 12, true).toLowerCase(),
      bookmarked: req.body.bookmarked == null ? current.bookmarked : boolean(req.body.bookmarked),
      updatedAt: new Date(),
    });
    await current.save();
    res.json({ structure: serializeStructure(plain(current)) });
  });
  router.patch("/structures/:id", patchStructure);
  router.patch("/structures", patchStructure);

  const deleteStructure = asyncHandler(async (req, res) => {
    const rawId = req.params.id ?? req.body?.id ?? req.query.id;
    const id = resourceId(rawId);
    const row = await Structure.findOneAndDelete({ _id: id, userId: authenticatedUserId(req) });
    if (!row) throw notFound("Cấu trúc");
    res.json({ success: true, deletedId: String(row.id) });
  });
  router.delete("/structures/:id", deleteStructure);
  router.delete("/structures", deleteStructure);

  return router;
}
