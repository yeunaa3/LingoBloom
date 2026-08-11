import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { normalizeKey } from "../db.js";
import { ApiError, asyncHandler, boolean, text } from "../http.js";
import { word as serializeWord } from "../serializers.js";

const plain = (document) => document?.toObject?.() || document;
const authenticatedUserId = (req) => String(req.user._id ?? req.user.id);
const TOKEN_VERSION = 1;

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function candidateIdFor(provider, source, target, normalizedTerm) {
  return createHash("sha256")
    .update([provider, source, target, normalizedTerm].join("\u0000"))
    .digest("base64url")
    .slice(0, 22);
}

function signatureFor(encodedPayload, secret) {
  return createHmac("sha256", `${secret}:dictionary-selection:v1`)
    .update(encodedPayload)
    .digest();
}

function issueSelectionToken({ candidate, userId, source, target, provider, secret, ttlSeconds }) {
  const term = text(candidate.term ?? candidate.word, {
    name: "Từ gợi ý",
    max: 200,
    required: true,
  });
  const normalizedTerm = normalizeKey(term);
  const previewTranslation = text(candidate.translation, { name: "Nghĩa xem trước", max: 1000 });
  const issuedAt = Math.floor(Date.now() / 1000);
  const candidateId = candidateIdFor(provider, source, target, normalizedTerm);
  const payload = {
    version: TOKEN_VERSION,
    candidateId,
    userId,
    term,
    normalizedTerm,
    source,
    target,
    provider,
    previewTranslation,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const encoded = base64urlJson(payload);
  const signature = signatureFor(encoded, secret).toString("base64url");
  return { candidateId, selectionToken: `${encoded}.${signature}` };
}

function invalidSelection() {
  return new ApiError(
    400,
    "INVALID_DICTIONARY_SELECTION",
    "Lựa chọn từ điển không hợp lệ. Vui lòng chọn lại từ danh sách gợi ý.",
  );
}

function verifySelectionToken(token, { userId, provider, secret }) {
  const value = text(token, {
    name: "Mã lựa chọn",
    max: 4096,
    required: true,
  });
  const [encoded, encodedSignature, extra] = value.split(".");
  if (!encoded || !encodedSignature || extra != null) throw invalidSelection();

  let actualSignature;
  try {
    actualSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw invalidSelection();
  }
  const expectedSignature = signatureFor(encoded, secret);
  if (
    encodedSignature !== actualSignature.toString("base64url")
    || actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw invalidSelection();
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw invalidSelection();
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    payload?.version !== TOKEN_VERSION
    || payload.userId !== userId
    || payload.provider !== provider
    || !payload.candidateId
    || !payload.term
    || payload.normalizedTerm !== normalizeKey(payload.term)
    || (payload.previewTranslation != null && (
      typeof payload.previewTranslation !== "string"
      || payload.previewTranslation.length > 1000
    ))
    || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(payload.source || "")
    || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(payload.target || "")
    || !Number.isInteger(payload.issuedAt)
    || !Number.isInteger(payload.expiresAt)
    || payload.issuedAt > now + 30
    || payload.expiresAt - payload.issuedAt > 900
    || payload.candidateId !== candidateIdFor(
      payload.provider,
      payload.source,
      payload.target,
      payload.normalizedTerm,
    )
  ) {
    throw invalidSelection();
  }
  if (payload.expiresAt <= now) {
    throw new ApiError(
      410,
      "DICTIONARY_SELECTION_EXPIRED",
      "Lựa chọn từ điển đã hết hạn. Vui lòng chọn lại từ danh sách gợi ý.",
    );
  }
  return payload;
}

function decorateCandidate(candidate, context) {
  const term = String(candidate?.term ?? candidate?.word ?? "").trim();
  if (!term) return null;
  const normalizedTerm = normalizeKey(term);
  const token = issueSelectionToken({
    candidate: { ...candidate, term },
    ...context,
  });
  return {
    id: token.candidateId,
    term,
    word: term,
    normalizedTerm,
    pronunciation: String(candidate.pronunciation || ""),
    audio: String(candidate.audio || ""),
    partOfSpeech: String(candidate.partOfSpeech || ""),
    definition: String(candidate.definition || candidate.translation || ""),
    translation: String(candidate.translation || ""),
    definitions: Array.isArray(candidate.definitions) ? candidate.definitions : [],
    example: String(candidate.example || ""),
    sourceUrl: String(candidate.sourceUrl || ""),
    sourceLanguage: context.source,
    targetLanguage: context.target,
    inputLanguage: candidate.inputLanguage || context.inputLanguage || context.source,
    score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
    match: candidate.match || "exact",
    provider: context.provider,
    suggestionProvider: candidate.suggestionProvider || context.suggestionProvider || null,
    selectionToken: token.selectionToken,
    selectable: true,
  };
}

function selectionContext(req, service, config, source, target, inputLanguage = source) {
  const ttl = Math.max(60, Math.min(900, Number(config?.dictionary?.selectionTtlSeconds) || 300));
  return {
    userId: authenticatedUserId(req),
    source,
    target,
    inputLanguage,
    provider: service.providerName,
    suggestionProvider: service.suggestionProviderName || null,
    secret: config.sessionSecret,
    ttlSeconds: ttl,
  };
}

async function resolveSelectedCandidate(service, payload) {
  let candidate;
  if (typeof service.resolveSelection === "function") {
    candidate = await service.resolveSelection(payload.term, payload.source, payload.target);
  } else {
    const entries = await service.search(payload.term, payload.source, payload.target);
    candidate = entries.find(
      (entry) => normalizeKey(entry.term ?? entry.word) === payload.normalizedTerm,
    );
  }
  if (!candidate) {
    throw new ApiError(
      422,
      "DICTIONARY_SELECTION_NOT_VERIFIED",
      "Từ đã chọn không còn được từ điển xác nhận. Vui lòng chọn lại từ danh sách gợi ý.",
    );
  }
  return candidate;
}

export function dictionaryRoutes({ db, service, config }) {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/search",
    asyncHandler(async (req, res) => {
      const query = text(req.query.q, { name: "Từ cần tra", max: 200, required: true });
      const source = text(req.query.source || req.user.learningLanguage, {
        name: "Ngôn ngữ nguồn",
        max: 12,
        required: true,
      }).toLowerCase();
      const target = text(req.query.target || req.user.nativeLanguage, {
        name: "Ngôn ngữ đích",
        max: 12,
        required: true,
      }).toLowerCase();
      const entries = await service.search(query, source, target);
      const context = selectionContext(req, service, config, source, target);
      const canSelect = typeof service.supportsSelectionLanguage !== "function"
        || service.supportsSelectionLanguage(source);
      const decorated = canSelect
        ? entries.map((entry) => decorateCandidate(entry, context)).filter(Boolean)
        : entries;
      res.json({
        entries: decorated,
        data: decorated,
        meta: {
          provider: service.providerName,
          source,
          target,
          selectable: canSelect,
          selectionTtlSeconds: context.ttlSeconds,
          note: "Kết quả chính xác từ nhà cung cấp từ điển. Luồng một ô chỉ lưu ứng viên có mã lựa chọn hợp lệ.",
        },
      });
    }),
  );

  const suggestions = asyncHandler(async (req, res) => {
    const query = text(req.query.q ?? req.query.query, {
      name: "Nội dung gợi ý",
      max: 200,
      required: true,
    });
    const source = text(req.query.source || req.user.learningLanguage, {
      name: "Ngôn ngữ đang học",
      max: 12,
      required: true,
    }).toLowerCase();
    const target = text(req.query.target || req.user.nativeLanguage, {
      name: "Ngôn ngữ mẹ đẻ",
      max: 12,
      required: true,
    }).toLowerCase();
    const meaningHint = text(req.query.meaning, {
      name: "Nghĩa mong muốn",
      max: 500,
    });
    const inputLanguage = text(req.query.inputLanguage || req.query.input || source, {
      name: "Ngôn ngữ nhập",
      max: 12,
      required: true,
    }).toLowerCase();
    const limit = Math.max(1, Math.min(10, Number.parseInt(req.query.limit || "8", 10) || 8));
    if (query.length < 2) {
      return res.json({
        suggestions: [],
        data: [],
        meta: {
          provider: service.providerName,
          source,
          target,
          inputLanguage,
          supported: true,
          mode: "waiting",
          minQueryLength: 2,
          selectionTtlSeconds: Math.max(
            60,
            Math.min(900, Number(config?.dictionary?.selectionTtlSeconds) || 300),
          ),
        },
      });
    }

    const result = typeof service.suggest === "function"
      ? await service.suggest(query, source, target, { inputLanguage, limit, meaningHint })
      : {
          suggestions: await service.search(query, source, target),
          supported: true,
          mode: "exact_fallback",
          inputLanguage,
        };
    const context = selectionContext(req, service, config, source, target, inputLanguage);
    const decorated = result.supported === false
      ? []
      : (result.suggestions || [])
        .map((candidate) => decorateCandidate(candidate, context))
        .filter(Boolean);
    return res.json({
      suggestions: decorated,
      data: decorated,
      meta: {
        provider: service.providerName,
        suggestionProvider: result.suggestionProvider || service.suggestionProviderName || null,
        translationProvider: service.translationProviderName || null,
        source,
        target,
        inputLanguage,
        mode: result.mode || "prefix",
        supported: result.supported !== false,
        reason: result.reason || null,
        resolvedQuery: result.lookupQuery || query,
        meaningHintUsed: Boolean(result.meaningHintUsed),
        minQueryLength: 2,
        selectionTtlSeconds: context.ttlSeconds,
        warning: result.warning || null,
      },
    });
  });
  router.get("/suggestions", suggestions);
  router.get("/autocomplete", suggestions);

  const handleSaveSelection = async (req, res) => {
    const body = req.body || {};
    const forbiddenOverrides = [
      "term",
      "word",
      "translation",
      "meaning",
      "pronunciation",
      "partOfSpeech",
      "example",
      "language",
      "nativeLanguage",
      "source",
      "target",
      "entryIndex",
    ];
    if (forbiddenOverrides.some((field) => Object.hasOwn(body, field))) {
      throw new ApiError(
        400,
        "DICTIONARY_SELECTION_OVERRIDES_NOT_ALLOWED",
        "Luồng thêm nhanh chỉ nhận từ đã chọn; không thể tự sửa từ hoặc nghĩa trước khi lưu.",
      );
    }
    const payload = verifySelectionToken(body.selectionToken ?? body.token, {
      userId: authenticatedUserId(req),
      provider: service.providerName,
      secret: config.sessionSecret,
    });
    const candidate = await resolveSelectedCandidate(service, payload);
    const canonicalTerm = text(candidate.term ?? candidate.word, {
      name: "Từ vựng",
      max: 200,
      required: true,
    });
    if (normalizeKey(canonicalTerm) !== payload.normalizedTerm) {
      throw new ApiError(
        422,
        "DICTIONARY_SELECTION_NOT_VERIFIED",
        "Kết quả từ điển đã thay đổi. Vui lòng chọn lại từ danh sách gợi ý.",
      );
    }
    const createdAt = new Date();
    const row = await db.models.Word.create({
      userId: authenticatedUserId(req),
      term: canonicalTerm,
      termKey: payload.normalizedTerm,
      translation: text(payload.previewTranslation || candidate.translation, {
        name: "Nghĩa",
        max: 1000,
        required: true,
      }),
      pronunciation: text(candidate.pronunciation, { name: "Phiên âm", max: 300 }),
      partOfSpeech: text(candidate.partOfSpeech, { name: "Từ loại", max: 80 }),
      example: text(candidate.example, { name: "Ví dụ", max: 3000 }),
      notes: text(body.notes, { name: "Ghi chú", max: 5000 }),
      source: "dictionary",
      language: payload.source,
      nativeLanguage: payload.target,
      bookmarked: boolean(body.bookmarked),
      dueAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
    return res.status(201).json({
      word: serializeWord(plain(row)),
      dictionaryEntry: {
        ...candidate,
        term: canonicalTerm,
        word: canonicalTerm,
        sourceLanguage: payload.source,
        targetLanguage: payload.target,
      },
      selection: {
        candidateId: payload.candidateId,
        verified: true,
      },
    });
  };
  const saveSelection = asyncHandler(handleSaveSelection);
  router.post("/selection", saveSelection);
  router.post("/import-selected", saveSelection);

  const legacyImport = asyncHandler(async (req, res) => {
    // New clients can retain the old endpoint name while using the strict token flow.
    if (req.body?.selectionToken || req.body?.token) return handleSaveSelection(req, res);

    const term = text(req.body.term ?? req.body.word, {
      name: "Từ cần tra",
      max: 200,
      required: true,
    });
    const source = text(req.body.source || req.body.language || req.user.learningLanguage, {
      name: "Ngôn ngữ nguồn",
      max: 12,
      required: true,
    }).toLowerCase();
    const target = text(req.body.target || req.body.nativeLanguage || req.user.nativeLanguage, {
      name: "Ngôn ngữ đích",
      max: 12,
      required: true,
    }).toLowerCase();
    const entries = await service.search(term, source, target);
    if (!entries.length) {
      throw new ApiError(
        404,
        "DICTIONARY_ENTRY_NOT_FOUND",
        "Không tìm thấy từ phù hợp trong từ điển.",
      );
    }
    const entryIndex = Number(req.body.entryIndex ?? 0);
    if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= entries.length) {
      throw new ApiError(
        400,
        "INVALID_DICTIONARY_ENTRY",
        "Kết quả từ điển đã chọn không hợp lệ.",
      );
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
    res.status(201).json({
      word: serializeWord(plain(row)),
      dictionaryEntry: candidate,
      meta: { flow: "legacy", selectionVerified: false },
    });
  });
  router.post("/import", legacyImport);

  return router;
}
