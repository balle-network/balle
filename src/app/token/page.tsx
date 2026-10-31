import Link from "next/link";
import { BRAND, CHAIN, PONS, TOKEN, explorerToken, hasX } from "@/config/brand";
import { BalleCa } from "@/components/CopyCa";
import { Mark } from "@/components/Mark";
import { MadeWith } from "@/components/SiteFooter";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: `${BRAND.name} (${BRAND.symbol}) Token`,
  description: `${BRAND.symbol} is the token of ${BRAND.name}, the AI coin creator on ${CHAIN.name}. Contract address, where it trades and how to buy it.`,
  path: "/token",
});

const NOTES = [
  ["Where it trades", `On its Pons bonding curve first, then in a Uniswap v4 pool on ${CHAIN.name} once the curve fills.`],
  ["How to buy it", `Hold ETH on ${CHAIN.name} in a wallet such as MetaMask or Rabby, open the coin on Pons from this page, and buy from that wallet.`],
  ["Check the address", `Anyone can copy a ticker. Only the address shown on ${BRAND.domain} is ${BRAND.symbol}.`],
];

export default function TokenPage() {
  return (
    <main className="px-[clamp(16px,2vw,28px)] pt-[clamp(16px,2vw,28px)] pb-16 text-forest">
      <section className="border border-rule bg-card" aria-label={`${BRAND.symbol} token`}>
        <div className="flex flex-col gap-5 p-4 md:flex-row md:items-center md:gap-8 md:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-7">
            <div className="grid size-[92px] shrink-0 place-items-center rounded-[3px] border border-rule bg-cream md:size-[148px]">
              <Mark size={96} className="size-3/4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] text-forest-3 md:text-[18px]">{BRAND.name} token</p>
              <h1 className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-[0.25em] font-pixel text-[30px] leading-none md:text-[76px]">
                <span className="min-w-0 truncate">{BRAND.symbol}</span>
                <span className="shrink-0 text-[0.55em] text-forest-3">/ ETH</span>
              </h1>
              <p className="mt-2.5 font-mono text-[11px] text-forest-3 md:mt-3.5 md:text-[12px]">{TOKEN.isLive ? `Trading on Pons, ${CHAIN.name}` : "Not live yet. The address shows up here the moment it launches"}</p>
            </div>
          </div>
          {TOKEN.isLive ? (
            <a
              href={PONS.page(BRAND.ca)}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center justify-center gap-2 rounded-[3px] bg-forest px-8 py-4 text-[17px] font-semibold text-cream transition-[background-color,transform] hover:bg-deep active:scale-[0.98] md:py-5 md:text-[18px]"
            >
              Buy on Pons <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className="flex shrink-0 items-center justify-center rounded-[3px] bg-forest/40 px-8 py-4 text-[17px] font-semibold text-cream md:py-5 md:text-[18px]">Buy on Pons soon</span>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-rule px-4 py-3.5 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
            <BalleCa size="sm" testid="ca-token" />
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-forest-3">
              {TOKEN.isLive ? (
                <>
                  <a className="hover:text-forest" href={explorerToken(BRAND.ca)} target="_blank" rel="noreferrer">
                    Blockscout ↗
                  </a>
                  <Link className="hover:text-forest" href={`/coin/${BRAND.ca}`}>
                    Live coin page
                  </Link>
                </>
              ) : null}
              {hasX ? (
                <a className="hover:text-forest" href={BRAND.x} target="_blank" rel="noreferrer">
                  {BRAND.xHandle} on X ↗
                </a>
              ) : null}
            </p>
          </div>
          <p className="min-w-0 text-[14px] leading-snug text-forest-2 md:max-w-[56ch] md:text-right">
            {BRAND.symbol} is {BRAND.name}&apos;s own coin, launched on Pons like every coin made here.
          </p>
        </div>
      </section>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {NOTES.map(([t, b]) => (
          <div key={t} className="rounded-[4px] border border-rule bg-card px-5 py-4">
            <h2 className="text-[15px] font-semibold">{t}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-forest-3">{b}</p>
          </div>
        ))}
      </div>
      <MadeWith />
    </main>
  );
}
