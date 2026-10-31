import { test } from "node:test";
import assert from "node:assert/strict";
import { capEntries } from "./store.ts";

test("the local store has a hard cap that drops the soonest-expiring entries first", () => {
  const now = Date.now();
  const kv: Record<string, { expires: number | null }> = { draft: { expires: now + 30 * 86400_000 }, key: { expires: null } };
  for (let i = 0; i < 100; i++) kv[`rl:${i}`] = { expires: now + 60_000 + i };
  assert.equal(capEntries(kv, 10), 92);
  assert.equal(Object.keys(kv).length, 10);
  assert.ok(kv.draft && kv.key, "long-lived entries survive a flood of short ones");
  assert.equal(capEntries(kv, 10), 0);
});
