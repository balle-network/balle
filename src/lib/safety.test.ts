import { test } from "node:test";
import assert from "node:assert/strict";
import { asciiClean, blockedTerm, fieldProblems, fold, impersonates } from "./safety.ts";

test("lookalike letters fold to Latin", () => {
  assert.equal(fold("Rоbinhооd"), "robinhood"); // Cyrillic o
  assert.equal(fold("Ρ0ΝS"), "pons"); // Greek Rho/Nu and a zero
});

test("brand impersonation is caught through homoglyphs and separators", () => {
  assert.equal(impersonates("Rоbin-Hood Official"), "robinhood");
  assert.equal(impersonates("B.A.L.L.E"), "balle");
  assert.equal(impersonates("Spin Cycle"), null);
});

test("blocked words survive spacing, dots and digit swaps", () => {
  assert.equal(blockedTerm("n a z i frog"), "nazi");
  assert.equal(blockedTerm("n.a.z.i"), "nazi");
  assert.equal(blockedTerm("p0rn coin"), "porn");
  assert.equal(blockedTerm("grape juice"), null);
  assert.equal(blockedTerm("slurp the soup"), null);
});

test("names and tickers", () => {
  assert.deepEqual(fieldProblems("name", "Night Folder"), []);
  assert.ok(fieldProblems("name", "Nіght").length > 0, "non-ASCII i must fail");
  assert.deepEqual(fieldProblems("ticker", "FOLD"), []);
  assert.ok(fieldProblems("ticker", "FOLDERS").length > 0, "6 chars is too long for a drafted ticker");
  assert.deepEqual(fieldProblems("ticker", "FOLDERS", true), [], "a person may type up to 10");
  assert.ok(fieldProblems("ticker", "1ABC", true).length > 0, "must start with a letter");
  assert.ok(fieldProblems("ticker", "PONS").length > 0, "brand ticker refused");
});

test("no links or price promises in copy", () => {
  assert.ok(fieldProblems("description", "see www.example.com").length > 0);
  assert.ok(fieldProblems("description", "100x guaranteed").length > 0);
  assert.deepEqual(fieldProblems("description", "A pigeon folds socks at 3am."), []);
});

test("asciiClean strips control and non-ASCII characters", () => {
  assert.equal(asciiClean("Hi​ there‮!", 50), "Hi there !");
  assert.equal(asciiClean("“quoted” – dash…", 50), '"quoted" - dash...');
});
