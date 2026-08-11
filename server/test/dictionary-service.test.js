import assert from "node:assert/strict";
import { test } from "node:test";
import { DictionaryService } from "../src/services/dictionary.js";

const serviceConfig = {
  provider: "free_dictionary",
  baseUrl: "https://dictionary.test/entries",
  suggestionBaseUrl: "https://suggest.test/sug",
  germanWiktionaryBaseUrl: "https://wiktionary.test/w/api.php",
  translationBaseUrl: "https://translate.test/get",
};

function dictionaryPayload(word = "petal") {
  return [{
    word,
    phonetic: "/ˈpet.əl/",
    phonetics: [{ text: "/ˈpet.əl/", audio: "https://audio.test/petal.mp3" }],
    meanings: [{
      partOfSpeech: "noun",
      definitions: [{
        definition: "a coloured segment of a flower",
        example: "A pink petal fell onto the table.",
      }],
    }],
    sourceUrls: ["https://dictionary.test/source/petal"],
  }];
}

test("DictionaryService enriches English suggestions with native-language meanings", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "suggest.test") {
      assert.equal(url.searchParams.get("s"), "pet");
      assert.equal(url.searchParams.get("max"), "5");
      return Response.json([
        { word: "petal", score: 100 },
        { word: "Petal", score: 90 },
        { word: "petals", score: 80 },
      ]);
    }
    if (url.hostname === "dictionary.test") {
      const word = decodeURIComponent(url.pathname.split("/").at(-1));
      return Response.json(dictionaryPayload(word));
    }
    if (url.hostname === "translate.test") {
      const word = url.searchParams.get("q");
      return Response.json({
        responseStatus: 200,
        responseData: {
          translatedText: word === "petals" ? "những cánh hoa" : "cánh hoa",
          match: 0.98,
        },
      });
    }
    throw new Error(`Unexpected provider call: ${url}`);
  };
  const service = new DictionaryService(serviceConfig, { fetchImpl });
  const result = await service.suggest("pet", "en", "vi", {
    inputLanguage: "en",
    limit: 5,
  });

  assert.equal(result.supported, true);
  assert.equal(result.mode, "prefix");
  assert.deepEqual(result.suggestions.map((item) => item.term), ["petal", "petals"]);
  assert.deepEqual(result.suggestions.map((item) => item.translation), ["cánh hoa", "những cánh hoa"]);
  assert.ok(result.suggestions.every((item) => item.partOfSpeech === "noun"));
  assert.equal(calls.filter((url) => url.hostname === "suggest.test").length, 1);
  assert.equal(calls.filter((url) => url.hostname === "dictionary.test").length, 2);
  assert.equal(calls.filter((url) => url.hostname === "translate.test").length, 2);
});

test("DictionaryService supports native-language input and resolves one selected term", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "translate.test") {
      const pair = url.searchParams.get("langpair");
      const translatedText = pair === "vi|en" ? "petal" : "cánh hoa &amp; cánh bông";
      return Response.json({
        responseStatus: 200,
        responseData: { translatedText, match: 0.96 },
      });
    }
    if (url.hostname === "suggest.test") {
      assert.equal(url.searchParams.get("s"), "petal");
      return Response.json([{ word: "petal", score: 100 }]);
    }
    if (url.hostname === "dictionary.test") {
      assert.match(url.pathname, /\/en\/petal$/);
      return Response.json(dictionaryPayload());
    }
    throw new Error(`Unexpected provider call: ${url}`);
  };
  const service = new DictionaryService(serviceConfig, { fetchImpl });

  const inverse = await service.suggest("cánh hoa", "en", "vi", {
    inputLanguage: "vi",
    limit: 8,
  });
  assert.equal(inverse.mode, "translated_prefix");
  assert.equal(inverse.lookupQuery, "petal");
  assert.equal(inverse.suggestions[0].term, "petal");

  const selected = await service.resolveSelection("petal", "en", "vi");
  assert.equal(selected.term, "petal");
  assert.equal(selected.definition, "a coloured segment of a flower");
  assert.equal(selected.translation, "cánh hoa & cánh bông");
  assert.equal(selected.translationProvider, "mymemory");
  assert.equal(selected.partOfSpeech, "noun");
  assert.equal(calls.filter((url) => url.hostname === "dictionary.test").length, 2);
  assert.equal(calls.filter((url) => url.hostname === "translate.test").length, 3);
});

