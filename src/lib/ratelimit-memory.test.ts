import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryLimiter } from "./ratelimit-memory.ts";

const pinned = (k: string) => k.includes(":agg:") || k.endsWith(":direct") || k.endsWith(":site");

test("50,000 one-shot keys never grow the table past its cap, and a fresh user still gets through", () => {
  const limiter = memoryLimiter(10_000, pinned);
  for (let i = 0; i < 50_000; i++) limiter.add(`rpc:flood${i}`, 1, 100, 60, 1_000);
  assert.ok(limiter.size() <= 10_000, `size ${limiter.size()}`);
  assert.equal(limiter.add("rpc:fresh-user", 1, 100, 60, 1_000), true);
});

test("a heavy user is not evicted by a flood of one-shot keys", () => {
  const limiter = memoryLimiter(1_000, pinned);
  for (let i = 0; i < 101; i++) limiter.add("rpc:heavy", 1, 100, 60, 0);
  for (let i = 0; i < 50_000; i++) limiter.add(`rpc:flood${i}`, 1, 100, 60, 0);
  assert.equal(limiter.add("rpc:heavy", 1, 100, 60, 0), false);
});

test("aggregate and direct keys are never evicted by leaf floods", () => {
  const limiter = memoryLimiter(500, pinned);
  for (let i = 0; i < 1600; i++) limiter.add("rpc:agg:2001:db8:abcd::/48", 1, 1600, 60, 0);
  limiter.add("rpc:direct", 1, 1, 60, 0);
  for (let i = 0; i < 50_000; i++) limiter.add(`rpc:leaf${i}`, 1, 100, 60, 0);
  assert.equal(limiter.add("rpc:agg:2001:db8:abcd::/48", 1, 1600, 60, 0), false, "aggregate kept its count");
  assert.equal(limiter.add("rpc:direct", 1, 1, 60, 0), false, "direct kept its count");
});

test("the pinned pool is capped too", () => {
  const limiter = memoryLimiter(10, pinned, 100);
  for (let i = 0; i < 5_000; i++) limiter.add(`rpc:agg:${i}::/48`, 1, 10, 60, 0);
  assert.ok(limiter.size() <= 110);
});

test("expired windows are swept before anything live is evicted", () => {
  const limiter = memoryLimiter(100, pinned);
  for (let i = 0; i < 100; i++) limiter.add(`a${i}`, 5, 10, 1, 0);
  limiter.add("fresh", 1, 10, 1, 5_000);
  assert.equal(limiter.size(), 1);
});

test("a key's budget holds within its window and resets after", () => {
  const limiter = memoryLimiter(10);
  const hits = Array.from({ length: 12 }, () => limiter.add("x", 1, 10, 60, 0));
  assert.equal(hits.filter(Boolean).length, 10);
  assert.ok(limiter.add("x", 1, 10, 60, 61_000));
});

test("weighted costs count against the same budget", () => {
  const limiter = memoryLimiter(10);
  assert.ok(limiter.add("w", 10, 25, 60, 0));
  assert.ok(limiter.add("w", 10, 25, 60, 0));
  assert.equal(limiter.add("w", 10, 25, 60, 0), false);
});
