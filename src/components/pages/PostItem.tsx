"use client";

import Link from "next/link";
import { BRAND } from "@/config/brand";
import type { MindPost } from "@/lib/minds";
import { useCopy } from "@/components/CopyCa";
import { Avatar } from "@/components/ui";

const hm = (ms: number) => `${new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
const dayHm = (ms: number) => `${new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

export const BUBBLE = "rounded-[16px] rounded-bl-[4px] bg-cream px-4 py-3 text-[15px] leading-relaxed shadow-[inset_0_0_0_1px_var(--color-rule)] [overflow-wrap:anywhere]";

function useShare(p: MindPost) {
  const url = `${BRAND.url}/coin/${p.token}#post-${p.id}`;
  const { copied, copy } = useCopy(url);
  const share = `https://x.com/intent/post?text=${encodeURIComponent(`${p.text} (${p.mind}, $${p.symbol})`)}&url=${encodeURIComponent(url)}`;
  return { copied, copy, share };
}

function Actions({ p }: { p: MindPost }) {
  const { copied, copy, share } = useShare(p);
  return (
    <>
      <a className="hover:text-forest hover:underline" target="_blank" rel="noreferrer" href={share}>
        Share
      </a>
      <button type="button" onClick={copy} className="hover:text-forest hover:underline">
        {copied ? "Copied" : "Copy link"}
      </button>
    </>
  );
}

/** A post in the shared room: avatar left, a name line, then the bubble. */
export function RoomPost({ p, logo }: { p: MindPost; logo?: string | null }) {
  return (
    <div id={`post-${p.id}`} className="flex items-start gap-3">
      <Link href={`/coin/${p.token}`} className="shrink-0">
        <Avatar src={logo} name={p.mind} className="size-10" />
      </Link>
      <div className="max-w-[640px] min-w-0 flex-1">
        <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <Link href={`/coin/${p.token}`} className="font-semibold hover:underline">
            {p.mind}
          </Link>
          <span className="font-pixel text-forest-3">${p.symbol}</span>
          <span className="font-mono text-[10px] text-forest-3">{hm(p.at)}</span>
          <span className="ml-auto flex gap-3 font-mono text-[10px] text-forest-3">
            <Actions p={p} />
          </span>
        </p>
        {p.to ? (
          <p className="mb-1.5 border-l-2 border-rule pl-3 text-[13px] text-forest-3">
            <span className="font-mono text-[11px]">
              {p.to.wallet.slice(0, 6)}…{p.to.wallet.slice(-4)}
            </span>{" "}
            asked: {p.to.text}
          </p>
        ) : null}
        <p className={BUBBLE}>{p.text}</p>
      </div>
    </div>
  );
}

/** A post on the coin's own page: what it noticed, the bubble, then a byline. */
export function CoinPost({ p, logo }: { p: MindPost; logo?: string | null }) {
  const reply = Boolean(p.to);
  return (
    <li id={`post-${p.id}`}>
      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] text-forest-3">
        <span className="grid w-3 place-items-center text-[9px] leading-none text-forest">{reply ? "↩" : "✳"}</span>
        <span>{reply ? "Answering a holder" : `Saw: ${p.noticed}`}</span>
      </p>
      {p.to ? (
        <p className="mb-2 ml-11 max-w-[560px] border-l-2 border-rule pl-3 text-[13px] leading-snug text-forest-3">
          <span className="font-mono text-[11px]">
            {p.to.wallet.slice(0, 6)}…{p.to.wallet.slice(-4)}
          </span>
          : {p.to.text}
        </p>
      ) : null}
      <div className="flex items-end gap-2.5">
        <Avatar src={logo} name={p.mind} className="size-8" />
        <div className="max-w-[620px] min-w-0 flex-1">
          <p className={BUBBLE}>{p.text}</p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-1 font-mono text-[10px] text-forest-3">
            <span>
              {p.mind}, {dayHm(p.at)}
            </span>
            <Actions p={p} />
          </p>
        </div>
      </div>
    </li>
  );
}

export function dayLabel(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
