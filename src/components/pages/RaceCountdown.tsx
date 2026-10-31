"use client";

import { useNow } from "@/lib/useNow";
import { left, weekEnd } from "@/lib/week";

/** Live countdown to the end of the race week (Sunday 23:59:59 UTC). */
export function RaceCountdown() {
  const now = useNow(1000);
  const l = now === null ? null : left(weekEnd(now), now);
  const cell = (v: number | undefined, u: string) => (
    <span className="rounded-[3px] bg-cream/10 px-2 py-1">
      <b className="font-pixel text-[1.25em] font-medium text-lime">{v === undefined ? "--" : String(v).padStart(2, "0")}</b>
      <span className="ml-0.5 text-cream/70">{u}</span>
    </span>
  );
  return (
    <span className="inline-flex gap-1.5 tabular-nums" role="timer" aria-label="Time left in the race" data-testid="countdown">
      {cell(l?.d, "d")}
      {cell(l?.h, "h")}
      {cell(l?.m, "m")}
      {cell(l?.s, "s")}
    </span>
  );
}
