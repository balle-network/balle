import "server-only";
import { safeLink, safeLogo } from "@/lib/safe-url";
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import { ponsV2BondingCurveAbi } from "@/abi/ponsV2BondingCurve";
import { ponsV2LaunchFactoryAbi } from "@/abi/ponsV2LaunchFactory";
import { PONS } from "@/config/brand";
import { getStore } from "@/lib/auth/store";
import { address as encAddr, bytes, dynamic, encode, fixed, readWord, word } from "@/lib/abi";
import { rpc } from "@/lib/feeds/rpc";

/*
 * Coin data read straight from Robinhood Chain: the Pons launch record, the
 * bonding curve's reserves, and every curve trade (CurveBuy / CurveSell
 * logs), indexed incrementally per coin (stored for coins launched with
 * Balle, memory-only for any other Pons coin). No indexer service and no third
 * party API: what the site shows is what the chain says.
 *
 * Block times: logs on this chain carry no timestamp, so a block's time is
 * interpolated between two measured anchors (refreshed every ten minutes).
 * Blocks come about ten per second, so the error is well under a minute.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

async function call<T>(to: string, abi: readonly unknown[], functionName: string, args: unknown[] = []): Promise<T> {
  const data = (encodeFunctionData as (x: unknown) => Hex)({ abi, functionName, args });
  const raw = await rpc<Hex>("eth_call", [{ to, data }, "latest"]);
  return (decodeFunctionResult as (x: unknown) => unknown)({ abi, functionName, data: raw }) as T;
}

/* ---------------------------- block clock ---------------------------- */

type Clock = { at: number; block: number; ts: number; rate: number };
let clock: Clock | null = null;
let clockJob: Promise<Clock> | null = null;

async function headerTs(n: number | "latest") {
  const b = await rpc<{ number: string; timestamp: string } | null>("eth_getBlockByNumber", [n === "latest" ? "latest" : `0x${n.toString(16)}`, false]);
  if (!b) throw new Error("no block");
  return { block: Number(BigInt(b.number)), ts: Number(BigInt(b.timestamp)) };
}

export async function chainClock(): Promise<Clock> {
  if (clock && Date.now() - clock.at < 600_000) {
    // Advance the anchor by elapsed wall time between refreshes.
    const elapsed = (Date.now() - clock.at) / 1000;
    return { ...clock, block: clock.block + Math.floor(elapsed / clock.rate), ts: clock.ts + elapsed };
  }
  clockJob ??= (async () => {
    const head = await headerTs("latest");
    const back = await headerTs(Math.max(1, head.block - 500_000));
    const rate = Math.max(0.01, (head.ts - back.ts) / Math.max(1, head.block - back.block));
    clock = { at: Date.now(), block: head.block, ts: head.ts, rate };
    return clock;
  })().finally(() => {
    clockJob = null;
  });
  return clockJob;
}

/** Unix seconds of block `n`, interpolated. */
export const timeOfBlock = (c: Clock, n: number) => Math.round(c.ts - (c.block - n) * c.rate);
/** Approximate first block at or after unix second `ts`. */
export const blockAtTime = (c: Clock, ts: number) => Math.max(0, Math.floor(c.block - (c.ts - ts) / c.rate));

/* ---------------------------- launch record ---------------------------- */

export type LaunchRecord = {
  token: string;
  curve: string;
  deployer: string;
  feeRecipient: string;
  pairToken: string;
  creatorTaxBps: number;
  buyback: boolean;
  phase: number;
  poolFee: bigint;
  tickSpacing: bigint;
};

export async function launchRecord(token: string): Promise<LaunchRecord | null> {
  const r = await call<{
    token: string;
    curve: string;
    deployer: string;
    creatorFeeRecipient: string;
    pairToken: string;
    poolFee: number;
    tickSpacing: number;
    creatorTaxBps: number;
    buybackEnabled: boolean;
    phase: number;
    exists: boolean;
  }>(PONS.factory, ponsV2LaunchFactoryAbi, "getLaunchedToken", [getAddress(token)]);
  if (!r.exists) return null;
  return {
    token: getAddress(r.token),
    curve: getAddress(r.curve),
    deployer: getAddress(r.deployer),
    feeRecipient: getAddress(r.creatorFeeRecipient),
    pairToken: getAddress(r.pairToken),
    creatorTaxBps: Number(r.creatorTaxBps),
    buyback: r.buybackEnabled,
    phase: Number(r.phase),
    poolFee: BigInt(r.poolFee),
    tickSpacing: BigInt(r.tickSpacing),
  };
}

export type TokenMeta = { name: string; symbol: string; logo: string; description: string; socials: { twitter: string; telegram: string; website: string } };

