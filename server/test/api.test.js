import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db.js";

let server;
let baseUrl;
let cookie = "";
let db;
let mongo;

const testConfig = {
  serverRoot: new URL("..", import.meta.url).pathname,
  port: 0,
  clientUrl: "http://localhost:5173",
  sessionSecret: "integration-test-secret",
  secureCookies: false,
  demoAuthEnabled: true,
  google: { clientId: "", clientSecret: "", callbackUrl: "http://localhost/callback" },
  mongoUri: "",
  mongoDbName: "lingobloom_test",
  dictionary: { provider: "free_dictionary", baseUrl: "https://example.invalid" },
  serveClient: false,
  nodeEnv: "test",
};

const dictionaryService = {
  providerName: "test_dictionary",
  async search(query, sourceLanguage, targetLanguage) {
    return [{
      term: query,
      word: query,
      translation: "a test definition",
      pronunciation: "/test/",
      partOfSpeech: "noun",
      example: "This is a test.",
      sourceLanguage,
      targetLanguage,
      definitions: [],
    }];
  },
};

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  testConfig.mongoUri = mongo.getUri("lingobloom_test");
  db = await createDatabase(testConfig);
  const app = await createApp({ config: testConfig, db, dictionaryService });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  if (db) await db.close();
  if (mongo) await mongo.stop();
});

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, body });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

