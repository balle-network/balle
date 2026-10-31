"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/Mark";

// "tweet" is left out: in the pixel face it is too wide for the headline column.
const WORDS = ["idea", "meme", "post", "link", "joke"];

/** The live word in the headline: a forest plate that wipes across before each new word. */
export function RotatingWord() {
  const [i, setI] = useState(0);
  const [wipe, setWipe] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let swap: number | undefined;
    const t = window.setInterval(() => {
      setWipe(true);
      swap = window.setTimeout(() => {
        setI((n) => (n + 1) % WORDS.length);
        setWipe(false);
      }, 280);
    }, 2400);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(swap);
    };
  }, []);
  return (
    <span className="hero-word">
      <span className="sr-only">{WORDS.join(", ")}</span>
      <span className="hero-plate" style={{ transform: wipe ? "scaleX(0.02)" : "scaleX(1)" }} aria-hidden="true" />
      <span className="hero-wtext" aria-hidden="true" style={{ opacity: wipe ? 0 : 1, transition: "opacity .14s" }}>
        {WORDS[i]}
      </span>
      {WORDS.map((w) => (
        <span key={w} className="hero-wsizer" aria-hidden="true">
          {w}
        </span>
      ))}
    </span>
  );
}

export const IDEA_KEY = "balle.idea";

/** One box: whatever is typed travels to the app, where signing in starts the draft. */
export function HeroComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = () => {
    const v = text.trim();
    try {
      if (v) sessionStorage.setItem(IDEA_KEY, v.slice(0, 1500));
    } catch {
      // Private mode: the app simply opens empty.
    }
    router.push("/app");
  };
  return (
    <div className="hero-chat">
      <div className="hero-msg hero-rise">
        <span className="hero-avatar" aria-hidden="true">
          <Mark size={20} />
        </span>
        <p className="hero-bubble">
          Balle picks the name, ticker and art, then writes the opening post. Tweak it in chat; your wallet launches it on Pons.
        </p>
      </div>
      <form
        aria-label="Start a coin from your idea"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="hero-composer hero-rise"
      >
        <label htmlFor="hero-idea" className="sr-only">
          Your coin idea
        </label>
        <textarea
          id="hero-idea"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          placeholder="Drop an idea, meme or link"
          className="hero-input"
        />
        <button type="submit" className="hero-send" aria-label="Start drafting" data-empty={text.trim() ? undefined : ""}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
