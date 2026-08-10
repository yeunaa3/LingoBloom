import { ApiError } from "../http.js";

const clean = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const normalizeTerm = (value) => clean(value, 200).normalize("NFKC").toLocaleLowerCase();

function safeHttpsUrl(value) {
  const raw = clean(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function decodeEntities(value) {
  const named = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
  };
  return clean(value, 5000)
    .replace(/&(amp|quot|apos|lt|gt);|&#39;/gi, (entity) => named[entity.toLowerCase()] || entity)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

async function fetchJson(fetchImpl, url, {
  timeoutMs,
  unavailableCode,
  unavailableMessage,
  headers = {},
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs || 8000),
    });
  } catch {
    throw new ApiError(502, unavailableCode, unavailableMessage);
  }
  return response;
}

class FreeDictionaryProvider {
  constructor({ baseUrl, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  supportsLanguage(language) {
    return String(language).toLowerCase() === "en";
  }

  async search(query, sourceLanguage, targetLanguage) {
    const response = await fetchJson(
      this.fetch,
      `${this.baseUrl}/${encodeURIComponent(sourceLanguage)}/${encodeURIComponent(query)}`,
      {
        timeoutMs: 8000,
        unavailableCode: "DICTIONARY_UNAVAILABLE",
        unavailableMessage: "Không thể kết nối dịch vụ từ điển.",
      },
    );
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new ApiError(
        502,
        "DICTIONARY_UNAVAILABLE",
        "Dịch vụ từ điển đang tạm thời không khả dụng.",
      );
    }
    let entries;
    try {
      entries = await response.json();
    } catch {
      throw new ApiError(
        502,
        "DICTIONARY_UNAVAILABLE",
        "Dịch vụ từ điển trả về dữ liệu không hợp lệ.",
      );
    }
    if (!Array.isArray(entries)) {
      throw new ApiError(
        502,
        "DICTIONARY_UNAVAILABLE",
        "Dịch vụ từ điển trả về dữ liệu không hợp lệ.",
      );
    }

    return entries.slice(0, 5).map((entry) => {
      const term = clean(entry?.word || query, 200);
      const pronunciation = clean(
        entry?.phonetic || entry?.phonetics?.find((item) => item?.text)?.text,
        300,
      );
      const audio = safeHttpsUrl(entry?.phonetics?.find((item) => item?.audio)?.audio);
      const definitions = Array.isArray(entry?.meanings)
        ? entry.meanings
          .flatMap((meaning) => (Array.isArray(meaning?.definitions) ? meaning.definitions : [])
            .slice(0, 3)
            .map((definition) => ({
              definition: clean(definition?.definition, 1000),
              example: clean(definition?.example, 3000),
              synonyms: Array.isArray(definition?.synonyms)
                ? definition.synonyms.map((item) => clean(item, 200)).filter(Boolean).slice(0, 20)
                : [],
              partOfSpeech: clean(meaning?.partOfSpeech, 80),
            })))
          .filter((definition) => definition.definition)
          .slice(0, 8)
        : [];
      const firstDefinition = definitions[0];
      return {
        term,
        word: term,
        normalizedTerm: normalizeTerm(term),
        pronunciation,
        audio,
        sourceLanguage,
        targetLanguage,
        definitions,
        definition: firstDefinition?.definition || "",
        // FreeDictionary is monolingual. DictionaryService replaces this with a
        // target-language translation before the selected-candidate flow saves it.
        translation: firstDefinition?.definition || "",
        partOfSpeech: firstDefinition?.partOfSpeech || "",
        example: definitions.find((definition) => definition.example)?.example || "",
        sourceUrl: safeHttpsUrl(entry?.sourceUrls?.[0]),
        provider: "free_dictionary",
      };
    }).filter((entry) => entry.term);
  }
}

class DatamuseSuggestionProvider {
  constructor({ baseUrl, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  supportsLanguage(language) {
    return String(language).toLowerCase() === "en";
  }

  async suggest(query, language, limit) {
    if (!this.supportsLanguage(language)) return [];
    const url = new URL(this.baseUrl);
    url.searchParams.set("s", query);
    url.searchParams.set("max", String(limit));
    const response = await fetchJson(this.fetch, url, {
      timeoutMs: 5000,
      unavailableCode: "DICTIONARY_SUGGESTIONS_UNAVAILABLE",
      unavailableMessage: "Dịch vụ gợi ý từ đang tạm thời không khả dụng.",
    });
    if (!response.ok) {
      throw new ApiError(
        502,
        "DICTIONARY_SUGGESTIONS_UNAVAILABLE",
        "Dịch vụ gợi ý từ đang tạm thời không khả dụng.",
      );
    }
    let rows;
    try {
      rows = await response.json();
    } catch {
      throw new ApiError(
        502,
        "DICTIONARY_SUGGESTIONS_UNAVAILABLE",
        "Dịch vụ gợi ý từ trả về dữ liệu không hợp lệ.",
      );
    }
    if (!Array.isArray(rows)) {
      throw new ApiError(
        502,
        "DICTIONARY_SUGGESTIONS_UNAVAILABLE",
        "Dịch vụ gợi ý từ trả về dữ liệu không hợp lệ.",
      );
    }
    return rows
      .map((row) => ({
        term: clean(row?.word, 200),
        score: Number.isFinite(Number(row?.score)) ? Number(row.score) : null,
      }))
      .filter((row) => row.term)
      .slice(0, limit);
  }
}

class MyMemoryTranslationProvider {
  constructor({ baseUrl, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  async translate(value, sourceLanguage, targetLanguage) {
    const source = String(sourceLanguage).toLowerCase();
    const target = String(targetLanguage).toLowerCase();
    const input = clean(value, 500);
    if (!input) return { text: "", provider: "mymemory", quality: null };
    if (source === target) return { text: input, provider: "identity", quality: 100 };

    const url = new URL(this.baseUrl);
    url.searchParams.set("q", input);
    url.searchParams.set("langpair", `${source}|${target}`);
    const response = await fetchJson(this.fetch, url, {
      timeoutMs: 7000,
      unavailableCode: "DICTIONARY_TRANSLATION_UNAVAILABLE",
      unavailableMessage: "Dịch vụ dịch nghĩa đang tạm thời không khả dụng.",
    });
    if (response.status === 429) {
      throw new ApiError(
        503,
        "DICTIONARY_TRANSLATION_LIMIT",
        "Dịch vụ dịch nghĩa miễn phí đã tạm đạt giới hạn. Vui lòng thử lại sau.",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        502,
        "DICTIONARY_TRANSLATION_UNAVAILABLE",
        "Dịch vụ dịch nghĩa đang tạm thời không khả dụng.",
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(
        502,
        "DICTIONARY_TRANSLATION_UNAVAILABLE",
        "Dịch vụ dịch nghĩa trả về dữ liệu không hợp lệ.",
      );
    }
    const translated = decodeEntities(payload?.responseData?.translatedText);
    const responseStatus = Number(payload?.responseStatus ?? response.status);
    if (
      responseStatus >= 400
      || !translated
      || /^MYMEMORY WARNING:/i.test(translated)
    ) {
      throw new ApiError(
        responseStatus === 429 ? 503 : 502,
        responseStatus === 429
          ? "DICTIONARY_TRANSLATION_LIMIT"
          : "DICTIONARY_TRANSLATION_UNAVAILABLE",
        responseStatus === 429
          ? "Dịch vụ dịch nghĩa miễn phí đã tạm đạt giới hạn. Vui lòng thử lại sau."
          : "Không thể tạo nghĩa đáng tin cậy cho từ đã chọn.",
      );
    }
    const quality = Number(payload?.responseData?.match);
    return {
      text: translated,
      provider: "mymemory",
      quality: Number.isFinite(quality) ? quality : null,
    };
  }
}

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(cache, key, value, ttlMs) {
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export class DictionaryService {
  constructor(config, options = {}) {
    if (config.provider !== "free_dictionary") {
      throw new Error(`Unsupported dictionary provider: ${config.provider}`);
    }
    const sharedFetch = options.fetchImpl || globalThis.fetch;
    this.providerName = config.provider;
    this.suggestionProviderName = "datamuse";
    this.translationProviderName = "mymemory";
    this.provider = new FreeDictionaryProvider({
      baseUrl: config.baseUrl,
      fetchImpl: options.dictionaryFetchImpl || sharedFetch,
    });
    this.suggestionProvider = new DatamuseSuggestionProvider({
      baseUrl: config.suggestionBaseUrl || "https://api.datamuse.com/sug",
      fetchImpl: options.suggestionFetchImpl || sharedFetch,
    });
    this.translationProvider = new MyMemoryTranslationProvider({
      baseUrl: config.translationBaseUrl || "https://api.mymemory.translated.net/get",
      fetchImpl: options.translationFetchImpl || sharedFetch,
    });
    this.cache = new Map();
  }

  supportsSelectionLanguage(language) {
    return this.provider.supportsLanguage(language);
  }

  async search(query, sourceLanguage, targetLanguage) {
    return this.provider.search(query, sourceLanguage, targetLanguage);
  }

  async suggest(query, sourceLanguage, targetLanguage, options = {}) {
    const source = String(sourceLanguage).toLowerCase();
    const target = String(targetLanguage).toLowerCase();
    const inputLanguage = String(options.inputLanguage || source).toLowerCase();
    const limit = Math.max(1, Math.min(10, Number(options.limit) || 8));

    if (!this.provider.supportsLanguage(source) || !this.suggestionProvider.supportsLanguage(source)) {
      return {
        suggestions: [],
        supported: false,
        mode: "unsupported",
        inputLanguage,
        reason: "LEARNING_LANGUAGE_NOT_SUPPORTED",
      };
    }
    if (![source, target].includes(inputLanguage)) {
      return {
        suggestions: [],
        supported: false,
        mode: "unsupported",
        inputLanguage,
        reason: "INPUT_LANGUAGE_NOT_SUPPORTED",
      };
    }

    let lookupQuery = clean(query, 200);
    let mode = "prefix";
    if (inputLanguage !== source) {
      const translated = await this.translationProvider.translate(
        lookupQuery,
        inputLanguage,
        source,
      );
      lookupQuery = clean(translated.text, 200);
      mode = "translated_prefix";
    }
    if (lookupQuery.length < 2) {
      return {
        suggestions: [],
        supported: true,
        mode,
        inputLanguage,
        lookupQuery,
      };
    }

    const cacheKey = ["suggest", lookupQuery, source, target, inputLanguage, limit].join("|");
    const cached = cacheGet(this.cache, cacheKey);
    if (cached) return cached;

    let rows;
    let warning = null;
    try {
      rows = await this.suggestionProvider.suggest(lookupQuery, source, limit);
    } catch (suggestionError) {
      // Autocomplete should degrade to an exact dictionary result when the
      // optional suggestion service is unavailable.
      const exactEntries = await this.search(lookupQuery, source, target);
      rows = exactEntries.map((entry) => ({ term: entry.term, score: null }));
      mode = "exact_fallback";
      warning = suggestionError.code || "DICTIONARY_SUGGESTIONS_UNAVAILABLE";
    }

    const seen = new Set();
    const normalizedQuery = normalizeTerm(lookupQuery);
    const suggestions = rows.flatMap((row) => {
      const term = clean(row.term, 200);
      const normalized = normalizeTerm(term);
      if (!term || !normalized || seen.has(normalized)) return [];
      seen.add(normalized);
      return [{
        term,
        word: term,
        normalizedTerm: normalized,
        pronunciation: "",
        partOfSpeech: "",
        definition: "",
        translation: "",
        example: "",
        sourceLanguage: source,
        targetLanguage: target,
        inputLanguage,
        score: row.score,
        match: normalized === normalizedQuery ? "exact" : mode,
        provider: this.providerName,
        suggestionProvider: this.suggestionProviderName,
      }];
    }).slice(0, limit);

    return cacheSet(this.cache, cacheKey, {
      suggestions,
      supported: true,
      mode,
      inputLanguage,
      lookupQuery,
      warning,
    }, 30_000);
  }

  async resolveSelection(term, sourceLanguage, targetLanguage) {
    const source = String(sourceLanguage).toLowerCase();
    const target = String(targetLanguage).toLowerCase();
    if (!this.supportsSelectionLanguage(source)) {
      throw new ApiError(
        422,
        "DICTIONARY_LANGUAGE_NOT_SUPPORTED",
        "Từ điển xác thực hiện chỉ hỗ trợ từ vựng tiếng Anh.",
      );
    }
    const selectedKey = normalizeTerm(term);
    const entries = await this.search(term, source, target);
    const candidate = entries.find((entry) => normalizeTerm(entry.term) === selectedKey);
    if (!candidate) {
      throw new ApiError(
        422,
        "DICTIONARY_SELECTION_NOT_VERIFIED",
        "Từ đã chọn không còn được từ điển xác nhận. Vui lòng chọn lại từ danh sách gợi ý.",
      );
    }

    const definition = clean(candidate.definition || candidate.translation, 1000);
    let translation = definition;
    let translationProvider = "free_dictionary_definition";
    let translationQuality = null;
    if (target !== source) {
      const translated = await this.translationProvider.translate(candidate.term, source, target);
      translation = clean(translated.text, 1000);
      translationProvider = translated.provider;
      translationQuality = translated.quality;
    }
    if (!translation) {
      throw new ApiError(
        422,
        "DICTIONARY_CANDIDATE_INCOMPLETE",
        "Từ đã chọn chưa có nghĩa đủ tin cậy để lưu tự động.",
      );
    }
    return {
      ...candidate,
      normalizedTerm: selectedKey,
      definition,
      translation,
      translationProvider,
      translationQuality,
    };
  }
}
