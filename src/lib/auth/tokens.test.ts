import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { memoryStore } from "./store.ts";
import { issueNonce, openNonce, revokeSessions, sealSession, unsealSession, type KeySource } from "./tokens.ts";
import { recoverSigner } from "./verify.ts";

const store = memoryStore();
const src: KeySource = { store: () => store };
const A = privateKeyToAccount(`0x${"11".repeat(32)}`);
const B = privateKeyToAccount(`0x${"22".repeat(32)}`);
const a = A.address.toLowerCase();
const b = B.address.toLowerCase();

test("nonces are stateless: nothing is written when one is issued", async () => {
  await issueNonce(src, a, Date.now()); // creates the key once
  const before = JSON.stringify(await store.mget(["auth:hmac-key"]));
  for (let i = 0; i < 50; i++) await issueNonce(src, a, Date.now());
  assert.equal(JSON.stringify(await store.mget(["auth:hmac-key"])), before);
});

test("a nonce is bound to its address and expires", async () => {
  const now = Date.now();
  const n = await issueNonce(src, a, now);
  assert.deepEqual(await openNonce(src, a, n, now + 1000, 300_000), { issuedAt: now });
  assert.ok("error" in (await openNonce(src, b, n, now, 300_000)), "another address cannot use it");
  assert.ok("error" in (await openNonce(src, a, n, now + 301_000, 300_000)), "expired");
  assert.ok("error" in (await openNonce(src, a, n.replace(/\.(\d{13})\./, `.${now + 5}.`), now, 300_000)), "issuedAt cannot be moved");
  assert.ok("error" in (await openNonce(src, a, "deadbeef", now, 300_000)));
  // Issuing many nonces for a victim's address does not invalidate the victim's own.
  for (let i = 0; i < 20; i++) await issueNonce(src, a, now);
  assert.ok("issuedAt" in (await openNonce(src, a, n, now, 300_000)));
});

test("personal_sign signatures recover only for the exact message", async () => {
  const msg = "balle.network wants you to sign in with your Ethereum account";
  const sig = await A.signMessage({ message: msg });
  assert.equal(recoverSigner(msg, sig), a);
  assert.notEqual(recoverSigner(msg + " ", sig), a);
  assert.notEqual(recoverSigner(msg, sig), b);
  assert.equal(recoverSigner(msg, "0xdeadbeef"), null, "malformed signature refused");
});

test("session cookies are signed, expire, and cannot be re-pointed at another wallet", async () => {
  const now = Date.now();
  const v = await sealSession(src, a, now + 60_000);
  assert.equal(await unsealSession(src, v, now), a);
  assert.equal(await unsealSession(src, v, now + 61_000), null);
  assert.equal(await unsealSession(src, v.replace(a, b), now), null);
  assert.equal(await unsealSession(src, v.replace(/\.(\d{13})\./, `.${now + 9_999_999}.`), now), null);
  const other: KeySource = { store: () => memoryStore() };
  assert.equal(await unsealSession(other, v, now), null, "a different key rejects it");
});

test("signing out ends every outstanding cookie of that wallet, copies included", async () => {
  const s = memoryStore();
  const k: KeySource = { store: () => s };
  const now = Date.now();
  const phone = await sealSession(k, a, now + 60_000);
  const copied = phone;
  const other = await sealSession(k, b, now + 60_000);
  assert.equal(await unsealSession(k, copied, now), a);
  await revokeSessions(k, a);
  assert.equal(await unsealSession(k, phone, now), null);
  assert.equal(await unsealSession(k, copied, now), null);
  assert.equal(await unsealSession(k, other, now), b, "other wallets are untouched");
  const fresh = await sealSession(k, a, now + 60_000);
  assert.equal(await unsealSession(k, fresh, now), a, "a new sign-in works again");
  assert.equal(await unsealSession(k, fresh.replace(/\.(\d+)\.([A-Za-z0-9_-]{43})$/, ".0.$2"), now), null, "an old epoch cannot be forged in");
});
