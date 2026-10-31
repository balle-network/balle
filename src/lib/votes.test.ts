import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./auth/store.ts";
import { acquire, release, withLock } from "./lock.ts";
import { castVote, type BalanceAt, type Poll } from "./votes.ts";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc";

async function seed() {
  const store = memoryStore();
  const poll: Poll = {
    id: "abcdefghijk",
    token: TOKEN,
    symbol: "FOLD",
    name: "Night Folder",
    question: "What now?",
    creator: A,
    openedAt: Date.now(),
    closesAt: Date.now() + 3_600_000,
    snapshotBlock: 1000,
    fromBlock: 10,
    tally: { Burn: 0, "Buy back": 0, Airdrop: 0, Hold: 0 },
    voters: 0,
  };
  await store.setEx(`poll:${poll.id}`, JSON.stringify(poll), 7200);
  return { store, poll };
}

test("moving tokens to a fresh wallet after the snapshot adds no weight", async () => {
  const { store, poll } = await seed();
  // Chain history: A held 500 at block 1000; at block 1001 A sent all 500 to B.
  const transfers = [
    { block: 50, from: "mint", to: A, amount: 500n * 10n ** 18n },
    { block: 1001, from: A, to: B, amount: 500n * 10n ** 18n },
  ];
  const balanceAt: BalanceAt = async (_t, wallet, from, at) =>
    transfers.filter((x) => x.block >= from && x.block <= at).reduce((s, x) => s + (x.to === wallet ? x.amount : 0n) - (x.from === wallet ? x.amount : 0n), 0n);
  const first = await castVote(store, poll.id, A, "Burn", balanceAt);
  assert.ok("poll" in first);
  assert.equal(first.poll.tally.Burn, 500);
  const again = await castVote(store, poll.id, A, "Burn", balanceAt);
  assert.ok("error" in again && again.status === 409, "second vote from the same wallet");
  const moved = await castVote(store, poll.id, B, "Burn", balanceAt);
  assert.ok("error" in moved && moved.status === 403, "fresh wallet had nothing at the snapshot");
  const final = JSON.parse((await store.get(`poll:${poll.id}`))!) as Poll;
  assert.equal(final.tally.Burn, 500);
  assert.equal(final.voters, 1);
});

test("a lock taken over by another writer is not released by the first", async () => {
  const store = memoryStore();
  const first = await acquire(store, "lk", 10);
  assert.ok(first);
  // The first holder's lock expires; a second writer takes it.
  await store.del("lk");
  const second = await acquire(store, "lk", 10);
  assert.ok(second);
  assert.equal(await release(store, "lk", first!), false);
  assert.equal(await store.get("lk"), second);
  assert.equal(await release(store, "lk", second!), true);
  assert.equal(await store.get("lk"), null);
});

test("withLock refuses a busy key and releases its own", async () => {
  const store = memoryStore();
  await store.setNx("busy", "someone", 10);
  assert.equal(await withLock(store, "busy", 10, async () => 1), "busy");
  assert.equal(await withLock(store, "free", 10, async () => 2), 2);
  assert.equal(await store.get("free"), null);
});
