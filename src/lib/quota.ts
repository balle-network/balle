import "server-only";
import type { Store } from "@/lib/auth/store";

/*
 * Per-wallet daily allowances (UTC day). They sit on top of the site-wide
 * hourly ceilings in src/lib/llm/openrouter.ts: a wallet can never spend more
 * than its allowance, and all wallets together never more than the ceiling.
 * An allowance is taken BEFORE the paid call and is not refunded when the
 * call fails, so a failing request cannot be hammered for free.
 */

export const ALLOWANCE = {
  messages: 30,
  art: 10,
  uploads: 30,
  drafts: 12,
  talk: 20,
} as const;
export type Kind = keyof typeof ALLOWANCE;

const day = () => Math.floor(Date.now() / 86_400_000);
const key = (kind: Kind, wallet: string) => `quota:${kind}:${wallet}:${day()}`;

export async function take(store: Store, kind: Kind, wallet: string, n = 1) {
  const used = await store.incrByEx(key(kind, wallet), n, 90_000);
  return used <= ALLOWANCE[kind];
}

export async function left(store: Store, kind: Kind, wallet: string) {
  const used = Number((await store.get(key(kind, wallet))) ?? 0);
  return Math.max(0, ALLOWANCE[kind] - used);
}

/** Minimum gap between two paid actions on one item; holds after failures too. */
export async function cooldown(store: Store, scope: string, seconds: number) {
  return store.setNx(`cool:${scope}`, "1", seconds);
}
