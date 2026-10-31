import { randomBytes } from "node:crypto";
import type { Store } from "@/lib/auth/store";

/*
 * Short exclusive locks with an owner token. A lock that expired while its
 * holder was still working may have been taken by another writer; the first
 * holder then must not release it, so release is compare-and-delete on the
 * token, never a plain delete.
 */

export async function acquire(store: Store, key: string, ttlSec: number): Promise<string | null> {
  const token = randomBytes(12).toString("hex");
  return (await store.setNx(key, token, ttlSec)) ? token : null;
}

export const release = (store: Store, key: string, token: string) => store.delIfEquals(key, token).catch(() => false);

/** Runs `fn` under the lock, or returns "busy" without running it. */
export async function withLock<T>(store: Store, key: string, ttlSec: number, fn: () => Promise<T>): Promise<T | "busy"> {
  const token = await acquire(store, key, ttlSec);
  if (!token) return "busy";
  try {
    return await fn();
  } finally {
    await release(store, key, token);
  }
}
