import "server-only";
import { keccak256, toHex } from "viem";
import { VOTE_OPTIONS } from "@/config/minds";
import type { Store } from "@/lib/auth/store";
import { newId } from "@/lib/drafts";
import { rpc } from "@/lib/feeds/rpc";
import { acquire, release } from "@/lib/lock";
import type { Launch } from "@/lib/registry";
import { asciiClean, fieldProblems } from "@/lib/safety";

/*
 * Holder votes on what a coin's creator does with the creator fees: burn,
 * buy back, airdrop or hold. Only the wallet that launched the coin can open
 * one, one open vote per coin at a time, for 72 hours. Any signed-in wallet
 * holding the coin can vote once; its weight is its token balance read from
 * chain at the moment it votes.
 *
 * The result is advisory: nothing executes it. Creator fees on Pons go to the
 * creator's own fee wallet, and acting on a vote is the creator's call.
 */

export type Poll = {
  id: string;
  token: string;
  symbol: string;
  name: string;
  question: string;
  creator: string;
  openedAt: number;
  closesAt: number;
  /** Balances are counted at this block. */
  snapshotBlock: number;
  /** First block to scan for the coin's transfers (its launch). */
  fromBlock: number;
  tally: Record<string, number>;
  voters: number;
};

const DURATION = 72 * 3600 * 1000;
const KEEP = 30 * 86400;

export async function readPoll(store: Store, id: string): Promise<Poll | null> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const raw = await store.get(`poll:${id}`);
  try {
    return raw ? (JSON.parse(raw) as Poll) : null;
  } catch {
    return null;
  }
}

export async function listPolls(store: Store, n = 60): Promise<Poll[]> {
  const ids = [...new Set(await store.range("polls:all", n))];
  const raw = await store.mget(ids.map((id) => `poll:${id}`));
  return raw.flatMap((r) => {
    try {
      const p = r ? (JSON.parse(r) as Poll) : null;
      // Polls from the site's Solana period (base58 mints) cannot be counted here.
      return p && /^0x[0-9a-fA-F]{40}$/.test(p.token) ? [p] : [];
    } catch {
      return [];
    }
  });
}

export async function openPoll(store: Store, l: Launch, wallet: string, question: string): Promise<{ poll: Poll } | { error: string; status: number }> {
  if (l.deployer.toLowerCase() !== wallet) return { error: "Only the wallet that launched this coin can open a vote.", status: 403 };
  const q = asciiClean(question, 160) || "What should the creator fees do this week?";
  if (fieldProblems("tagline", q.slice(0, 80)).length && fieldProblems("description", q).length) return { error: "That question uses words this site does not pass on.", status: 400 };
  const key = l.token.toLowerCase();
  const current = await store.get(`poll:open:${key}`);
  if (current) {
    const p = await readPoll(store, current);
    if (p && p.closesAt > Date.now()) return { error: "This coin already has an open vote.", status: 409 };
  }
  const head = Number(BigInt(await rpc<string>("eth_blockNumber", [])));
  const now = Date.now();
  const poll: Poll = {
    id: newId(8),
    token: l.token,
    symbol: l.symbol,
    name: l.name,
    question: q,
    creator: wallet,
    openedAt: now,
    closesAt: now + DURATION,
    snapshotBlock: head,
    fromBlock: Math.max(0, l.block - 1),
    tally: Object.fromEntries(VOTE_OPTIONS.map((o) => [o, 0])),
    voters: 0,
  };
  await store.setEx(`poll:${poll.id}`, JSON.stringify(poll), Math.ceil(DURATION / 1000) + KEEP);
  await store.setEx(`poll:open:${key}`, poll.id, Math.ceil(DURATION / 1000));
  await store.pushCapped("polls:all", poll.id, 300);
  return { poll };
}

const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));
const SPAN = 2_000_000;
const topicOf = (wallet: string) => `0x${wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

export type BalanceAt = (token: string, wallet: string, fromBlock: number, atBlock: number) => Promise<bigint>;

/** A wallet's balance at `atBlock`, from the coin's Transfer logs (no archive node needed). */
export const balanceAtSnapshot: BalanceAt = async (token, wallet, fromBlock, atBlock) => {
  let balance = 0n;
  const who = topicOf(wallet);
  for (let from = fromBlock; from <= atBlock; from += SPAN) {
    const to = Math.min(atBlock, from + SPAN - 1);
    const range = { address: token, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` };
    const [incoming, outgoing] = await Promise.all([
      rpc<{ data: string }[]>("eth_getLogs", [{ ...range, topics: [TRANSFER, null, who] }], 6 * 1024 * 1024),
      rpc<{ data: string }[]>("eth_getLogs", [{ ...range, topics: [TRANSFER, who] }], 6 * 1024 * 1024),
    ]);
    for (const l of incoming) balance += BigInt(l.data);
    for (const l of outgoing) balance -= BigInt(l.data);
  }
  return balance > 0n ? balance : 0n;
};

export async function castVote(store: Store, id: string, wallet: string, choice: string, balanceAt: BalanceAt = balanceAtSnapshot): Promise<{ poll: Poll } | { error: string; status: number }> {
  if (!(VOTE_OPTIONS as readonly string[]).includes(choice)) return { error: "Pick one of the options.", status: 400 };
  const poll = await readPoll(store, id);
  if (!poll) return { error: "That vote does not exist.", status: 404 };
  if (poll.closesAt < Date.now()) return { error: "This vote has closed.", status: 409 };
  const balance = await balanceAt(poll.token, wallet, poll.fromBlock, poll.snapshotBlock).catch(() => null);
  if (balance === null) return { error: "Your balance could not be read from chain. Try again.", status: 502 };
  if (balance === 0n) return { error: `Only wallets that held $${poll.symbol} when this vote opened can vote.`, status: 403 };
  if (!(await store.setNx(`vote:${id}:${wallet}`, choice, Math.ceil((poll.closesAt - Date.now()) / 1000) + KEEP))) {
    return { error: "This wallet already voted.", status: 409 };
  }
  // Whole tokens plus the fraction, so a holder of less than one token still counts.
  const weight = Number(balance / 10n ** 12n) / 1e6;
  // One writer at a time per poll.
  for (let i = 0; i < 20; i++) {
    const token = await acquire(store, `poll:lock:${id}`, 10);
    if (token) {
      try {
        const fresh = (await readPoll(store, id)) ?? poll;
        fresh.tally[choice] = (fresh.tally[choice] ?? 0) + weight;
        fresh.voters += 1;
        await store.setEx(`poll:${id}`, JSON.stringify(fresh), Math.ceil((fresh.closesAt - Date.now()) / 1000) + KEEP);
        return { poll: fresh };
      } finally {
        await release(store, `poll:lock:${id}`, token);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  await store.del(`vote:${id}:${wallet}`).catch(() => {});
  return { error: "Busy, try again.", status: 503 };
}
