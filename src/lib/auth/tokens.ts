import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Store } from "@/lib/auth/store";

/*
 * Stateless sign-in nonces and signed session cookies (HMAC-SHA256). The key
 * is created once in the store with SET NX, so every server instance shares
 * it; without a store each process makes its own (sessions then end with the
 * process, which only happens in local runs).
 */

export type KeySource = { store: () => Store | null };

const KEY_NAME = "auth:hmac-key";
let processKey: string | null = null;
let cachedKey: { store: Store; key: string } | null = null;

export async function hmacKey(src: KeySource): Promise<string> {
  const store = src.store();
  if (!store) return (processKey ??= randomBytes(32).toString("hex"));
  if (cachedKey && cachedKey.store === store) return cachedKey.key;
  const fresh = randomBytes(32).toString("hex");
  // Ten years: the key outlives every session it signs; losing it only signs everyone out.
  await store.setNx(KEY_NAME, fresh, 10 * 365 * 86400);
  const key = (await store.get(KEY_NAME)) ?? fresh;
  cachedKey = { store, key };
  return key;
}

const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** `random.issuedAt.mac` bound to the address; nothing is stored. */
export async function issueNonce(src: KeySource, address: string, issuedAt: number) {
  const random = randomBytes(12).toString("hex");
  return `${random}.${issuedAt}.${mac(await hmacKey(src), `nonce|${address}|${issuedAt}|${random}`)}`;
}

export async function openNonce(src: KeySource, address: string, nonce: string, now: number, windowMs: number): Promise<{ issuedAt: number } | { error: string }> {
  const m = /^([0-9a-f]{24})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(nonce);
  if (!m) return { error: "Unknown sign-in request." };
  const issuedAt = Number(m[2]);
  if (!same(m[3], mac(await hmacKey(src), `nonce|${address}|${issuedAt}|${m[1]}`))) return { error: "Unknown sign-in request." };
  if (issuedAt > now + 30_000 || now - issuedAt > windowMs) return { error: "This sign-in request expired. Try again." };
  return { issuedAt };
}

/*
 * Sessions carry the wallet's session epoch (auth:epoch:<wallet>, 0 until
 * first used). Signing out bumps it, which ends every cookie issued for that
 * wallet so far, copies included.
 */
const epochKey = (wallet: string) => `auth:epoch:${wallet}`;

export async function sessionEpoch(src: KeySource, wallet: string): Promise<number> {
  const raw = await src.store()?.get(epochKey(wallet));
  const n = Number(raw ?? 0);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/** Ends every outstanding session of `wallet`. */
export async function revokeSessions(src: KeySource, wallet: string): Promise<void> {
  await src.store()?.incr(epochKey(wallet));
}

/** Session cookie value: `wallet.expiresAt.epoch.mac`. */
export async function sealSession(src: KeySource, wallet: string, expiresAt: number) {
  const epoch = await sessionEpoch(src, wallet);
  return `${wallet}.${expiresAt}.${epoch}.${mac(await hmacKey(src), `session|${wallet}|${expiresAt}|${epoch}`)}`;
}

export async function unsealSession(src: KeySource, value: string, now: number): Promise<string | null> {
  const m = /^(0x[0-9a-f]{40})\.(\d{13})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return null;
  const expiresAt = Number(m[2]);
  if (expiresAt < now) return null;
  // Signature first (cheap, no I/O), then the epoch read.
  if (!same(m[4], mac(await hmacKey(src), `session|${m[1]}|${expiresAt}|${m[3]}`))) return null;
  return Number(m[3]) === (await sessionEpoch(src, m[1])) ? m[1] : null;
}
