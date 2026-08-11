import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeQuizAnswer } from "../../client/src/lib/text.js";

test("typed review ignores capitalization, Vietnamese accents and punctuation", () => {
  assert.equal(normalizeQuizAnswer("cùng nhau"), normalizeQuizAnswer("Cùng nhau..."));
  assert.equal(normalizeQuizAnswer("CUNG NHAU!"), normalizeQuizAnswer("cùng nhau"));
  assert.equal(normalizeQuizAnswer("Đã hiểu"), normalizeQuizAnswer("da hieu"));
});

test("typed review tolerates common German orthography variants", () => {
  assert.equal(normalizeQuizAnswer("FÜR", "de"), normalizeQuizAnswer("fur", "de"));
  assert.equal(normalizeQuizAnswer("groß", "de"), normalizeQuizAnswer("gross", "de"));
  assert.equal(normalizeQuizAnswer("GROẞ", "de"), normalizeQuizAnswer("gross", "de"));
});
