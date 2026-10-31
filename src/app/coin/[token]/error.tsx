"use client";

import { Mark } from "@/components/Mark";

/** Robinhood Chain could not be read for this coin (a busy RPC); unlike a 404, trying again can work. */
export default function CoinError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-90px)] w-full max-w-[640px] flex-col items-start justify-center gap-5 px-5 py-16 text-forest">
      <Mark size={48} className="size-12" />
      <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em] md:text-[52px]">The chain did not answer.</h1>
      <p className="max-w-[36ch] text-[17px] leading-relaxed text-ash">This coin could not be read from chain just now. That is usually a busy endpoint, not a missing coin.</p>
      <button type="button" onClick={reset} className="rounded-[3px] bg-forest px-5 py-3 text-[15px] font-semibold text-cream">
        Try again
      </button>
    </main>
  );
}