const TOKEN_META_ABI = [
  { type: "function", name: "logo", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "socials",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "string", name: "twitter" },
      { type: "string", name: "telegram" },
      { type: "string", name: "discord" },
      { type: "string", name: "website" },
      { type: "string", name: "farcaster" },
    ],
  },
] as const;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, n) : "");

/** Name, symbol and the metadata Pons stores in the token itself. */
export async function tokenMeta(token: string): Promise<TokenMeta> {
  const [name, symbol, logo, description, socials] = await Promise.all([
    call<string>(token, erc20Abi, "name"),
    call<string>(token, erc20Abi, "symbol"),
    call<string>(token, TOKEN_META_ABI, "logo").catch(() => ""),
    call<string>(token, TOKEN_META_ABI, "description").catch(() => ""),
    call<readonly string[]>(token, TOKEN_META_ABI, "socials").catch(() => ["", "", "", "", ""]),
  ]);
  return {
    name: clip(name, 64),
    symbol: clip(symbol, 16),
    // Logo and links are untrusted: only https (and ipfs:// for the logo) are kept, so no javascript:/data: reaches an href or src.
    logo: safeLogo(logo),
    description: clip(description, 2048),
    socials: { twitter: safeLink(socials[0]), telegram: safeLink(socials[1]), website: safeLink(socials[3]) },
  };
}

/* ---------------------------- market ---------------------------- */

export type Market = {
  phase: number;
  venue: "curve" | "pool" | "graduating" | "closed";
  /** ETH per whole token. */
  priceEth: number | null;
  supply: number;
  mcapEth: number | null;
  /** 0-1 toward graduation. */
  progress: number | null;
  raisedEth: number | null;
  goalEth: number | null;
};

const asEth = (wei: bigint) => Number(wei / 10n ** 9n) / 1e9;

async function poolPrice(rec: LaunchRecord): Promise<number | null> {
  // Uniswap v4 pool with the Pons meme hook: quote a small buy through the v4 quoter.
  const amount = 10n ** 15n;
  const key = encAddr(ZERO) + encAddr(rec.token) + word(rec.poolFee) + word(rec.tickSpacing) + encAddr(PONS.memeHook);
  const params = encode([fixed(key), fixed(word(true)), fixed(word(amount)), dynamic(bytes(""))]);
  try {
    const out = await rpc<string>("eth_call", [{ to: PONS.v4Quoter, data: `0xaa9d21cb${encode([dynamic(params)])}` }, "latest"]);
    const tokens = readWord(out, 0);
    return tokens > 0n ? asEth(amount) / (Number(tokens / 10n ** 9n) / 1e9) : null;
  } catch {
    return null;
  }
}

export async function market(rec: LaunchRecord): Promise<Market> {
  const supplyRaw = await call<bigint>(rec.token, erc20Abi, "totalSupply");
  const supply = Number(supplyRaw / 10n ** 18n);
  if (rec.phase === 2) {
    const priceEth = rec.pairToken === ZERO ? await poolPrice(rec) : null;
    return { phase: 2, venue: "pool", priceEth, supply, mcapEth: priceEth === null ? null : priceEth * supply, progress: 1, raisedEth: null, goalEth: null };
  }
  if (rec.phase === 3) return { phase: 3, venue: "closed", priceEth: null, supply, mcapEth: null, progress: null, raisedEth: null, goalEth: null };
  const [reserves, real, goal] = await Promise.all([
    call<readonly [bigint, bigint]>(rec.curve, ponsV2BondingCurveAbi, "getReserves"),
    call<bigint>(rec.curve, ponsV2BondingCurveAbi, "realQuoteReserve"),
    call<bigint>(rec.curve, ponsV2BondingCurveAbi, "graduationThreshold"),
  ]);
  const [q, t] = reserves;
  const priceEth = t > 0n && rec.pairToken === ZERO ? asEth(q) / (Number(t / 10n ** 9n) / 1e9) : null;
  return {
    phase: rec.phase,
    venue: rec.phase === 1 ? "graduating" : "curve",
    priceEth,
    supply,
    mcapEth: priceEth === null ? null : priceEth * supply,
    progress: goal > 0n ? Math.min(1, Number((real * 10_000n) / goal) / 10_000) : null,
    raisedEth: rec.pairToken === ZERO ? asEth(real) : null,
    goalEth: rec.pairToken === ZERO ? asEth(goal) : null,
  };
}

/* ---------------------------- trades ---------------------------- */

export type Trade = { side: "buy" | "sell"; account: string; eth: number; tokens: number; block: number; tx: string; at: number };

type TradeBook = { from: number; cursor: number; items: Trade[] };
const SPAN = 2_000_000;
const MAX_CHUNKS_PER_READ = 6;
const MAX_TRADES = 3000;
const memory = new Map<string, { at: number; book: TradeBook }>();

