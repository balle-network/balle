/*
 * In-memory fixed-window counters with hard size caps, in two pools.
 *
 * Leaf keys (one address, one /64, one wallet) live in the main pool. When
 * it is full even after dropping expired windows, room is made by evicting
 * the lowest-count entry among a random sample, so a flood of one-shot keys
 * only ever pushes out other one-shot keys and heavy users keep their counts.
 *
 * Pinned keys (network aggregates, the shared "direct" key, site ceilings)
 * live in their own pool and are never evicted to make room for leaf keys.
 * That pool has its own, larger cap; only if it is full of live windows is
 * its own lowest-count entry dropped (a documented residual risk).
 */

export type MemoryLimiter = {
  add(key: string, cost: number, budget: number, windowSec: number, now?: number): boolean;
  size(): number;
  count(key: string): number;
};

type Entry = { count: number; resetAt: number };
const SAMPLE = 32;

function pool(maxKeys: number, random: () => number) {
  const table = new Map<string, Entry>();
  const order: string[] = [];
  let lastSweep = 0;

  const sweep = (now: number) => {
    if (now - lastSweep < 1000) return;
    lastSweep = now;
    for (const [k, v] of table) if (v.resetAt <= now) table.delete(k);
    let w = 0;
    for (const k of order) if (table.has(k)) order[w++] = k;
    order.length = w;
  };

  const evictOne = () => {
    let victimAt = -1;
    let lowest = Infinity;
    for (let n = 0; n < SAMPLE && order.length; n++) {
      const i = Math.floor(random() * order.length);
      const e = table.get(order[i]);
      if (e && e.count < lowest) {
        lowest = e.count;
        victimAt = i;
      }
    }
    if (victimAt < 0) return;
    table.delete(order[victimAt]);
    order[victimAt] = order[order.length - 1];
    order.pop();
  };

  return {
    table,
    entry(key: string, windowSec: number, now: number) {
      let entry = table.get(key);
      if (entry && entry.resetAt <= now) {
        entry.count = 0;
        entry.resetAt = now + windowSec * 1000;
      }
      if (!entry) {
        if (table.size >= maxKeys) sweep(now);
        while (table.size >= maxKeys) evictOne();
        entry = { count: 0, resetAt: now + windowSec * 1000 };
        table.set(key, entry);
        order.push(key);
      }
      return entry;
    },
  };
}

export function memoryLimiter(
  maxKeys = 10_000,
  isPinned: (key: string) => boolean = () => false,
  maxPinned = 20_000,
  random: () => number = Math.random,
): MemoryLimiter {
  const leaves = pool(maxKeys, random);
  const pinned = pool(maxPinned, random);
  return {
    add(key, cost, budget, windowSec, now = Date.now()) {
      const entry = (isPinned(key) ? pinned : leaves).entry(key, windowSec, now);
      entry.count += cost;
      return entry.count <= budget;
    },
    size: () => leaves.table.size + pinned.table.size,
    count: (key) => (isPinned(key) ? pinned : leaves).table.get(key)?.count ?? 0,
  };
}
