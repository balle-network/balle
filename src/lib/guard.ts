import "server-only";
import { NextResponse } from "next/server";
import type { Store } from "@/lib/auth/store";
import { networkAggregate, networkKey } from "@/lib/netkey";
import { spend } from "@/lib/ratelimit";

/*
 * Request guards shared by every write endpoint: a hard cap on body size,
 * the caller's IP, and fixed-window rate limits keyed on the verified
 * session address and the IP (never on anything the caller names itself).
 */

export const MAX_BODY = 4096;

/**
 * Reads the body as text but stops at `max` bytes: a chunked body has no
 * content-length, so request.text() alone would buffer whatever is sent.
 * Returns null when the body is larger than `max`.
 */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  const bytes = await readCappedBytes(request, max);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** The raw body, stopping at `max` bytes (null when larger). */
export async function readCappedBytes(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}

/** Parses a small JSON body; null when it is missing, malformed or too large. */
export async function readJson<T>(request: Request, max = MAX_BODY): Promise<T | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  try {
    const text = await readCapped(request, max);
    if (text === null) return null;
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Like readJson, but says why a body was refused: 413 when it is larger than
 * `max` bytes, 400 when it is not JSON. Size is checked on the declared
 * length first and again on the bytes actually read.
 */
export async function readBody<T>(request: Request, max = MAX_BODY): Promise<{ data: T } | { response: NextResponse }> {
  const tooLarge = () => ({ response: NextResponse.json({ error: "Request body too large." }, { status: 413 }) });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return tooLarge();
  let text: string | null;
  try {
    text = await readCapped(request, max);
  } catch {
    return { response: badBody() };
  }
  if (text === null) return tooLarge();
  try {
    const data = JSON.parse(text) as T;
    if (!data || typeof data !== "object") return { response: badBody() };
    return { data };
  } catch {
    return { response: badBody() };
  }
}

/**
 * Forwarded-for headers are only believed where something trustworthy wrote
 * them: on Vercel (its edge sets them) or when the operator opts in with
 * TRUST_PROXY_HEADERS=1 behind their own proxy. Anywhere else a caller can
 * put any address there, so every request shares the key "direct".
 */
export const trustProxyHeaders = () => Boolean(process.env.VERCEL) || process.env.TRUST_PROXY_HEADERS === "1";

const IP = /^[0-9a-fA-F:.[\]%]{2,64}$/;
const first = (v: string | null) => (v ? v.split(",")[0].trim() : "");

/**
 * The caller's address as seen by the trusted hop, or null when the headers
 * cannot be trusted. On Vercel: x-vercel-forwarded-for, then x-forwarded-for
 * (both written by the edge). Behind an operator proxy (TRUST_PROXY_HEADERS=1):
 * the header named in CLIENT_IP_HEADER if the operator set one (only for a
 * proxy that overwrites it), else the RIGHTMOST x-forwarded-for hop, counted
 * back TRUSTED_PROXY_HOPS entries (default 1). The leftmost entries are
 * client-controlled and x-real-ip is not read unless named explicitly.
 */
export function clientAddress(request: Request): string | null {
  if (process.env.VERCEL) {
    const ip = first(request.headers.get("x-vercel-forwarded-for")) || first(request.headers.get("x-forwarded-for"));
    return IP.test(ip) ? ip : null;
  }
  if (process.env.TRUST_PROXY_HEADERS !== "1") return null;
  const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named && /^[a-z0-9-]{1,64}$/.test(named)) {
    const ip = first(request.headers.get(named));
    return IP.test(ip) ? ip : null;
  }
  const chain = (request.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
  const ip = chain.length >= hops ? chain[chain.length - hops] : "";
  return IP.test(ip) ? ip : null;
}

/** Primary rate-limit key: IPv4 address or IPv6 /64, or "direct". */
export function clientIp(request: Request) {
  const ip = clientAddress(request);
  return ip ? networkKey(ip) : "direct";
}

/**
 * Every key a request is charged to, with its budget multiplier: the address
 * (or /64) at 1x and its /24 (or /48) at 16x. Untrusted: one shared key.
 * Used only for cost and abuse limits before a wallet is verified; limits
 * keyed on a verified wallet never use aggregates.
 */
export function networkKeys(request: Request): { key: string; weight: number }[] {
  const ip = clientAddress(request);
  if (!ip) return [{ key: "direct", weight: 1 }];
  return [
    { key: networkKey(ip), weight: 1 },
    { key: `agg:${networkAggregate(ip)}`, weight: 16 },
  ];
}

/**
 * True when every key is still within `max` per `windowSec`. Counted in
 * memory (capped) and in the store when there is one; a failing store
 * never lets a request through unchecked.
 */
export async function allow(_store: Store | null, bucket: string, keys: string[], max: number, windowSec: number) {
  const results = await Promise.all(keys.map((k) => spend(`${bucket}:${k}`, 1, max, windowSec)));
  return results.every(Boolean);
}

/** Charges `cost` to the caller's network keys (address 1x, aggregate 16x). */
export async function allowNetwork(request: Request, bucket: string, max: number, windowSec: number, cost = 1) {
  const keys = networkKeys(request);
  const results = await Promise.all(keys.map((k) => spend(`${bucket}:${k.key}`, cost, max * k.weight, windowSec)));
  return results.every(Boolean);
}

/**
 * Limit for endpoints open to anonymous callers: per network, plus a
 * site-wide ceiling when the network key cannot be trusted.
 */
export async function allowPublic(_store: Store | null, request: Request, bucket: string, perIp: number, site: number) {
  if (!(await allowNetwork(request, bucket, perIp, 60))) return false;
  return trustProxyHeaders() || spend(`${bucket}:site`, 1, site, 60);
}

export const tooMany = () => NextResponse.json({ error: "Too many requests. Slow down a little." }, { status: 429 });
export const badBody = () => NextResponse.json({ error: "Invalid or oversized request body." }, { status: 400 });

/**
 * Limit for the sign-in endpoints. A known client address gets its own
 * budget (`max` per `windowSec`). When the address cannot be trusted (a
 * self-hosted run without a proxy), every such caller shares one generous
 * site-wide ceiling (`sharedPerMin` per minute) instead of going unlimited.
 */
export async function allowPerIp(request: Request, bucket: string, max: number, windowSec: number, sharedPerMin = 600) {
  const ip = clientAddress(request);
  if (!ip) return spend(`${bucket}:unknown:site`, 1, sharedPerMin, 60);
  return spend(`${bucket}:${networkKey(ip)}`, 1, max, windowSec);
}
