"use client";

import { useEffect, useState } from "react";
import { BRAND, PONS, explorerAddress, explorerToken, explorerTx, shortAddress } from "@/config/brand";
import { mood } from "@/config/minds";
import { PAIR_TOKENS } from "@/config/pairs.generated";
import type { CoinView } from "@/lib/coinview";
import type { MindDoc, MindPost } from "@/lib/minds";
import { eth, pct, usd, utcTime } from "@/lib/format";
import { useAuth } from "@/components/auth/AuthProvider";
import { CaSticker } from "@/components/CopyCa";
import { Mark } from "@/components/Mark";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Avatar, safeArt } from "@/components/ui";
import { McapChart } from "@/components/pages/McapChart";
import { BUBBLE, CoinPost } from "@/components/pages/PostItem";
import { MadeWith } from "@/components/SiteFooter";

type Data = { view: CoinView; posts: MindPost[]; mind: MindDoc | null };

const SOLID = "rounded-[3px] bg-forest px-4 py-2.5 text-[14px] font-semibold text-cream transition-transform active:scale-[0.98] disabled:opacity-50";
const MONO_LINK = "transition-colors hover:text-forest";

function Talk({ view, onPost }: { view: CoinView; onPost: (p: MindPost) => void }) {
  const { address } = useWallet();
  const { open } = useWalletModal();
  const { signedIn, signIn, me } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (me && !me.configured.ai) return <p className="text-[14px] text-forest-3">This coin&apos;s mind is resting: AI is off on this site for now. Its posts above stay, and talking comes back when AI is switched on.</p>;
  if (!address) {
    return (
      <button type="button" className={SOLID} onClick={open}>
        Connect wallet to talk
      </button>
    );
  }
  if (!signedIn) {
    return (
      <button type="button" className={SOLID} onClick={() => signIn()}>
        Sign in to talk
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        setMsg(null);
        const res = await fetch(`/api/coins/${view.token}/talk`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
        const j = (await res.json()) as { post?: MindPost; error?: string };
        setBusy(false);
        if (j.post) {
          onPost(j.post);
          setText("");
        } else setMsg(j.error ?? "No answer this time.");
      }}
    >
      <textarea
        rows={2}
        maxLength={280}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Say something to the $${view.symbol} mind`}
        className="w-full resize-none rounded-[4px] border border-rule bg-cream px-4 py-3 text-[15px] outline-none placeholder:text-forest-3 focus:border-forest"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-forest-3">${view.symbol} holders only. Answers show up on this page.</span>
        <button type="submit" className={SOLID} disabled={busy || !text.trim()}>
          {busy ? "Waiting…" : "Send"}
        </button>
      </div>
      {msg ? <p className="text-[13px] text-down">{msg}</p> : null}
    </form>
  );
}

export function CoinPage({ initial }: { initial: Data }) {
  const [d, setD] = useState<Data>(initial);
  const [tab, setTab] = useState<"posts" | "talk">("posts");
  const [more, setMore] = useState(false);
  const v = d.view;
  useEffect(() => {
    const load = () =>
      fetch(`/api/coins/${v.token}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Data | null) => j && setD(j))
        .catch(() => {});
    // The first read also lets the coin's mind speak if it is due.
    const first = window.setTimeout(load, 1500);
    const t = window.setInterval(load, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [v.token]);
  const pair = v.pairToken === "0x0000000000000000000000000000000000000000" ? "ETH" : (PAIR_TOKENS.find((p) => p.address.toLowerCase() === v.pairToken.toLowerCase())?.symbol ?? "token");
  const mcapUsd = v.market.mcapEth !== null && v.ethUsd ? v.market.mcapEth * v.ethUsd : null;
  const posts = [...d.posts].reverse();
  const shownPosts = more ? posts : posts.slice(-12);
  const mindName = d.mind?.name || (v.launch ? `${v.name} mind` : null);
  const launchedAt = v.launch?.launchedAt ?? null;

  const art = safeArt(v.logo);
  const progress = v.market.progress;
  const gradLabel = v.market.phase === 2 ? "Graduated" : progress === null ? "—" : `${progress < 0.01 ? (progress * 100).toFixed(2) : Math.round(progress * 100)}%`;
  const change = v.stats.change24h;
  const mindOn = Boolean(v.launch && v.launch.mind !== "off");
  const role = v.launch ? (v.launch.mind === "auto" ? "Auto" : v.launch.mind.charAt(0).toUpperCase() + v.launch.mind.slice(1)) : "";

  return (
    <main className="px-[clamp(16px,2vw,28px)] pt-[clamp(16px,2vw,28px)] pb-16 text-forest">
      <section className="border border-rule bg-card" aria-label="Coin">
        <div className="flex flex-col gap-5 p-4 md:flex-row md:items-center md:gap-8 md:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-7">
            <div className="grid size-[92px] shrink-0 place-items-center overflow-hidden rounded-[3px] border border-rule bg-cream md:size-[148px]">
              {art ? <img src={art} alt={`${v.name} coin art`} className="size-full object-cover" /> : <Mark size={64} className="size-1/2" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] text-forest-3 md:text-[18px]">{v.name}</p>
              <h1 className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-[0.25em] font-pixel text-[30px] leading-none md:text-[76px]">
                <span className="max-w-full min-w-0 truncate">${v.symbol}</span>
                <span className="shrink-0 text-[0.55em] text-forest-3 max-md:mt-1.5">/ {pair}</span>
              </h1>
              <p className="mt-2.5 font-mono text-[11px] text-forest-3 md:mt-3.5 md:text-[12px]">{launchedAt ? `Went live ${utcTime(launchedAt)}` : "Pons coin on Robinhood Chain"}</p>
            </div>
          </div>
          <a
            href={PONS.page(v.token)}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center justify-center gap-2 rounded-[3px] bg-forest px-8 py-4 text-[17px] font-semibold text-cream transition-[background-color,transform] hover:bg-deep active:scale-[0.98] md:py-5 md:text-[18px]"
          >
            Buy on Pons <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="flex flex-col gap-3 border-t border-rule px-4 py-3.5 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
            <CaSticker address={v.token} label={`$${v.symbol.slice(0, 14)}`} explorer={explorerToken(v.token)} size="sm" testid="coin-ca" />
            <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-forest-3">
              <a className={MONO_LINK} href={explorerToken(v.token)} target="_blank" rel="noreferrer">
                Blockscout ↗
              </a>
              <a className={MONO_LINK} href={explorerAddress(v.deployer)} target="_blank" rel="noreferrer">
                Dev wallet ↗
              </a>
              {v.links.x ? (
                <a className={MONO_LINK} href={v.links.x} target="_blank" rel="noreferrer">
                  X ↗
                </a>
              ) : null}
              {v.links.telegram ? (
                <a className={MONO_LINK} href={v.links.telegram} target="_blank" rel="noreferrer">
                  Telegram ↗
                </a>
              ) : null}
              {v.links.website ? (
                <a className={MONO_LINK} href={v.links.website} target="_blank" rel="noreferrer">
                  Website ↗
                </a>
              ) : null}
            </p>
          </div>
          {v.description ? <p className="min-w-0 text-[14px] leading-snug text-forest-2 [overflow-wrap:anywhere] md:max-w-[56ch] md:text-right">{v.description}</p> : null}
        </div>
      </section>

      <div className="mt-4 grid gap-4">
        <section className="grid grid-cols-2 gap-px border border-rule bg-rule md:grid-cols-4" aria-label="Live numbers">
          {[
            ["Market cap", usd(mcapUsd)],
            ["To graduation", gradLabel],
            ["24h volume", eth(v.stats.volume24hEth)],
            ["24h change", pct(change)],
          ].map(([k, val]) => (
            <div key={k} className="min-w-0 bg-card px-4 py-4 md:px-5 md:py-5">
              <p className="font-mono text-[11px] text-forest-3">{k}</p>
              <div className={`mt-2 text-[22px] leading-none font-medium tracking-[-0.03em] tabular-nums md:text-[28px] ${k === "24h change" && change ? (change < 0 ? "text-down" : "text-up") : ""}`}>
                <span>{val}</span>
                {k === "To graduation" ? (
                  <span className="mt-3 block h-[3px] bg-forest/15">
                    <span className="block h-full bg-forest" style={{ width: `${v.market.phase === 2 ? 100 : Math.max(0, Math.round((progress ?? 0) * 100))}%` }} />
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </section>

        <McapChart points={v.chart} ethUsd={v.ethUsd} nowEth={v.market.mcapEth} />

        <section className="border border-rule bg-card" aria-label="Mind">
          {mindOn ? (
            <>
              <header className="border-b border-rule px-4 py-3.5 md:px-5">
                <div className="flex items-center gap-3">
                  <span className="relative inline-block size-12 shrink-0 align-middle">
                    <Avatar src={v.logo} name={mindName ?? v.name} className="size-full" />
                    <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card bg-awake" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[16px] font-semibold">{mindName}</span>
                      <span className="rounded-full bg-lime px-2 py-0.5 font-mono text-[11px]">{role}</span>
                      <span className="rounded-full border border-rule px-2 py-0.5 font-mono text-[10px] text-forest-3">{mood(d.mind?.lastPostAt ?? null)}</span>
                      <span className="rounded-full border border-rule px-2 py-0.5 font-mono text-[10px] text-forest-3">AI mind</span>
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-forest-3">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-awake opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-awake" />
                      </span>
                      {d.mind?.lastPostAt ? `On watch, last spoke ${utcTime(d.mind.lastPostAt)}` : "On watch, nothing said yet"}
                    </p>
                  </div>
                </div>
              </header>
              <div className="flex gap-5 border-b border-rule px-4 md:px-5" role="tablist" aria-label="Mind view">
                {(
                  [
                    ["posts", "Posts"],
                    ["talk", `Talk to ${mindName}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`-mb-px border-b-2 py-2.5 text-[14px] transition-colors ${tab === id ? "border-forest font-semibold text-forest" : "border-transparent text-forest-3 hover:text-forest"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "talk" ? (
                <div className="px-4 py-5 md:px-5">
                  <Talk view={v} onPost={(p) => setD((x) => ({ ...x, posts: [p, ...x.posts] }))} />
                </div>
              ) : posts.length === 0 ? (
                <p className="px-4 py-5 text-[14px] text-forest-3 md:px-5">Quiet so far. The mind speaks up when this page opens and something has happened since its last word.</p>
              ) : (
                <>
                  {posts.length > shownPosts.length ? (
                    <button type="button" onClick={() => setMore(true)} className="w-full px-4 pt-3 text-left font-mono text-[11px] text-forest-3 transition-colors hover:text-forest md:px-5">
                      Show {posts.length - shownPosts.length} older
                    </button>
                  ) : null}
                  <ol className="space-y-5 px-4 py-5 md:px-5">
                    {shownPosts.map((p) => (
                      <CoinPost key={p.id} p={p} logo={v.logo} />
                    ))}
                    <li className="flex items-center gap-2.5" aria-label={`${mindName} is watching`}>
                      <Avatar src={v.logo} name={mindName ?? v.name} className="size-8" />
                      <span className={`flex items-center gap-1 ${BUBBLE} py-3.5`}>
                        <span className="size-1.5 animate-bounce rounded-full bg-forest-3" />
                        <span className="size-1.5 animate-bounce rounded-full bg-forest-3 [animation-delay:120ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-forest-3 [animation-delay:240ms]" />
                      </span>
                    </li>
                  </ol>
                </>
              )}
            </>
          ) : (
            <p className="px-4 py-5 text-[14px] text-forest-3 md:px-5">{v.launch ? "This coin went live without a mind." : `This coin did not launch through ${BRAND.name}, so no mind lives here. The chain numbers above are live all the same.`}</p>
          )}
        </section>

        <section className="border border-rule bg-card" aria-label="Dev activity">
          <div className="flex items-baseline justify-between gap-4 px-4 pt-4 md:px-5 md:pt-5">
            <p className="font-mono text-[11px] text-forest-3">Dev activity</p>
            <a className="font-mono text-[11px] text-forest-3 transition-colors hover:text-forest" href={explorerAddress(v.deployer)} target="_blank" rel="noreferrer">
              Dev {shortAddress(v.deployer, 6, 4)} ↗
            </a>
          </div>
          <ul className="mt-3 border-t border-rule">
            {v.launch ? (
              <li className="flex items-start justify-between gap-4 border-b border-rule px-4 py-3 last:border-b-0 md:px-5">
                <div className="min-w-0">
                  <p className="text-[14px] leading-snug font-medium md:text-[15px]">Launched</p>
                  <p className="mt-1 font-mono text-[11px] text-forest-3 tabular-nums">from this wallet, through {BRAND.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  {launchedAt ? <p className="font-mono text-[11px] text-forest-3 tabular-nums">{utcTime(launchedAt)}</p> : null}
                  <a className="mt-1 inline-block font-mono text-[11px] underline decoration-rule underline-offset-2 transition-colors hover:decoration-forest" href={explorerTx(v.launch.tx)} target="_blank" rel="noreferrer">
                    Blockscout ↗
                  </a>
                </div>
              </li>
            ) : null}
            {v.devTrades.map((t) => (
              <li key={`${t.tx}-${t.side}`} className="flex items-start justify-between gap-4 border-b border-rule px-4 py-3 last:border-b-0 md:px-5">
                <div className="min-w-0">
                  <p className="text-[14px] leading-snug font-medium md:text-[15px]">{t.side === "buy" ? "Bought" : "Sold"}</p>
                  <p className="mt-1 font-mono text-[11px] text-forest-3 tabular-nums [overflow-wrap:anywhere]">
                    {eth(t.eth, 5)}
                    {v.market.supply ? `, ${((t.tokens / v.market.supply) * 100).toFixed(2)}% of supply` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[11px] text-forest-3 tabular-nums">{utcTime(t.at * 1000)}</p>
                  <a className="mt-1 inline-block font-mono text-[11px] underline decoration-rule underline-offset-2 transition-colors hover:decoration-forest" href={explorerTx(t.tx)} target="_blank" rel="noreferrer">
                    Blockscout ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {v.devTrades.length === 0 ? <p className="border-t border-rule px-4 py-3 font-mono text-[12px] text-forest-3 md:px-5">No dev trades on the curve</p> : null}
        </section>

        <section className="border border-rule bg-card" aria-label="Recent trades">
          <p className="px-4 pt-4 font-mono text-[11px] text-forest-3 md:px-5 md:pt-5">Latest curve trades</p>
          {v.recent.length === 0 ? (
            <p className="mt-3 border-t border-rule px-4 py-3 font-mono text-[12px] text-forest-3 md:px-5">None read yet</p>
          ) : (
            <ul className="mt-3 border-t border-rule">
              {v.recent.slice(0, 12).map((t) => (
                <li key={`${t.tx}-${t.account}-${t.side}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 text-[13px] last:border-b-0 md:px-5">
                  <span className={`w-10 font-medium ${t.side === "buy" ? "text-up" : "text-down"}`}>{t.side}</span>
                  <span className="font-mono text-[12px] tabular-nums">{eth(t.eth, 5)}</span>
                  <span className="font-mono text-[11px] text-forest-3">{shortAddress(t.account, 6, 4)}</span>
                  <a className="ml-auto font-mono text-[11px] text-forest-3 hover:text-forest" href={explorerTx(t.tx)} target="_blank" rel="noreferrer">
                    {utcTime(t.at * 1000)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <MadeWith />
    </main>
  );
}
