import "server-only";
import { getAddress } from "viem";
import type { Store } from "@/lib/auth/store";
import { launchRecord, tokenMeta } from "@/lib/chain/coins";
import type { Draft } from "@/lib/drafts";
import { rpc } from "@/lib/feeds/rpc";
import { parseLaunched } from "@/lib/launch";
import { safeLinks, safeLogo } from "@/lib/safe-url";

/*
 * The list of coins launched with Balle. A coin joins it only after the
 * server has checked the chain itself:
 *   - the transaction succeeded and the Pons factory emitted TokenLaunched;
 *   - the deployer in that event is the signed-in wallet that owns the draft;
 *   - Pons' own record for the token exists, with that deployer;
 *   - the token's on-chain name and ticker are the draft's.
 * Nobody can add someone else's coin, or a coin under a borrowed draft.
 * Records are refreshed on every change and kept for a year.
 */

const TTL = 365 * 86400;
const MAX_LIST = 2000;

export type Launch = {
  token: string;
  curve: string;
  deployer: string;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  tagline: string;
  pairToken: string;
  tx: string;
  block: number;
  launchedAt: number;
  mind: string;
  mindCustom: string;
  post: string;
  links: { x: string; telegram: string; website: string };
};

export async function readLaunch(store: Store, token: string): Promise<Launch | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return null;
  const raw = await store.get(`launch:${token.toLowerCase()}`);
  if (!raw) return null;
  try {
    return clean(JSON.parse(raw) as Launch);
  } catch {
    return null;
  }
}

export async function listLaunches(store: Store, count = 200): Promise<Launch[]> {
  const ids = [...new Set(await store.range("launches:all", Math.min(count, MAX_LIST)))];
  const raw = await store.mget(ids.map((t) => `launch:${t}`));
  const out: Launch[] = [];
  for (const r of raw) {
    if (!r) continue;
    try {
      const l = clean(JSON.parse(r) as Launch);
      // Records from the site's Solana period (base58 mints) are not Pons coins.
      if (/^0x[0-9a-fA-F]{40}$/.test(l.token)) out.push(l);
    } catch {
      // Skip a damaged record.
    }
  }
  return out.sort((a, b) => b.launchedAt - a.launchedAt);
}

/** Stored records are re-checked on read: logo and links only ever come out as https (or ipfs:// for the logo). */
function clean(l: Launch): Launch {
  return { ...l, logo: safeLogo(l.logo), links: safeLinks(l.links) };
}

type Receipt = { status: string; blockNumber: string; from: string; logs: { address: string; topics: string[]; data: string }[] };

export async function registerLaunch(store: Store, wallet: string, d: Draft, tx: string): Promise<{ launch: Launch } | { error: string; status: number }> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return { error: "That is not a transaction hash.", status: 400 };
  if (d.wallet !== wallet) return { error: "This draft belongs to another wallet.", status: 403 };
  const receipt = await rpc<Receipt | null>("eth_getTransactionReceipt", [tx]).catch(() => null);
  if (!receipt) return { error: "The transaction is not on chain yet. Try again in a few seconds.", status: 409 };
  if (receipt.status !== "0x1") return { error: "That transaction reverted.", status: 400 };
  const ev = parseLaunched(receipt.logs);
  if (!ev) return { error: "That transaction did not launch a coin on Pons.", status: 400 };
  if (ev.deployer.toLowerCase() !== wallet) return { error: "That coin was launched by another wallet.", status: 403 };
  const rec = await launchRecord(ev.token);
  if (!rec || rec.deployer.toLowerCase() !== wallet) return { error: "Pons has no record of this coin under your wallet.", status: 400 };
  const meta = await tokenMeta(ev.token);
  if (meta.name !== d.coin.name.trim() || meta.symbol !== d.coin.ticker.trim().toUpperCase()) {
    return { error: "The coin on chain does not match this draft's name and ticker.", status: 400 };
  }
  const existing = await readLaunch(store, ev.token);
  const c = { block: Number(BigInt(receipt.blockNumber)) };
  const launch: Launch = {
    token: getAddress(ev.token),
    curve: getAddress(ev.curve),
    deployer: getAddress(ev.deployer),
    name: meta.name,
    symbol: meta.symbol,
    logo: safeLogo(meta.logo),
    description: meta.description,
    tagline: d.coin.tagline,
    pairToken: getAddress(ev.pairToken),
    tx,
    block: c.block,
    launchedAt: existing?.launchedAt ?? Date.now(),
    mind: d.settings.mind,
    mindCustom: d.settings.mindCustom,
    post: d.coin.post,
    links: safeLinks({ x: meta.socials.twitter, telegram: meta.socials.telegram, website: meta.socials.website }),
  };
  await store.setEx(`launch:${launch.token.toLowerCase()}`, JSON.stringify(launch), TTL);
  if (!existing) await store.pushCapped("launches:all", launch.token.toLowerCase(), MAX_LIST);
  return { launch };
}
