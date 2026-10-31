"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BRAND, PONS, RACE, TOKEN, hasX } from "@/config/brand";
import type { BoardRow } from "@/lib/board";
import { ago, eth, pct, usd } from "@/lib/format";
import { closeLabel, weekEnd, weekStart } from "@/lib/week";
import { useNow } from "@/lib/useNow";
import { BalleCa } from "@/components/CopyCa";
import { Mark } from "@/components/Mark";
import { CoinArt, Empty } from "@/components/ui";

const TABS = [
  { id: "new", label: "New" },
  { id: "trending", label: "Trending" },
  { id: "graduated", label: "Graduated" },
] as const;

export function Launches() {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("new");
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/board", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { rows: BoardRow[]; configured: boolean }) => {
          if (stop) return;
          setRows(j.rows);
          setConfigured(j.configured);
        })
        .catch(() => !stop && setRows([]));
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);
  const shown = useMemo(() => {
    const list = rows ?? [];
    if (tab === "trending") return [...list].filter((r) => r.volume24hEth > 0).sort((a, b) => b.volume24hEth - a.volume24hEth);
    if (tab === "graduated") return list.filter((r) => r.graduated);
    return list;
  }, [rows, tab]);
  const mcap = TOKEN.isLive ? ((rows ?? []).find((r) => r.token.toLowerCase() === BRAND.ca.toLowerCase())?.mcapUsd ?? null) : null;
  const now = useNow(60_000);
  const leader = useMemo(() => {
    if (now === null) return null;
    const start = weekStart(now);
    return (rows ?? []).filter((r) => r.launchedAt >= start && r.volumeWeekEth > 0).sort((a, b) => b.volumeWeekEth - a.volumeWeekEth)[0] ?? null;
  }, [rows, now]);

  const verb = RACE.prize ? "wins" : "is";
  const prize = RACE.prize || "crowned";
  const leftLabel = (() => {
    if (now === null) return "";
    const ms = Math.max(0, weekEnd(now) - now);
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    return ` · ${d}d ${h}h to go`;
  })();

  return (
    <>
      <section
        className="grid items-center gap-6 border border-forest bg-card p-6 sm:grid-cols-[auto_1fr] md:gap-x-10 md:p-10 lg:grid-cols-[auto_1fr_auto]"
        aria-label={`${BRAND.name}'s coin`}
      >
        <Mark size={144} className="size-24 sm:row-span-2 md:size-36 lg:row-span-1" />
        <div className="min-w-0 sm:self-end lg:self-center">
          <p className="text-[48px] leading-none font-medium tracking-[-0.05em] md:text-[84px]">{BRAND.symbol}</p>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[14px] tabular-nums md:text-[16px]">
            <span>
              <span className="text-forest-3">MC </span>
              {mcap === null ? "—" : usd(mcap)}
            </span>
            {!TOKEN.isLive ? <span className="text-[12px] text-forest-3">goes live soon</span> : null}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <BalleCa testid="ca-launches" />
            {hasX ? (
              <a href={BRAND.x} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-forest-3 transition-colors hover:text-forest">
                {BRAND.xHandle} on X ↗
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 sm:col-start-2 lg:col-start-auto">
          {TOKEN.isLive ? (
            <a
              href={PONS.page(BRAND.ca)}
              target="_blank"
              rel="noreferrer"
              className="rounded-[3px] bg-forest px-6 py-3.5 text-[15px] font-semibold text-cream transition-[background-color,transform] hover:bg-deep active:scale-[0.98]"
            >
              Buy on Pons <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className="cursor-default rounded-[3px] bg-forest/40 px-6 py-3.5 text-[15px] font-semibold text-cream">Buy on Pons soon</span>
          )}
          <Link href={TOKEN.isLive ? `/coin/${BRAND.ca}` : "/token"} className="rounded-[3px] border border-forest/30 px-6 py-3.5 text-[15px] font-semibold transition-colors hover:border-forest">
            {TOKEN.isLive ? "Coin page" : "Token page"}
          </Link>
        </div>
      </section>

      <section
        className="mt-10 grid gap-6 rounded-[4px] border border-forest bg-forest p-6 text-cream md:grid-cols-[1fr_auto] md:items-center md:gap-10 md:p-8"
        aria-label="Weekly race"
      >
        <div>
          <p className="font-mono text-[12px] text-cream/70">
            Weekly race{leftLabel}
          </p>
          <p className="mt-2 text-[34px] leading-[1.05] font-medium tracking-[-0.04em] md:text-[44px]">
            #1 by volume {verb} <span className="font-pixel whitespace-nowrap text-lime">{prize}</span>
          </p>
          <p className="mt-2 text-[14px] text-cream/70">
            Ranked on curve volume since Monday. Closes {now === null ? "Sunday, 23:59 UTC" : closeLabel(now)}.{" "}
            <Link href="/race" className="underline underline-offset-4 hover:text-cream">
              Open the race
            </Link>
          </p>
        </div>
        <p className="text-[15px] text-cream/70 md:w-[380px]">
          {leader ? (
            <>
              Out front: <Link href={`/coin/${leader.token}`} className="font-semibold text-cream hover:underline">${leader.symbol}</Link> with {eth(leader.volumeWeekEth)} traded.
            </>
          ) : (
            <>
              Empty track so far.{" "}
              <Link href="/app" className="text-cream underline underline-offset-4">
                Start one
              </Link>
              .
            </>
          )}
        </p>
      </section>

      <section className="mt-14" aria-label="All launches">
        <div className="flex gap-6 border-b border-rule" role="tablist" aria-label="Sort launches">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className={`-mb-px border-b-2 pb-3 text-[16px] transition-colors ${tab === t.id ? "border-forest font-semibold text-forest" : "border-transparent text-forest-3 hover:text-forest"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {rows === null ? (
          <p className="mt-6 font-mono text-[12px] text-forest-3">Reading the chain…</p>
        ) : !configured ? (
          <Empty className="mt-6">The launch list is not configured on this site yet.</Empty>
        ) : shown.length === 0 ? (
          <Empty className="mt-6">
            {tab === "new" ? (
              <>
                Nothing launched through {BRAND.name} yet.{" "}
                <Link href="/app" className="underline underline-offset-4">
                  Be first
                </Link>
                .
              </>
            ) : tab === "trending" ? (
              "No trades in the last 24 hours."
            ) : (
              "No coin has filled its curve yet."
            )}
          </Empty>
        ) : (
          <ul className="mt-6 divide-y divide-rule rounded-[4px] border border-rule bg-card">
            {shown.map((r) => (
              <li key={r.token}>
                <Link href={`/coin/${r.token}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-cream/60 md:grid-cols-[auto_minmax(0,1fr)_120px_110px_90px_140px_60px] md:px-5">
                  <CoinArt src={r.logo} name={r.name} size={44} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                    <span className="block truncate font-pixel text-[14px] text-forest-3">${r.symbol}</span>
                  </span>
                  <span className="text-right font-mono text-[13px] tabular-nums">
                    <span className="block text-[10px] text-forest-3 md:hidden">MC</span>
                    {usd(r.mcapUsd)}
                  </span>
                  <span className="hidden text-right font-mono text-[12px] tabular-nums md:block">{eth(r.volume24hEth)}</span>
                  <span className={`hidden text-right font-mono text-[12px] tabular-nums md:block ${r.change24h && r.change24h < 0 ? "text-down" : r.change24h ? "text-up" : "text-forest-3"}`}>{pct(r.change24h)}</span>
                  <span className="hidden md:block">
                    {r.graduated ? (
                      <span className="rounded-full bg-lime px-2 py-0.5 font-mono text-[11px]">graduated</span>
                    ) : (
                      <span className="block h-[3px] bg-forest/15">
                        <span className="block h-full bg-forest" style={{ width: `${Math.round((r.progress ?? 0) * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="hidden text-right font-mono text-[11px] text-forest-3 md:block">{ago(r.launchedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
