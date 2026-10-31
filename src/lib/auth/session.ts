import "server-only";
import { cookies } from "next/headers";
import { BRAND, CHAIN, isAddress } from "@/config/brand";
import { signInDomain } from "@/lib/auth/auth";
import { getStore } from "@/lib/auth/store";
import { issueNonce, openNonce, revokeSessions, sealSession, unsealSession, type KeySource } from "@/lib/auth/tokens";
import { recoverSigner } from "@/lib/auth/verify";

/*
 * Sign-In With Ethereum (EIP-4361), with no server-side state for strangers.
 *
 * Challenge: the nonce is `random.issuedAt.HMAC(key, address|issuedAt|random)`,
 * so the server stores nothing when it hands one out (no table to flood, no
 * pending nonce an attacker could replace). Verify: the HMAC and the 5-minute
 * window are checked, the exact message is rebuilt for this site's own domain
 * and the personal_sign signer is recovered and compared with the address
 * (lowercase). Only then is the nonce burned (a short-lived "used" mark, written
 * only for a valid signature) so it cannot be replayed.
 *
 * Session: an HMAC-signed httpOnly cookie carrying the wallet, its expiry and
 * the wallet's session epoch; no server map. Signing out bumps the epoch, so
 * every cookie issued for that wallet (copies included) stops working. The key is created once in the store (SET NX), or per
 * process when there is no store. Signing is free and sends nothing on chain.
 */

export const SESSION_COOKIE = "balle_session";
export const SESSION_TTL = 3 * 24 * 3600;
export const CHALLENGE_TTL = 5 * 60;

export function buildMessage(domain: string, address: string, nonce: string, issued: Date) {
  const expires = new Date(issued.getTime() + CHALLENGE_TTL * 1000);
  const scheme = domain.startsWith("localhost") || domain.startsWith("127.0.0.1") ? "http" : "https";
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    `Sign in to ${BRAND.name}. This is free and sends nothing on chain.`,
    "",
    `URI: ${scheme}://${domain}`,
    "Version: 1",
    `Chain ID: ${CHAIN.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issued.toISOString()}`,
    `Expiration Time: ${expires.toISOString()}`,
  ].join("\n");
}

const keys: KeySource = { store: () => getStore() };

const lower = (a: string) => a.toLowerCase();

export async function createChallenge(host: string | null, address: string) {
  if (!isAddress(address)) return null;
  address = lower(address);
  const now = new Date();
  const nonce = await issueNonce(keys, address, now.getTime());
  return { message: buildMessage(signInDomain(host), address, nonce, now), nonce };
}

/** Checks nonce, window and signature, then burns the nonce. Returns the lowercase wallet or an error. */
export async function verifyChallenge(host: string | null, address: string, nonce: string, signature: string): Promise<{ wallet: string } | { error: string }> {
  if (!isAddress(address)) return { error: "Connect a wallet first." };
  address = lower(address);
  const opened = await openNonce(keys, address, nonce, Date.now(), CHALLENGE_TTL * 1000);
  if ("error" in opened) return opened;
  const message = buildMessage(signInDomain(host), address, nonce, new Date(opened.issuedAt));
  if (recoverSigner(message, signature) !== address) return { error: "The signature does not match this wallet." };
  const store = getStore();
  if (store && !(await store.setNx(`auth:used:${nonce.slice(0, 24)}`, "1", CHALLENGE_TTL * 2))) return { error: "This sign-in request was already used." };
  return { wallet: address };
}

export async function openSession(wallet: string) {
  return { value: await sealSession(keys, wallet, Date.now() + SESSION_TTL * 1000), maxAge: SESSION_TTL };
}

/** The signed-in wallet (lowercase 0x) for this request, or null. */
export async function sessionWallet(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  if (!raw) return null;
  return unsealSession(keys, raw, Date.now());
}

/** Signs the wallet out everywhere: its outstanding cookies all stop working. */
export async function endSessions(wallet: string) {
  await revokeSessions(keys, wallet);
}

export const sessionCookie = (value: string, maxAge: number) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCALHOST_SIGNIN,
  path: "/",
  maxAge,
});