test("LingoBloom API supports the complete local learning flow", async (t) => {
  await t.test("protects private data before login", async () => {
    const { response, payload } = await request("/api/words");
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "AUTH_REQUIRED");
  });

  await t.test("exposes config and starts a cookie-backed demo session", async () => {
    const configResult = await request("/api/config");
    assert.equal(configResult.response.status, 200);
    assert.equal(configResult.payload.googleOAuthConfigured, false);
    assert.equal(configResult.payload.demoMode, true);

    const login = await request("/api/auth/demo", { method: "POST" });
    assert.equal(login.response.status, 200);
    assert.equal(login.payload.user.id, "demo-user");
    assert.match(cookie, /^lingobloom\.sid=/);

    const me = await request("/api/auth/me");
    assert.equal(me.payload.authenticated, true);
    assert.equal(me.payload.user.preferences.learningLanguage, "en");
    assert.equal(me.payload.user.onboardingCompleted, false);

    const preferences = await request("/api/users/me/preferences", {
      method: "PATCH",
      body: { learningLanguage: "en", nativeLanguage: "vi" },
    });
    assert.equal(preferences.response.status, 200);
    assert.equal(preferences.payload.user.onboardingCompleted, true);
  });

  let wordId;
  await t.test("creates, bookmarks, searches, updates and reads a scoped word", async () => {
    const created = await request("/api/words", {
      method: "POST",
      body: {
        term: "moonbeam-api-test",
        translation: "tia trăng",
        example: "A moonbeam crossed the room.",
      },
    });
    assert.equal(created.response.status, 201);
    wordId = created.payload.word.id;
    assert.equal(typeof wordId, "string");
    assert.ok(wordId.length > 0);
    assert.equal(created.payload.word.bookmarked, false);
    assert.equal(created.payload.word.nextReviewAt, created.payload.word.dueAt);

    const duplicate = await request("/api/words", {
      method: "POST",
      body: { term: "moonbeam-api-test", translation: "trùng" },
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.payload.error.code, "DUPLICATE_ITEM");

    const updated = await request(`/api/words/${wordId}`, {
      method: "PATCH",
      body: { bookmarked: true, notes: "remember this" },
    });
    assert.equal(updated.payload.word.bookmarked, true);
    assert.equal(updated.payload.word.notes, "remember this");

    const search = await request("/api/words?q=moonbeam-api-test&bookmarked=true");
    assert.equal(search.response.status, 200);
    assert.equal(search.payload.data.length, 1);
    assert.equal(search.payload.data[0].id, wordId);
  });

  let structureId;
  await t.test("supports sentence structure CRUD", async () => {
    const created = await request("/api/structures", {
      method: "POST",
      body: { pattern: "Hardly had + S + V3 when...", meaning: "Vừa mới... thì..." },
    });
    assert.equal(created.response.status, 201);
    structureId = created.payload.structure.id;
    const updated = await request(`/api/structures/${structureId}`, {
      method: "PATCH",
      body: { bookmarked: true },
    });
    assert.equal(updated.payload.structure.bookmarked, true);
  });

  await t.test("imports literal-tab TXT rows and reports duplicates", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([
        "term\\ttranslation\\texample\n" +
          "orbit-api-test\\tquỹ đạo\\tThe moon follows an orbit.\n" +
          "orbit-api-test\\ttrùng lặp\\tDuplicate row.\n",
      ], { type: "text/plain" }),
      "words.txt",
    );
    form.append("kind", "words");
    form.append("learningLanguage", "en");
    form.append("nativeLanguage", "vi");
    const imported = await request("/api/import", { method: "POST", body: form });
    assert.equal(imported.response.status, 201);
    assert.equal(imported.payload.imported, 1);
    assert.equal(imported.payload.skipped, 1);
    assert.equal(imported.payload.format.delimiter, "tab");

    const structuresForm = new FormData();
    structuresForm.append(
      "file",
      new Blob(["pattern\tmeaning\nSo + adjective + that...\tQuá... đến nỗi...\n"], { type: "text/plain" }),
      "structures.txt",
    );
    structuresForm.append("kind", "structures");
    const importedStructures = await request("/api/import", { method: "POST", body: structuresForm });
    assert.equal(importedStructures.response.status, 201);
    assert.equal(importedStructures.payload.imported, 1);
    const structureSearch = await request("/api/structures?q=So%20%2B%20adjective");
    assert.equal(structureSearch.payload.structures[0].meaning, "Quá... đến nỗi...");
  });

  await t.test("looks up through the dictionary abstraction", async () => {
    const lookup = await request("/api/dictionary/search?q=petal&source=en&target=vi");
    assert.equal(lookup.response.status, 200);
    assert.equal(lookup.payload.entries[0].term, "petal");
    assert.equal(lookup.payload.meta.provider, "test_dictionary");

    const invalidEntry = await request("/api/dictionary/import", {
      method: "POST",
      body: { term: "petal", entryIndex: 99 },
    });
    assert.equal(invalidEntry.response.status, 400);
    assert.equal(invalidEntry.payload.error.code, "INVALID_DICTIONARY_ENTRY");
  });

  await t.test("records a review, reschedules the card and updates stats", async () => {
    const dueBefore = await request("/api/reviews/due?limit=20");
    assert.equal(dueBefore.response.status, 200);
    assert.ok(dueBefore.payload.cards.some((card) => card.itemType === "word"));
    assert.ok(dueBefore.payload.cards.some((card) => card.itemType === "structure"));
    assert.ok(dueBefore.payload.cards.some((card) => card.itemId === wordId));

    const bookmarkedDue = await request("/api/reviews/due?limit=20&bookmarked=true");
    assert.equal(bookmarkedDue.response.status, 200);
    assert.ok(bookmarkedDue.payload.cards.every((card) => card.item.bookmarked));

    const invalidType = await request("/api/reviews", {
      method: "POST",
      body: { id: wordId, type: "sentence", rating: "good" },
    });
    assert.equal(invalidType.response.status, 400);
    assert.equal(invalidType.payload.error.code, "INVALID_ITEM_TYPE");

    const reviewed = await request("/api/reviews", {
      method: "POST",
      body: { id: wordId, type: "word", rating: "good" },
    });
    assert.equal(reviewed.response.status, 201);
    assert.equal(reviewed.payload.review.correct, true);
    assert.equal(typeof reviewed.payload.review.id, "string");
    assert.ok(new Date(reviewed.payload.review.nextDueAt).getTime() > Date.now());

    const storedReview = await db.models.Review.findOne({
      userId: "demo-user",
      itemId: wordId,
    }).lean();
    assert.ok(storedReview, "the review transaction should persist in MongoDB");
    assert.equal(storedReview.correct, true);

    const dueAfter = await request("/api/reviews/due?limit=200");
    assert.ok(dueAfter.payload.cards.every((card) => card.itemId !== wordId));

    const stats = await request("/api/stats");
    assert.equal(stats.response.status, 200);
    assert.ok(stats.payload.totalWords >= 5);
    assert.ok(stats.payload.reviews >= 1);
    assert.ok(stats.payload.reviewedToday >= 1);
  });

  await t.test("deletes created content and ends the session", async () => {
    const deletedWord = await request(`/api/words/${wordId}`, { method: "DELETE" });
    assert.equal(deletedWord.payload.success, true);
    const deletedStructure = await request(`/api/structures/${structureId}`, { method: "DELETE" });
    assert.equal(deletedStructure.payload.success, true);

    const logout = await request("/api/auth/logout", { method: "POST" });
    assert.equal(logout.payload.success, true);
    cookie = "";
    const privateResult = await request("/api/stats");
    assert.equal(privateResult.response.status, 401);
  });
});
