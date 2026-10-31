"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND, TOKEN, explorerToken, shortAddress } from "@/config/brand";

/*
 * Copy CA, Balle style: a chunky price-tag sticker. The ticker sits over a
 * short address; pressing it squashes the tag into its hard shadow, and a
 * speech bubble pops up above it for a moment once the address is copied.
 * The explorer link is the small round arrow beside it. One source for the
 * token's own address: BRAND.ca in src/config/brand.ts.
 */

export function useCopy(text: string, enabled = true) {
  const [copied, setCopied] = useState(false);
  const [round, setRound] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!enabled) return false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    setRound((n) => n + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
    return true;
  };
  return { copied, copy, round };
}

type StickerProps = {
  /** Address to copy; defaults to the $BALLE contract. */
  address?: string;
  /** Text on the tag; defaults to $BALLE. */
  label?: string;
  /** Explorer page for the round arrow; defaults to the token page on Blockscout. */
  explorer?: string | null;
  size?: "md" | "sm";
  /** Cream outlines for use on forest backgrounds. */
  dark?: boolean;
  className?: string;
  testid?: string;
};

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

export function CaSticker({
  address = BRAND.ca,
  label = BRAND.symbol,
  explorer,
  size = "md",
  dark = false,
  className = "",
  testid = "ca-sticker",
}: StickerProps) {
  const live = isAddr(address);
  const { copied, copy, round } = useCopy(address, live);
  const [pressed, setPressed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  const href =
    explorer === undefined ? (live ? explorerToken(address) : null) : explorer;

  const onClick = async () => {
    if (!live) {
      setNote("not live yet");
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNote(null), 1500);
      return;
    }
    await copy();
  };

  const bubble = copied ? "copied!" : note;
  return (
    <span
      className={`sticker ${size === "sm" ? "sticker-sm" : ""} ${dark ? "sticker-dark" : ""} ${className}`}
    >
      <span className="relative inline-flex">
        {bubble ? (
          <span
            key={`${round}-${bubble}`}
            className="sticker-bubble"
            role="status"
            aria-live="polite"
          >
            {bubble}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClick}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          data-pressed={pressed ? "" : undefined}
          className="sticker-tag"
          title={
            live
              ? `Copy ${address}`
              : "The contract address is published at launch"
          }
          aria-label={
            live
              ? `Copy ${label} contract address ${address}`
              : `${label} contract address is not published yet`
          }
          data-testid={testid}
          data-address={live ? address : ""}
        >
          <span className="sticker-label">{label}</span>
          <span className="sticker-addr">
            {live ? shortAddress(address, 4, 2) : "at launch"}
          </span>
        </button>
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="sticker-out"
          aria-label="Open on Blockscout"
          title="Open on Blockscout"
        >
          <svg
            viewBox="0 0 12 12"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3.5 8.5l5-5M4.5 3.5h4v4" />
          </svg>
        </a>
      ) : null}
    </span>
  );
}

/** The $BALLE sticker. Shows "at launch" until BRAND.ca holds a real address. */
export function BalleCa(props: Omit<StickerProps, "address" | "label">) {
  return (
    <CaSticker
      {...props}
      address={BRAND.ca}
      label={BRAND.symbol}
      explorer={TOKEN.explorerUrl}
    />
  );
}
