"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND, RACE } from "@/config/brand";
import type { Race as RaceData } from "@/lib/board";
import { eth, usd } from "@/lib/format";
import { closeLabel } from "@/lib/week";
import { useNow } from "@/lib/useNow";
import { CoinArt } from "@/components/ui";
import { RaceCountdown } from "@/components/pages/RaceCountdown";

export function Race() {
  const [data, setData] = useState<RaceData | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/race", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { race: RaceData | null }) => setData(j.race))
      .catch(() => setData(null));
  }, []);
  const entrants = data?.entrants ?? [];
  const now = useNow(60_000);
  const close = now === null ? "Sunday, 23:59 UTC" : closeLabel(now);
  const verb = RACE.prize ? "wins" : "is";
  const prize = RACE.prize || "crowned";
  return (
    <>
      <section
        className="relative overflow-hidden rounded-[4px] bg-[#0b0d0c] bg-[url('/race/stage.webp')] bg-cover bg-[position:78%_center] text-cream md:aspect-[1184/560] md:bg-center"
        aria-label="Weekly race"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/10 md:hidden" />
        <div className="relative px-6 pt-10 pb-8 md:absolute md:top-1/2 md:left-11 md:-translate-y-1/2 md:p-0">
          <p className="font-mono text-[13px] text-cream/70">{BRAND.name} weekly race</p>
          <h1 className="mt-3 text-[44px] leading-[0.95] font-medium tracking-[-0.05em] md:text-[80px]">
            #1 by volume
            <br />
            {verb} <span className="font-pixel tracking-normal text-lime">{prize}</span>
          </h1>
          <div className="mt-6 font-mono text-[15px] md:text-[18px]">
            <RaceCountdown />
          </div>
          <p className="mt-3 font-mono text-[13px] text-cream/70">closes {close}</p>
        </div>
      </section>

      <h2 className="mt-10 mb-3 font-mono text-[12px] text-forest-3">On the board</h2>
      {data === undefined ? (
        <p className="rounded-[4px] border border-rule bg-card px-5 py-10 text-center font-mono text-[12px] text-forest-3">Reading the chain…</p>
      ) : data === null ? (
        <p className="rounded-[4px] border border-rule bg-card px-5 py-10 text-center text-[15px] text-forest-2">The race board is not configured on this site yet.</p>
      ) : entrants.length === 0 ? (
        <p className="rounded-[4px] border border-rule bg-card px-5 py-10 text-center text-[15px] text-forest-2">
          No runners yet.{" "}
          <Link href="/app" className="underline underline-offset-4">
            Start one
          </Link>
          .
        </p>
      ) : (
        <ol className="divide-y divide-rule rounded-[4px] border border-rule bg-card">
          {entrants.slice(0, 20).map((r, i) => (
            <li key={r.token}>
              <Link href={`/coin/${r.token}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-cream/60">
                <span className={`w-8 font-pixel text-[20px] ${i === 0 ? "text-forest" : "text-forest-3"}`}>{i + 1}</span>
                <CoinArt src={r.logo} name={r.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                  <span className="block truncate font-pixel text-[14px] text-forest-3">${r.symbol}</span>
                </span>
                <span className="text-right font-mono tabular-nums">
                  <span className="block text-[13px]">{eth(r.volumeWeekEth)}</span>
                  <span className="block text-[11px] text-forest-3">{usd(r.mcapUsd)} MC</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {[
          ["Who runs", `Coins launched through ${BRAND.name} this week.`],
          ["How it ranks", "ETH traded on the Pons curve since Monday."],
          ["Finish line", `${close}. ${RACE.prize ? `First place gets ${RACE.prize}.` : "No prize is set for this week."}`],
        ].map(([t, b]) => (
          <div key={t} className="rounded-[4px] border border-rule bg-card px-5 py-4">
            <p className="text-[15px] font-semibold">{t}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-forest-3">{b}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 font-mono text-[12px] text-forest-3">Earlier weeks</h2>
      {data?.winners.length ? (
        <ul className="divide-y divide-rule rounded-[4px] border border-rule bg-card">
          {data.winners.map((w) => (
            <li key={w.week} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[14px]">
              <span className="font-mono text-[11px] text-forest-3">week of {new Date(w.week).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              <Link href={`/coin/${w.token}`} className="font-pixel text-[15px] hover:underline">
                ${w.symbol}
              </Link>
              <span className="font-mono text-[12px] tabular-nums">{eth(w.volumeEth)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[4px] border border-dashed border-rule px-5 py-5 text-[14px] text-forest-3">The first winner gets written down when this week closes.</p>
      )}
    </>
  );
}
