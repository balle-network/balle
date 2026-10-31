import "server-only";
import { BRAND, CHAIN, PONS, explorerToken, explorerTx, isAddress } from "@/config/brand";
import { getStore } from "@/lib/auth/store";
import { launchRecord, market, tokenMeta, type LaunchRecord, type Market } from "@/lib/chain/coins";
import { listLaunches, readLaunch, type Launch } from "@/lib/registry";
import { safeLinks, safeLogo } from "@/lib/safe-url";

/*
 * The public read API: coins launched through Balle, each with numbers read
 * from Robinhood Chain at request time (Pons launch record, curve reserves,
 * graduation threshold). Used by GET /api/launches, GET /api/launches/<token>
 * and the MCP tools. Shapes are versioned (`v: 1`) and documented in README.
 *
 * Only coins in Balle's registry are served: a coin joins it after the server
 * checked the launch transaction on chain (see registry.ts). Nothing here
 * signs or sends anything.
 */

export const API_VERSION = 1;
export const MAX_PAGE = 50;

export type CurveState = {
  /** curve = trading on its bonding curve; graduating = threshold reached, pool being made; pool = Uniswap v4 pool; closed = rescued, no pool. */
  venue: Market["venue"];
  /** Pons launch phase: 0 curve, 1 graduating, 2 pool, 3 rescued. */
  phase: number;
  graduated: boolean;
  /** 0–1 towards the graduation threshold (1 once graduated). */
  progress: number | null;
  raisedEth: number | null;
  goalEth: number | null;
  priceEth: number | null;
  marketCapEth: number | null;
  supply: number;
};

export type PublicLaunch = {
  v: typeof API_VERSION;
  chainId: number;
  token: string;
  name: string;
  symbol: string;
  creator: string;
  feeRecipient: string | null;
  curve: string;
  pairToken: string;
  logo: string;
  description: string;
  tagline: string;
  links: { x: string; telegram: string; website: string };
  launchedAt: string;
  launchTx: string;
  launchBlock: number;
  /** Live curve state, or null when the chain could not be read for this coin just now. */
  curveState: CurveState | null;
  readAt: string | null;
  urls: { balle: string; pons: string; explorer: string; launchTx: string };
};

function curveState(m: Market): CurveState {
  return {
    venue: m.venue,
    phase: m.phase,
    graduated: m.phase === 2,
    progress: m.progress,
    raisedEth: m.raisedEth,
    goalEth: m.goalEth,
    priceEth: m.priceEth,
    marketCapEth: m.mcapEth,
    supply: m.supply,
  };
}

function shape(l: Launch, rec: LaunchRecord | null, m: Market | null, meta?: { name: string; symbol: string; logo: string; description: string }): PublicLaunch {
  return {
    v: API_VERSION,
    chainId: CHAIN.id,
    token: l.token,
    name: meta?.name ?? l.name,
    symbol: meta?.symbol ?? l.symbol,
    creator: rec?.deployer ?? l.deployer,
    feeRecipient: rec?.feeRecipient ?? null,
    curve: rec?.curve ?? l.curve,
    pairToken: rec?.pairToken ?? l.pairToken,
    logo: safeLogo(meta?.logo ?? l.logo),
    description: (meta?.description ?? l.description).slice(0, 2048),
    tagline: l.tagline.slice(0, 200),
    links: safeLinks(l.links),
    launchedAt: new Date(l.launchedAt).toISOString(),
    launchTx: l.tx,
    launchBlock: l.block,
    curveState: m ? curveState(m) : null,
    readAt: m ? new Date().toISOString() : null,
    urls: { balle: `${BRAND.url}/coin/${l.token}`, pons: PONS.page(l.token), explorer: explorerToken(l.token), launchTx: explorerTx(l.tx) },
  };
}

// Live reads are shared for 15 seconds per coin, so a busy API does not multiply chain calls.
const live = new Map<string, { at: number; value: Promise<{ rec: LaunchRecord | null; m: Market | null }> }>();

function readLive(token: string) {
  const key = token.toLowerCase();
  const hit = live.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  const value = (async () => {
    const rec = await launchRecord(token).catch(() => null);
    const m = rec ? await market(rec).catch(() => null) : null;
    return { rec, m };
  })();
  live.set(key, { at: Date.now(), value });
  if (live.size > 500) live.delete(live.keys().next().value as string);
  return value;
}

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

export type LaunchPage = { v: typeof API_VERSION; chainId: number; total: number; offset: number; limit: number; next: number | null; items: PublicLaunch[] };

/** Newest first. `null` = the site has no store configured, so it has no registry to serve. */
export async function listPublicLaunches(offset = 0, limit = 20): Promise<LaunchPage | null> {
  const store = getStore();
  if (!store) return null;
  const all = await listLaunches(store, 2000);
  const lim = Math.max(1, Math.min(MAX_PAGE, Math.floor(limit) || 20));
  const off = Math.max(0, Math.floor(offset) || 0);
  const slice = all.slice(off, off + lim);
  const reads = await pool(slice, 6, (l) => readLive(l.token));
  return {
    v: API_VERSION,
    chainId: CHAIN.id,
    total: all.length,
    offset: off,
    limit: lim,
    next: off + lim < all.length ? off + lim : null,
    items: slice.map((l, i) => shape(l, reads[i].rec, reads[i].m)),
  };
}

/** One Balle launch with live chain reads; `null` = not launched through Balle; throws when the store is missing. */
export async function getPublicLaunch(token: string): Promise<PublicLaunch | null> {
  if (!isAddress(token)) return null;
  const store = getStore();
  if (!store) throw new Error("not configured");
  const l = await readLaunch(store, token);
  if (!l) return null;
  const [{ rec, m }, meta] = await Promise.all([readLive(l.token), tokenMeta(l.token).catch(() => undefined)]);
  return shape(l, rec, m, meta);
}
