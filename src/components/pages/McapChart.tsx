"use client";

import { useMemo, useState } from "react";
import { usd } from "@/lib/format";
import { useNow } from "@/lib/useNow";

type Pt = { t: number; mcapEth: number };
const RANGES = [
  { id: "1h", label: "1H", sec: 3600 },
  { id: "1d", label: "1D", sec: 86400 },
  { id: "all", label: "All", sec: Infinity },
] as const;

/** Market cap after each curve trade, in dollars at today's ETH price. */
export function McapChart({ points, ethUsd, nowEth }: { points: Pt[]; ethUsd: number | null; nowEth: number | null }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1d");
  const W = 1000;
  const H = 300;
  const clock = useNow(30_000);
  const data = useMemo(() => {
    if (clock === null) return [] as Pt[];
    const sec = RANGES.find((r) => r.id === range)!.sec;
    const now = clock / 1000;
    const inRange = points.filter((p) => now - p.t <= sec);
    const prev = [...points].reverse().find((p) => now - p.t > sec);
    const series = [...(prev ? [{ t: Math.max(prev.t, now - (Number.isFinite(sec) ? sec : 0)), mcapEth: prev.mcapEth }] : []), ...inRange];
    if (nowEth !== null) series.push({ t: now, mcapEth: nowEth });
    return series;
  }, [points, range, nowEth, clock]);
  const rate = ethUsd ?? 0;
  const vals = data.map((d) => d.mcapEth * rate);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.2 || max * 0.07 || 1;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const t0 = data[0]?.t ?? 0;
  const t1 = data[data.length - 1]?.t ?? 1;
  // The right edge keeps room for the price labels.
  const x = (t: number) => (t1 === t0 ? W * 0.94 : ((t - t0) / (t1 - t0)) * W * 0.94);
  const y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.mcapEth * rate).toFixed(1)}`).join(" ");
  const now = nowEth !== null && ethUsd ? nowEth * ethUsd : null;
  const fmt = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const ticks = [hi - pad * 0.5, (hi + lo) / 2, lo + pad * 0.5];
  const last = data[data.length - 1];
  const xs = data.length > 1 ? [0, 1 / 3, 2 / 3, 1].map((f) => t0 + (t1 - t0) * f) : [];

  return (
    <section className="border border-rule bg-card" aria-label="Market cap chart">
      <div className="flex items-start justify-between gap-4 px-4 pt-4 md:px-5 md:pt-5">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-forest-3">Market cap</p>
          <p className="mt-1.5 text-[20px] leading-none font-medium tracking-[-0.03em] tabular-nums md:text-[24px]" data-testid="mcap">
            {usd(now)}
          </p>
          <p className="mt-1.5 h-4 font-mono text-[11px] text-forest-3 tabular-nums">Right now</p>
        </div>
        <div className="flex shrink-0 border border-rule" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
              className={`min-w-11 px-3 py-2 font-mono text-[12px] transition-colors ${range === r.id ? "bg-forest text-cream" : "text-forest-3 hover:text-forest"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-3 h-[220px] md:h-[320px]">
        {data.length < 2 || !ethUsd ? (
          <p className="absolute inset-0 grid place-items-center font-mono text-[12px] text-forest-3">{ethUsd ? "No trades in this range yet" : "ETH price unavailable right now"}</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 block size-full" role="img" aria-label="Market cap over time">
              <defs>
                <linearGradient id="mcap-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#073e32" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#073e32" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {ticks.map((v) => (
                <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="#cfd2bf" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={`${line} L${x(last.t)},${H} L0,${H} Z`} fill="url(#mcap-fill)" />
              <path d={line} fill="none" stroke="#073e32" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            </svg>
            <span
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-forest bg-card"
              style={{ left: `${(x(last.t) / W) * 100}%`, top: `${(y(last.mcapEth * rate) / H) * 100}%` }}
              aria-hidden="true"
            />
            {ticks.map((v) => (
              <span key={v} className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-forest-3" style={{ top: `${(y(v) / H) * 100}%` }}>
                {usd(v)}
              </span>
            ))}
          </>
        )}
      </div>
      <div className="flex justify-between border-t border-rule px-1 py-1.5 font-mono text-[10px] text-forest-3 md:px-1">
        {xs.length ? xs.map((t, i) => <span key={i}>{fmt(t)}</span>) : <span>&nbsp;</span>}
        <span>UTC</span>
      </div>
    </section>
  );
}
