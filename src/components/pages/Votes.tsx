"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VOTE_OPTIONS } from "@/config/minds";
import type { Poll } from "@/lib/votes";
import { utcTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";

const FIELD = "w-full rounded-[3px] border border-rule bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-forest-3 focus:border-forest";

function PollCard({ p, onVoted }: { p: Poll; onVoted: (p: Poll) => void }) {
  const { signedIn, signIn } = useAuth();
  const { address } = useWallet();
  const { open } = useWalletModal();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Object.values(p.tally).reduce((a, b) => a + b, 0);
  const now = useNow(30_000);
  const live = now === null || p.closesAt > now;
  const vote = async (choice: string) => {
    if (!address) return open();
    if (!signedIn && !(await signIn())) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/votes/${p.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choice }) });
    const j = (await res.json()) as { poll?: Poll; error?: string };
    setBusy(false);
    if (j.poll) onVoted(j.poll);
    setMsg(res.ok ? "Your vote is counted." : (j.error ?? "Vote failed."));
  };
  return (
    <article className="min-w-0 rounded-[4px] border border-rule bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/coin/${p.token}`} className="font-pixel text-[16px] hover:underline">
          ${p.symbol}
        </Link>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${live ? "bg-lime" : "border border-rule text-forest-3"}`}>{live ? `open until ${utcTime(p.closesAt)}` : "closed"}</span>
      </div>
      <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.02em]">{p.question}</h3>
      <ul className="mt-4 flex flex-col gap-2">
        {VOTE_OPTIONS.map((o) => {
          const share = total > 0 ? (p.tally[o] ?? 0) / total : 0;
          return (
            <li key={o}>
              <button
                type="button"
                disabled={!live || busy}
                onClick={() => vote(o)}
                className="relative flex w-full items-center justify-between overflow-hidden rounded-[3px] border border-rule bg-white px-3 py-2.5 text-left text-[14px] transition-colors enabled:hover:border-forest disabled:cursor-default"
              >
                <span className="absolute inset-y-0 left-0 bg-lime/70" style={{ width: `${Math.round(share * 100)}%` }} aria-hidden="true" />
                <span className="relative font-medium">{o}</span>
                <span className="relative font-mono text-[12px] tabular-nums">{Math.round(share * 100)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-forest-3">
        {p.voters} {p.voters === 1 ? "wallet" : "wallets"} voted, weighted by the ${p.symbol} they held when the vote opened
      </p>
      {msg ? <p className="mt-2 text-[13px] text-forest-2">{msg}</p> : null}
    </article>
  );
}

function OpenVote({ onOpened }: { onOpened: (p: Poll) => void }) {
  const { signedIn } = useAuth();
  const [coins, setCoins] = useState<{ token: string; ticker: string }[]>([]);
  const [token, setToken] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/drafts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { drafts?: { ticker: string; launched: { token: string } | null }[] }) => {
        const list = (j.drafts ?? []).filter((d) => d.launched).map((d) => ({ token: d.launched!.token, ticker: d.ticker }));
        setCoins(list);
        setToken(list[0]?.token ?? "");
      })
      .catch(() => {});
  }, [signedIn]);
  if (!signedIn || coins.length === 0) return null;
  return (
    <form
      className="grid max-w-[560px] gap-3 rounded-[4px] border border-forest bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, question: q }) });
        const j = (await res.json()) as { poll?: Poll; error?: string };
        if (j.poll) {
          onOpened(j.poll);
          setQ("");
          setMsg("Vote opened for 72 hours.");
        } else setMsg(j.error ?? "Could not open the vote.");
      }}
    >
      <select value={token} onChange={(e) => setToken(e.target.value)} className={FIELD} aria-label="Coin">
        {coins.map((c) => (
          <option key={c.token} value={c.token}>
            ${c.ticker}
          </option>
        ))}
      </select>
      <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={160} placeholder="Where should this week's creator fees go?" className={FIELD} />
      <button type="submit" className="justify-self-start rounded-[3px] bg-forest px-4 py-2.5 text-[14px] font-semibold text-cream active:scale-[0.98]">
        Open a 72-hour vote
      </button>
      {msg ? <p className="text-[13px] text-forest-2">{msg}</p> : null}
    </form>
  );
}

export function Votes() {
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [configured, setConfigured] = useState(true);
  useEffect(() => {
    fetch("/api/votes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { polls: Poll[]; configured: boolean }) => {
        setPolls(j.polls);
        setConfigured(j.configured);
      })
      .catch(() => setPolls([]));
  }, []);
  const upsert = useCallback((p: Poll) => setPolls((list) => [p, ...(list ?? []).filter((x) => x.id !== p.id)]), []);
  const now = useNow(30_000) ?? 0;
  const live = (polls ?? []).filter((p) => p.closesAt > now);
  const closed = now ? (polls ?? []).filter((p) => p.closesAt <= now) : [];
  return (
    <>
      <section className="mt-10" aria-label="Live votes">
        <h2 className="font-mono text-[12px] text-forest-3">Open now</h2>
        {polls === null ? (
          <p className="mt-3 text-[14px] text-forest-3">Loading…</p>
        ) : !configured ? (
          <p className="mt-3 text-[14px] text-forest-3">Votes are not configured on this site yet.</p>
        ) : live.length === 0 ? (
          <p className="mt-3 text-[14px] text-forest-3">Nothing open at the moment.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {live.map((p) => (
              <PollCard key={p.id} p={p} onVoted={upsert} />
            ))}
          </div>
        )}
      </section>
      {closed.length ? (
        <section className="mt-10" aria-label="Closed votes">
          <h2 className="font-mono text-[12px] text-forest-3">Closed</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {closed.map((p) => (
              <PollCard key={p.id} p={p} onVoted={upsert} />
            ))}
          </div>
        </section>
      ) : null}
      <OpenVoteSection onOpened={upsert} />
      <section className="mt-10 max-w-[560px]" aria-label="How weight works">
        <h2 className="font-mono text-[12px] text-forest-3">How the count works</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-forest-2">
          A wallet&apos;s weight is what it held at the block where the vote opened, read from the coin&apos;s transfers on chain. One vote per wallet. The outcome is advice to the creator, since Pons sends creator fees to the creator&apos;s own wallet; nothing runs by itself.
        </p>
      </section>
    </>
  );
}

function OpenVoteSection({ onOpened }: { onOpened: (p: Poll) => void }) {
  const { signedIn } = useAuth();
  if (!signedIn) return null;
  return (
    <section className="mt-10" aria-label="Ask your holders">
      <h2 className="mb-3 font-mono text-[12px] text-forest-3">Ask your holders</h2>
      <OpenVote onOpened={onOpened} />
    </section>
  );
}