test("DictionaryService suggests German titles and verifies the German Wiktionary section before saving", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "wiktionary.test" && url.searchParams.get("action") === "opensearch") {
      assert.equal(url.searchParams.get("search"), "hau");
      assert.equal(url.searchParams.get("limit"), "5");
      assert.equal(url.searchParams.get("namespace"), "0");
      return Response.json([
        "hau",
        ["Haus", "Hausarbeit", "hausen"],
        ["", "", ""],
        [
          "https://de.wiktionary.org/wiki/Haus",
          "https://de.wiktionary.org/wiki/Hausarbeit",
          "https://de.wiktionary.org/wiki/hausen",
        ],
      ]);
    }
    if (url.hostname === "wiktionary.test" && url.searchParams.get("action") === "query") {
      const title = url.searchParams.get("titles");
      assert.equal(url.searchParams.get("rvslots"), "main");
      return Response.json({
        query: {
          pages: [{
            pageid: 123,
            ns: 0,
            title,
            revisions: [{
              slots: {
                main: {
                  content: [
                    `== ${title} ({{Sprache|Deutsch}}) ==`,
                    `=== {{Wortart|${title === "hausen" ? "Verb" : "Substantiv"}|Deutsch}} ===`,
                    `:{{Lautschrift|${title === "Haus" ? "haʊ̯s" : "test"}}}`,
                  ].join("\n"),
                },
              },
            }],
          }],
        },
      });
    }
    if (url.hostname === "translate.test") {
      const term = url.searchParams.get("q");
      assert.equal(url.searchParams.get("langpair"), "de|vi");
      return Response.json({
        responseStatus: 200,
        responseData: {
          translatedText: {
            Haus: "ngôi nhà",
            Hausarbeit: "bài tập về nhà",
            hausen: "ở; cư trú",
          }[term],
          match: 0.98,
        },
      });
    }
    throw new Error(`Unexpected provider call: ${url}`);
  };
  const service = new DictionaryService(serviceConfig, { fetchImpl });

  const result = await service.suggest("hau", "de", "vi", {
    inputLanguage: "de",
    limit: 5,
  });
  assert.equal(result.supported, true);
  assert.equal(result.mode, "prefix");
  assert.equal(result.suggestionProvider, "wiktionary_de");
  assert.deepEqual(result.suggestions.map((item) => item.term), ["Haus", "Hausarbeit", "hausen"]);
  assert.deepEqual(
    result.suggestions.map((item) => item.translation),
    ["ngôi nhà", "bài tập về nhà", "ở; cư trú"],
  );
  assert.deepEqual(
    result.suggestions.map((item) => item.partOfSpeech),
    ["Substantiv", "Substantiv", "Verb"],
  );
  assert.equal(calls.filter((url) => url.searchParams.get("action") === "opensearch").length, 1);
  assert.equal(calls.filter((url) => url.searchParams.get("action") === "query").length, 3);
  assert.equal(calls.filter((url) => url.hostname === "translate.test").length, 3);

  const selected = await service.resolveSelection("Haus", "de", "vi");
  assert.equal(selected.term, "Haus", "German noun capitalization must be preserved");
  assert.equal(selected.translation, "ngôi nhà");
  assert.equal(selected.translationProvider, "mymemory");
  assert.equal(selected.partOfSpeech, "Substantiv");
  assert.equal(selected.pronunciation, "/haʊ̯s/");
  assert.equal(selected.provider, "wiktionary_de");
});

test("DictionaryService rejects a German Wiktionary page that has no German language section", async () => {
  let translationCalls = 0;
  const service = new DictionaryService(serviceConfig, {
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "wiktionary.test") {
        return Response.json({
          query: {
            pages: [{
              pageid: 456,
              ns: 0,
              title: "Gift",
              revisions: [{
                slots: {
                  main: { content: "== Gift ({{Sprache|Englisch}}) ==" },
                },
              }],
            }],
          },
        });
      }
      if (url.hostname === "translate.test") translationCalls += 1;
      throw new Error(`Unexpected provider call: ${url}`);
    },
  });

  await assert.rejects(
    () => service.resolveSelection("Gift", "de", "vi"),
    (error) => error.code === "DICTIONARY_SELECTION_NOT_VERIFIED" && error.status === 422,
  );
  assert.equal(translationCalls, 0, "an unverified page must never be sent to translation or saved");
});

test("DictionaryService reports unsupported learning languages without provider calls", async () => {
  let calls = 0;
  const service = new DictionaryService(serviceConfig, {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });
  const result = await service.suggest("sakura", "ja", "vi", {
    inputLanguage: "ja",
  });
  assert.equal(result.supported, false);
  assert.equal(result.reason, "LEARNING_LANGUAGE_NOT_SUPPORTED");
  assert.deepEqual(result.suggestions, []);
  assert.equal(calls, 0);

  await assert.rejects(
    () => service.resolveSelection("sakura", "ja", "vi"),
    (error) => error.code === "DICTIONARY_LANGUAGE_NOT_SUPPORTED" && error.status === 422,
  );
});

test("DictionaryService refuses to resolve a candidate not confirmed by the exact dictionary", async () => {
  const service = new DictionaryService(serviceConfig, {
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "dictionary.test") {
        return new Response(null, { status: 404 });
      }
      throw new Error(`Unexpected provider call: ${url}`);
    },
  });
  await assert.rejects(
    () => service.resolveSelection("petalll", "en", "vi"),
    (error) => error.code === "DICTIONARY_SELECTION_NOT_VERIFIED" && error.status === 422,
  );
});
