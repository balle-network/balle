import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./auth/store.ts";
import { talk, talkPerHour } from "./minds.ts";
import type { Launch } from "./registry.ts";

const launch: Launch = {
  token: "0xcccccccccccccccccccccccccccccccccccccccc",
  curve: "0xdddddddddddddddddddddddddddddddddddddddd",
  deployer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Night Folder",
  symbol: "FOLD",
  logo: "",
  description: "",
  tagline: "",
  pairToken: "0x0000000000000000000000000000000000000000",
  tx: "0x" + "1".repeat(64),
  block: 1,
  launchedAt: Date.now(),
  mind: "stoic",
  mindCustom: "",
  post: "",
  links: { x: "", telegram: "", website: "" },
};
const WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("a wallet that holds none of the coin cannot make the mind answer", async () => {
  const r = await talk(memoryStore(), launch, WALLET, "hello", async () => 0n);
  assert.ok("error" in r && r.status === 403);
});

test("the hourly reply ceiling stops paid calls", async () => {
  const store = memoryStore();
  const hour = Math.floor(Date.now() / 3_600_000);
  await store.incrByEx(`mind:talk:hour:${hour}`, talkPerHour(), 3700);
  const r = await talk(store, launch, WALLET, "hello", async () => 10n ** 18n);
  assert.ok("error" in r && r.status === 429);
});
