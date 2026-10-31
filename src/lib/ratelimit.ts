import "server-only";
import { getStore, isLocalStore } from "@/lib/auth/store";
import { memoryLimiter } from "@/lib/ratelimit-memory";

/*
 * Weighted fixed-window budgets that work with or without a store. The
 * capped in-memory counter is always charged and always decides first; with
 * Redis the shared counter is charged as well, so several server instances
 * add up. A store error never skips the in-memory check (no fail-open).
 */

// Aggregates, the shared "direct" key and site ceilings are pinned: leaf floods never evict them.
export const isPinnedKey = (key: string) => key.includes(":agg:") || key.endsWith(":direct") || key.endsWith(":site");
const memory = memoryLimiter(10_000, isPinnedKey, 20_000);

export async function spend(key: string, cost: number, budget: number, windowSec: number) {
  if (!memory.add(key, cost, budget, windowSec)) return false;
  const store = getStore();
  if (!store || isLocalStore(store)) return true; // the local store lives in this same process
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  const shared = await store.incrByEx(`rl:${key}:${slot}`, cost, windowSec + 5).catch(() => 0);
  return shared <= budget;
}
