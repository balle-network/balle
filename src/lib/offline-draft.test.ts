import { test } from "node:test";
import assert from "node:assert/strict";
import { offlineSuggestion } from "./offline-draft.ts";
import { fieldProblems } from "./safety.ts";

test("a rule-based start comes from the person's words and passes the usual checks", () => {
  const s = offlineSuggestion("a frog that only trades on mondays https://example.com/x");
  assert.equal(s.name, "Frog Only Trades");
  assert.match(s.ticker, /^[A-Z][A-Z0-9]{2,4}$/);
  assert.deepEqual(fieldProblems("ticker", s.ticker), []);
  assert.ok(!/https?:/.test(s.description), "links are dropped");
});

test("single words and odd input", () => {
  assert.equal(offlineSuggestion("pancakes").ticker, "PANCA");
  assert.deepEqual(offlineSuggestion("https://x.com/a/status/1"), { name: "", ticker: "", description: "" });
  assert.equal(offlineSuggestion("!!! ???").name, "");
  const long = offlineSuggestion("word ".repeat(100));
  assert.ok(long.description.length <= 240);
});

test("blocked or impersonating words are left for the person to fill in", () => {
  const s = offlineSuggestion("balle official");
  assert.equal(s.name, "");
});
