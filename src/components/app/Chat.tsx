"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Link as LinkIcon, FileText, ImageSquare } from "@phosphor-icons/react";
import { PAIR_TOKENS } from "@/config/pairs.generated";
import type { PublicDraft } from "@/lib/drafts";
import { Mark } from "@/components/Mark";
import { AttachList, AttachRow, useAttachments } from "@/components/app/NewCoin";

type Props = {
  draft: PublicDraft;
  busy: boolean;
  left: number | null;
  allowance: number;
  onSend: (form: FormData) => Promise<boolean>;
  /** Opens the coin sheet on screens where the panel is a drawer. */
  onOpenCoin?: () => void;
  coinOpen?: boolean;
};

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function Chat({ draft, busy, left, allowance, onSend, onOpenCoin, coinOpen = false }: Props) {
  const [text, setText] = useState("");
  const [memory, setMemory] = useState(false);
  const a = useAttachments();
  const end = useRef<HTMLLIElement>(null);
  const memoryBox = useRef<HTMLDivElement>(null);
  const launched = Boolean(draft.launched);
  const pairLabel = draft.settings.pair === "eth" ? "ETH" : (PAIR_TOKENS.find((p) => p.address.toLowerCase() === draft.settings.pair.toLowerCase())?.symbol ?? "token");

  const list = useRef<HTMLOListElement>(null);
  const seen = useRef(false);
  useEffect(() => {
    const ol = list.current;
    if (!ol) return;
    // On wide screens the list scrolls inside the card; on phones the page itself scrolls.
    if (getComputedStyle(ol).overflowY === "auto") ol.scrollTop = ol.scrollHeight;
    else if (seen.current) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    seen.current = true;
  }, [draft.messages.length, busy]);

  useEffect(() => {
    if (!memory) return;
    const onDown = (e: PointerEvent) => {
      if (!memoryBox.current?.contains(e.target as Node)) setMemory(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMemory(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [memory]);

  const send = async (extra?: Record<string, string>) => {
    if (busy) return;
    const form = new FormData();
    if (extra) for (const [k, v] of Object.entries(extra)) form.set(k, v);
    else {
      if (!text.trim() && !a.image && !a.file) return;
      form.set("text", text.trim());
      if (a.image) form.set("image", a.image);
      if (a.file) form.set("file", a.file);
    }
    const ok = await onSend(form);
    if (ok && !extra) {
      setText("");
      a.clear();
    }
  };

  const lastWithDirections = [...draft.messages].reverse().find((m) => m.directions?.length)?.id;

  return (
    <section
      className="flex min-w-0 flex-col rounded-[4px] border border-line bg-white max-md:rounded-none max-md:border-0 max-lg:min-h-[calc(100svh-120px)] md:max-lg:min-h-[calc(100svh-168px)] lg:sticky lg:top-5 lg:h-[calc(100svh-132px)] lg:min-h-[72svh] lg:overflow-hidden"
      aria-label="Chat"
    >
      <header className="relative flex items-center justify-between gap-3 border-b border-line px-5 py-3 max-lg:sticky max-lg:top-0 max-lg:z-20 max-lg:bg-white max-md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[3px] bg-paper text-mist">
            <Mark size={20} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold">{draft.coin.name || "New coin"}</p>
            <p className="font-mono text-[11px] text-ash">{launched ? "Live" : "Draft"}</p>
          </div>
        </div>
        <div ref={memoryBox} className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={memory}
            onClick={() => setMemory((v) => !v)}
            className={`h-10 rounded-[3px] px-2.5 font-mono text-[11px] transition-colors hover:text-ink ${memory ? "text-ink" : "text-ash"}`}
            data-testid="memory-tab"
          >
            Memory
          </button>
          {onOpenCoin ? (
            <button
              type="button"
              aria-expanded={coinOpen}
              aria-controls="coin-sheet"
              onClick={onOpenCoin}
              className="h-10 shrink-0 rounded-[3px] bg-white px-4 text-[14px] font-semibold shadow-[inset_0_0_0_1px_#cfd2bf] active:scale-[0.97] lg:hidden"
            >
              Coin
            </button>
          ) : null}
          {memory ? (
            <div className="absolute top-[calc(100%+8px)] right-3 z-30 w-[min(360px,calc(100vw-40px))] rounded-[4px] border border-line bg-white p-5 shadow-[0_12px_30px_#082f2629]">
              <p className="text-[16px] font-semibold">Memory</p>
              <p className="mt-2 text-[14px] leading-relaxed text-ash">
                What {draft.coin.name || "this coin"} has picked up so far. Each edit and every post builds on it.
              </p>
              <dl className="mt-4 grid gap-3 text-[14px] leading-relaxed">
                <div>
                  <dt className="font-mono text-[11px] text-ash">My read</dt>
                  <dd className="mt-0.5">{draft.memory.reading || "Nothing yet."}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] text-ash">Voice</dt>
                  <dd className="mt-0.5">{draft.memory.voice || "Set once you pick a direction."}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] text-ash">Facts worth keeping</dt>
                  <dd className="mt-0.5">
                    {draft.memory.facts.length ? (
                      <ul className="list-disc space-y-1 pl-4">
                        {draft.memory.facts.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      "None yet."
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </header>

      <ol ref={list} className="flex-1 space-y-7 px-4 py-6 md:px-6 lg:overflow-y-auto" data-testid="messages">
        {draft.messages.map((m) =>
          m.role === "you" ? (
            <li key={m.id} className="flex flex-col items-end gap-2">
              <div className="max-w-[85%] space-y-2 rounded-[4px] bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-white">
                <p className="break-words whitespace-pre-wrap">{m.text}</p>
              </div>
              {m.attachments?.map((x, i) => (
                <span key={i} className="flex max-w-[85%] items-center gap-2 rounded-[3px] bg-forest/[0.07] px-2.5 py-1 font-mono text-[11px] text-forest-2">
                  {x.kind === "link" ? <LinkIcon size={12} /> : x.kind === "file" ? <FileText size={12} /> : <ImageSquare size={12} />}
                  <span className="truncate">{x.label}</span>
                </span>
              ))}
            </li>
          ) : (
            <li key={m.id} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[3px] border border-line bg-paper text-ink">
                <Mark size={20} />
              </span>
              <div className="min-w-0 flex-1 space-y-3 pt-1 text-[15px] leading-relaxed">
                {m.reading ? (
                  <p className="text-[14px] text-ash">
                    <span className="mr-2 font-mono text-[12px] text-ink">My read</span>
                    {m.reading}
                  </p>
                ) : null}
                <p className={`break-words whitespace-pre-wrap ${m.note === "error" ? "text-down" : m.note === "info" ? "text-ash" : ""}`}>{m.text}</p>
                {m.directions?.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="directions">
                    {m.directions.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        disabled={busy || launched}
                        onClick={() => send({ pick: d.id })}
                        className="group flex min-w-0 flex-col items-start rounded-[4px] border border-line bg-paper p-3.5 text-left transition-colors enabled:hover:border-ink disabled:cursor-default"
                      >
                        <span className="rounded-[2px] bg-white px-2 py-0.5 font-mono text-[11px]">{d.tone}</span>
                        <span className="mt-3 text-[16px] leading-tight font-semibold">{d.name}</span>
                        <span className="mt-1.5 font-pixel text-[14px] text-ash">
                          ${d.ticker} <span className="text-mist">/ {pairLabel}</span>
                        </span>
                        <span className="mt-3 text-[13px] leading-snug text-ash">{d.line}</span>
                        <span className="mt-auto pt-4 font-mono text-[12px] text-ink group-enabled:group-hover:underline">Pick this</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.directions?.length && m.id === lastWithDirections && !launched ? (
                  <p>
                    Choose one, or{" "}
                    <button type="button" disabled={busy} className="underline underline-offset-4" onClick={() => send({ text: "Give me three other directions." })}>
                      ask for three fresh takes
                    </button>
                    .
                  </p>
                ) : null}
                <p className="font-mono text-[10px] text-mist">{time(m.at)}</p>
              </div>
            </li>
          ),
        )}
        {busy ? (
          <li className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-[3px] border border-line bg-paper text-ink">
              <Mark size={20} />
            </span>
            <span className="flex items-center gap-1 pt-3" aria-label="Working on it">
              <span className="size-1.5 animate-bounce rounded-full bg-ash" />
              <span className="size-1.5 animate-bounce rounded-full bg-ash [animation-delay:120ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-ash [animation-delay:240ms]" />
            </span>
          </li>
        ) : null}
        <li ref={end} aria-hidden="true" className="h-0 !mt-0" />
      </ol>

      <div className="border-t border-line p-3 max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:bg-white max-lg:pb-[max(12px,env(safe-area-inset-bottom))]">
        <AttachList a={a} className="mb-2" />
        <form
          className="flex items-end gap-1.5 rounded-[4px] border border-[#d4d4d4] bg-white p-1.5 transition-colors focus-within:border-ink"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <AttachRow a={a} compact />
          <label htmlFor="ask" className="sr-only">
            Message {draft.coin.name || "the desk"}
          </label>
          <textarea
            id="ask"
            rows={1}
            value={text}
            disabled={launched}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={launched ? "Live on chain now, so the fields are fixed" : "Say what to change"}
            className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] outline-none placeholder:text-mist"
            data-testid="ask-input"
          />
          <button
            type="submit"
            className="grid size-11 shrink-0 place-items-center rounded-[3px] bg-ink text-white transition-opacity disabled:opacity-35"
            disabled={busy || launched || (!text.trim() && !a.image && !a.file)}
            aria-label="Send"
            data-testid="ask-send"
          >
            <ArrowUp size={18} />
          </button>
        </form>
        <p className="mt-2 px-1 font-mono text-[11px] text-ash">
          {a.problem ? <span className="text-down">{a.problem}</span> : left !== null ? `${left} of ${allowance} free messages left today` : "Free messages reset daily at 00:00 UTC"}
        </p>
      </div>
    </section>
  );
}
