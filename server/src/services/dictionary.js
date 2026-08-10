import { ApiError } from "../http.js";

class FreeDictionaryProvider {
  constructor({ baseUrl, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  async search(query, sourceLanguage, targetLanguage) {
    let response;
    try {
      response = await this.fetch(
        `${this.baseUrl}/${encodeURIComponent(sourceLanguage)}/${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
      );
    } catch (error) {
      throw new ApiError(502, "DICTIONARY_UNAVAILABLE", "Không thể kết nối dịch vụ từ điển.", {
        reason: error.message,
      });
    }
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new ApiError(502, "DICTIONARY_UNAVAILABLE", "Dịch vụ từ điển đang tạm thời không khả dụng.");
    }
    let entries;
    try {
      entries = await response.json();
    } catch {
      throw new ApiError(502, "DICTIONARY_UNAVAILABLE", "Dịch vụ từ điển trả về dữ liệu không hợp lệ.");
    }
    if (!Array.isArray(entries)) {
      throw new ApiError(502, "DICTIONARY_UNAVAILABLE", "Dịch vụ từ điển trả về dữ liệu không hợp lệ.");
    }
    return entries.slice(0, 5).map((entry) => {
      const phonetic = entry.phonetic || entry.phonetics?.find((item) => item.text)?.text || "";
      const audio = entry.phonetics?.find((item) => item.audio)?.audio || "";
      const definitions = entry.meanings
        ?.flatMap((meaning) =>
          (meaning.definitions || []).slice(0, 3).map((definition) => ({
            definition: definition.definition || "",
            example: definition.example || "",
            synonyms: definition.synonyms || [],
            partOfSpeech: meaning.partOfSpeech || "",
          })),
        )
        .slice(0, 8) || [];
      return {
        term: entry.word || query,
        word: entry.word || query,
        pronunciation: phonetic,
        audio,
        sourceLanguage,
        targetLanguage,
        definitions,
        translation: definitions[0]?.definition || "",
        partOfSpeech: definitions[0]?.partOfSpeech || "",
        example: definitions.find((definition) => definition.example)?.example || "",
        sourceUrl: entry.sourceUrls?.[0] || "",
      };
    });
  }
}

export class DictionaryService {
  constructor(config, options = {}) {
    if (config.provider !== "free_dictionary") {
      throw new Error(`Unsupported dictionary provider: ${config.provider}`);
    }
    this.providerName = config.provider;
    this.provider = new FreeDictionaryProvider({ baseUrl: config.baseUrl, ...options });
  }

  async search(query, sourceLanguage, targetLanguage) {
    return this.provider.search(query, sourceLanguage, targetLanguage);
  }
}
