/**
 * Unit tests for keyword matching normalisation (macron + Unicode handling).
 *
 *   npx tsx src/lib/engine/__test__/keywords.test.ts
 *
 * Plain Node assertions — no test framework. Exits non-zero if any case fails.
 */

import assert from "node:assert/strict";
import { matchArticleToEntities, normaliseForMatching } from "@/lib/engine/keywords";
import type { Article, Entity } from "@/lib/types";

function makeArticle(title: string, body: string): Article {
  return {
    id: "test-article",
    source: "rnz",
    url: "https://example.com/test",
    title,
    body,
    publishedAt: new Date("2026-06-08T00:00:00Z"),
    ingestedAt: new Date("2026-06-08T00:00:00Z"),
    paywalled: false,
  };
}

function makeEntity(keywords: string[]): Entity {
  return {
    id: "test-entity",
    name: "Test Entity",
    aliases: [],
    keywords,
    recipients: [],
    description: "",
  };
}

/** True if the entity's keywords match the given article title/body. */
function matches(articleText: { title?: string; body?: string }, keyword: string): boolean {
  const article = makeArticle(articleText.title ?? "", articleText.body ?? "");
  const result = matchArticleToEntities(article, [makeEntity([keyword])]);
  return result.length > 0 && result[0].matchedKeywords.includes(keyword);
}

// Precomposed: single code point U+0101 ("ā").
const KAINGA_PRECOMPOSED = "K\u0101inga Ora"; // "Kāinga Ora"
// Decomposed: plain "a" (U+0061) + combining macron (U+0304).
const KAINGA_DECOMPOSED = "Ka\u0304inga Ora"; // "Kāinga Ora"

const tests: Array<[string, () => void]> = [
  [
    "1. missing macron: 'Kainga Ora' text matches 'Kāinga Ora' keyword",
    () => {
      assert.equal(
        matches({ body: "The government agency Kainga Ora announced new homes." }, KAINGA_PRECOMPOSED),
        true
      );
    },
  ],
  [
    "2a. encoding: precomposed text matches decomposed keyword",
    () => {
      assert.equal(
        matches({ body: `News about ${KAINGA_PRECOMPOSED} today.` }, KAINGA_DECOMPOSED),
        true
      );
    },
  ],
  [
    "2b. encoding: decomposed text matches precomposed keyword",
    () => {
      assert.equal(
        matches({ body: `News about ${KAINGA_DECOMPOSED} today.` }, KAINGA_PRECOMPOSED),
        true
      );
    },
  ],
  [
    "3. no regression: plain ASCII keyword still matches normally",
    () => {
      assert.equal(matches({ body: "A report on housing policy." }, "housing"), true);
      // whole-word semantics preserved: substring of a larger word does not match
      assert.equal(matches({ body: "The kiwifruit industry grew." }, "iwi"), false);
    },
  ],
  [
    "4. case-insensitive: differing case still matches",
    () => {
      assert.equal(matches({ title: "KĀINGA ORA STATEMENT", body: "" }, "kāinga ora"), true);
    },
  ],
  [
    "bonus. normaliseForMatching folds macrons + encodings to the same form",
    () => {
      assert.equal(normaliseForMatching(KAINGA_PRECOMPOSED), "kainga ora");
      assert.equal(normaliseForMatching(KAINGA_DECOMPOSED), "kainga ora");
    },
  ],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
