import "server-only";
import { getStore } from "@/lib/auth/store";
import { launchBlock, launchRecord, market, series, stats, tokenMeta, trades, type Market, type Stats, type Trade } from "@/lib/chain/coins";
import { ticker } from "@/lib/feeds/okx";
import { readLaunch, type Launch } from "@/lib/registry";
import { weekStart } from "@/lib/week";

/*
 * Everything one coin page shows, assembled from the chain (launch record,
 * metadata, curve, trades) plus Balle's registry entry when the coin was
 * launched here. Cached for 20 seconds per coin.
 */

export type CoinView = {
  token: string;
  curve: string;
  deployer: string;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  pairToken: string;
  links: { x: string; telegram: string; website: string };
  launch: Launch | null;
  market: Market;
  stats: Stats;
  ethUsd: number | null;
  recent: Trade[];
  devTrades: Trade[];
  chart: { t: number; mcapEth: number }[];
  readAt: number;
};

const cache = new Map<string, { at: number; view: Promise<CoinView | null> }>();

async function build(token: string): Promise<CoinView | null> {
  // A failed read throws (the page shows "try again"); only a missing Pons record is null (404).
  const rec = await launchRecord(token);
  if (!rec) return null;
  const store = getStore();
  const launch = store ? await readLaunch(store, rec.token).catch(() => null) : null;
  const [meta, m, eth] = await Promise.all([tokenMeta(rec.token), market(rec), ticker("ETH-USDT")]);
  const from = launch?.block ?? (await launchBlock(rec.curve));
  const items = await trades(rec.curve, from, Boolean(launch)).catch(() => [] as Trade[]);
  const dev = rec.deployer.toLowerCase();
  return {
    token: rec.token,
    curve: rec.curve,
    deployer: rec.deployer,
    name: meta.name,
    symbol: meta.symbol,
    logo: meta.logo,
    description: meta.description,
    pairToken: rec.pairToken,
    links: { x: meta.socials.twitter, telegram: meta.socials.telegram, website: meta.socials.website },
    launch,
    market: m,
    stats: stats(items, m.supply, m.mcapEth, weekStart(Date.now()) / 1000),
    ethUsd: eth?.last ?? null,
    recent: items.slice(-30).reverse(),
    devTrades: items.filter((t) => t.account === dev).slice(-20).reverse(),
    chart: series(items, m.supply, 0),
    readAt: Date.now(),
  };
}

/** Null = Pons has no launch at this address. Rejects when the chain could not be read (not cached). */
export function coinView(token: string): Promise<CoinView | null> {
  const key = token.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.view;
  const view = build(token);
  cache.set(key, { at: Date.now(), view });
  view.catch(() => cache.delete(key));
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return view;
}