async function logs(curve: string, from: number, to: number) {
  return rpc<{ topics: Hex[]; data: Hex; blockNumber: string; transactionHash: string }[]>(
    "eth_getLogs",
    [{ address: curve, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
    6 * 1024 * 1024,
  );
}

/**
 * Every curve trade of a coin since `fromBlock`, newest last. The book is
 * kept in the store with its cursor, so each read only scans new blocks.
 */
export async function trades(curve: string, fromBlock: number, persist = false): Promise<Trade[]> {
  const key = curve.toLowerCase();
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.book.items;
  // Only coins launched with Balle keep a stored book; any other Pons coin is read into memory only.
  const store = persist ? getStore() : null;
  let book: TradeBook = hit?.book ?? { from: fromBlock, cursor: fromBlock - 1, items: [] };
  if (!hit && store) {
    const saved = await store.get(`trades:${key}`).catch(() => null);
    if (saved) {
      try {
        book = JSON.parse(saved) as TradeBook;
      } catch {
        // Rebuild from scratch.
      }
    }
  }
  const c = await chainClock();
  const head = c.block;
  let chunks = 0;
  while (book.cursor < head && chunks < MAX_CHUNKS_PER_READ) {
    const start = book.cursor + 1;
    const end = Math.min(head, start + SPAN - 1);
    const found = await logs(curve, start, end);
    for (const l of found) {
      let ev: { eventName: string; args: Record<string, unknown> };
      try {
        ev = decodeEventLog({ abi: ponsV2BondingCurveAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }) as typeof ev;
      } catch {
        continue;
      }
      const block = Number(BigInt(l.blockNumber));
      if (ev.eventName === "CurveBuy") {
        const a = ev.args as { buyer: string; recipient: string; quoteIn: bigint; tokensOut: bigint };
        book.items.push({ side: "buy", account: a.recipient.toLowerCase(), eth: asEth(a.quoteIn), tokens: Number(a.tokensOut / 10n ** 18n), block, tx: l.transactionHash, at: timeOfBlock(c, block) });
      } else if (ev.eventName === "CurveSell") {
        const a = ev.args as { seller: string; tokensIn: bigint; quoteOut: bigint };
        book.items.push({ side: "sell", account: a.seller.toLowerCase(), eth: asEth(a.quoteOut), tokens: Number(a.tokensIn / 10n ** 18n), block, tx: l.transactionHash, at: timeOfBlock(c, block) });
      }
    }
    book.cursor = end;
    chunks++;
  }
  if (book.items.length > MAX_TRADES) book.items = book.items.slice(-MAX_TRADES);
  memory.set(key, { at: Date.now(), book });
  if (memory.size > 500) memory.delete(memory.keys().next().value as string);
  if (store) await store.setEx(`trades:${key}`, JSON.stringify(book), 365 * 86400).catch(() => {});
  return book.items;
}

/** Launch block of a coin from its curve's launch time. */
export async function launchBlock(curve: string): Promise<number> {
  const at = await call<bigint>(curve, ponsV2BondingCurveAbi, "launchedAt");
  const c = await chainClock();
  // A little earlier than the estimate, so the launch block itself is never skipped.
  return Math.max(0, blockAtTime(c, Number(at)) - 20_000);
}

export type Stats = { volume24hEth: number; change24h: number | null; volumeWeekEth: number; volumePrevWeekEth: number; trades24h: number };

/** Trade-derived figures. Prices are execution prices (ETH paid per token). */
export function stats(items: Trade[], supply: number, mcapNow: number | null, weekStart: number): Stats {
  const now = Date.now() / 1000;
  const day = items.filter((t) => t.at >= now - 86400);
  const before = [...items].reverse().find((t) => t.at < now - 86400) ?? day[0];
  const px = (t: Trade) => (t.tokens > 0 ? t.eth / t.tokens : 0);
  const then = before ? px(before) * supply : null;
  return {
    volume24hEth: day.reduce((s, t) => s + t.eth, 0),
    trades24h: day.length,
    volumeWeekEth: items.filter((t) => t.at >= weekStart).reduce((s, t) => s + t.eth, 0),
    volumePrevWeekEth: items.filter((t) => t.at >= weekStart - 7 * 86400 && t.at < weekStart).reduce((s, t) => s + t.eth, 0),
    change24h: then && mcapNow ? ((mcapNow - then) / then) * 100 : null,
  };
}

/** Market cap (ETH) after each trade, for the chart. */
export function series(items: Trade[], supply: number, since: number) {
  return items.filter((t) => t.at >= since && t.tokens > 0).map((t) => ({ t: t.at, mcapEth: (t.eth / t.tokens) * supply }));
}
