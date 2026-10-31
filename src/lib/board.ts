import "server-only";
import { getStore } from "@/lib/auth/store";
import { coinView, type CoinView } from "@/lib/coinview";
import { listLaunches, type Launch } from "@/lib/registry";
import { weekStart } from "@/lib/week";

/*
 * The Launches board and the weekly race, built from the registry of coins
 * launched with Balle and live chain reads for each (see coinview.ts).
 * Volume counts trades on the Pons bonding curve; a coin that graduated to
 * its Uniswap pool keeps the curve volume it made before that.
 */

export type BoardRow = {
  token: string;
  name: string;
  symbol: string;
  logo: string;
  tagline: string;
  deployer: string;
  launchedAt: number;
  mcapUsd: number | null;
  mcapEth: number | null;
  progress: number | null;
  graduated: boolean;
  volume24hEth: number;
  volumeWeekEth: number;
  volumePrevWeekEth: number;
  change24h: number | null;
};

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function row(l: Launch, v: CoinView | null): BoardRow {
  const mcapEth = v?.market.mcapEth ?? null;
  return {
    token: l.token,
    name: l.name,
    symbol: l.symbol,
    logo: l.logo,
    tagline: l.tagline,
    deployer: l.deployer,
    launchedAt: l.launchedAt,
    mcapEth,
    mcapUsd: mcapEth !== null && v?.ethUsd ? mcapEth * v.ethUsd : null,
    progress: v?.market.progress ?? null,
    graduated: v?.market.phase === 2,
    volume24hEth: v?.stats.volume24hEth ?? 0,
    volumeWeekEth: v?.stats.volumeWeekEth ?? 0,
    volumePrevWeekEth: v?.stats.volumePrevWeekEth ?? 0,
    change24h: v?.stats.change24h ?? null,
  };
}

let cached: { at: number; rows: Promise<BoardRow[]> } | null = null;

/** Every Balle launch with live numbers, newest first. `null` = no store configured. */
export async function board(): Promise<BoardRow[] | null> {
  const store = getStore();
  if (!store) return null;
  if (cached && Date.now() - cached.at < 30_000) return cached.rows;
  const rows = (async () => {
    const launches = await listLaunches(store, 120);
    const views = await pool(launches, 6, (l) => coinView(l.token).catch(() => null));
    return launches.map((l, i) => row(l, views[i]));
  })().catch(() => [] as BoardRow[]);
  cached = { at: Date.now(), rows };
  return rows;
}

export type Race = { start: number; entrants: BoardRow[]; winners: { week: number; token: string; symbol: string; name: string; volumeEth: number }[] };

/** This week's entrants ranked by curve volume this week, and past winners. */
export async function race(): Promise<Race | null> {
  const store = getStore();
  const rows = await board();
  if (!store || !rows) return null;
  const start = weekStart(Date.now());
  const entrants = rows.filter((r) => r.launchedAt >= start).sort((a, b) => b.volumeWeekEth - a.volumeWeekEth);
  // Last week's result is written once, by the first read after it closes.
  const last = start - 7 * 86_400_000;
  const lastRows = rows.filter((r) => r.launchedAt >= last && r.launchedAt < start).sort((a, b) => b.volumePrevWeekEth - a.volumePrevWeekEth);
  if (lastRows[0] && lastRows[0].volumePrevWeekEth > 0) {
    const w = lastRows[0];
    await store.setNx(`race:winner:${last}`, JSON.stringify({ week: last, token: w.token, symbol: w.symbol, name: w.name, volumeEth: w.volumePrevWeekEth }), 2 * 365 * 86400).catch(() => false);
    await store.setNx(`race:winners:has:${last}`, "1", 2 * 365 * 86400).then((fresh) => (fresh ? store.pushCapped("race:winners", String(last), 104) : undefined)).catch(() => {});
  }
  const weeks = await store.range("race:winners", 12).catch(() => [] as string[]);
  const raw = await store.mget(weeks.map((w) => `race:winner:${w}`)).catch(() => [] as (string | null)[]);
  const winners = raw.flatMap((r) => {
    try {
      return r ? [JSON.parse(r) as Race["winners"][number]] : [];
    } catch {
      return [];
    }
  });
  return { start, entrants, winners };
}
