"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { PublicDraft } from "@/lib/drafts";
import { useAuth } from "@/components/auth/AuthProvider";
import { Chat } from "@/components/app/Chat";
import { Panel } from "@/components/app/Panel";
import { SignInGate } from "@/components/app/SignInGate";

function Inner({ id }: { id: string }) {
  const { me, refresh } = useAuth();
  const [draft, setDraft] = useState<PublicDraft | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  useEffect(() => {
    fetch(`/api/drafts/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return setMissing(true);
        setDraft(((await r.json()) as { draft: PublicDraft }).draft);
      })
      .catch(() => setMissing(true));
  }, [id]);

  const call = useCallback(
    async (url: string, init: RequestInit) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(url, init);
        const j = (await res.json()) as { draft?: PublicDraft; error?: string };
        if (j.draft) setDraft(j.draft);
        if (!res.ok) {
          setError(j.error ?? "That did not work.");
          return false;
        }
        return true;
      } catch {
        setError("The site could not be reached.");
        return false;
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [refresh],
  );

  if (missing)
    return (
      <main className="mx-auto flex w-full max-w-[640px] flex-col items-start gap-4 px-5 py-24 text-forest">
        <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em]">No draft at this address.</h1>
        <p className="text-[17px] leading-relaxed text-ash">It may belong to another wallet, or it expired after 30 days without changes.</p>
        <Link href="/app" className="rounded-[3px] bg-forest px-5 py-3 text-[15px] font-semibold text-cream">
          Start a new coin
        </Link>
      </main>
    );
  if (!draft) return <main className="px-8 py-24 font-mono text-[12px] text-ash">Opening the draft…</main>;

  return (
    <main className="mx-auto grid w-full max-w-[1320px] items-start gap-5 px-4 py-5 max-md:p-0 md:px-8 md:py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <h1 className="sr-only">{draft.coin.name || "New coin"} draft</h1>
      <div className="min-w-0 lg:sticky lg:top-5">
        {error ? (
          <p className="mb-3 rounded-[4px] border border-down/40 bg-white px-3 py-2 text-[14px] text-down max-md:m-3" role="status">
            {error}
          </p>
        ) : null}
        <Chat
          draft={draft}
          busy={busy}
          left={me?.left?.messages ?? null}
          allowance={me?.allowance.messages ?? 30}
          onSend={(form) => call(`/api/drafts/${id}/chat`, { method: "POST", body: form })}
          onOpenCoin={() => setSheet(true)}
          coinOpen={sheet}
        />
      </div>
      <div
        className={`fixed inset-0 z-40 bg-deep/50 transition-opacity duration-300 motion-reduce:transition-none lg:hidden ${sheet ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setSheet(false)}
        aria-hidden="true"
      />
      <aside
        id="coin-sheet"
        aria-label="Coin sheet"
        className={`max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[88svh] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:border-t max-lg:border-ink max-lg:bg-white max-lg:transition-[translate,visibility] max-lg:duration-300 max-lg:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:max-lg:mx-auto md:max-lg:max-w-[520px] md:max-lg:border-x lg:sticky lg:top-5 lg:max-h-[calc(100svh-132px)] lg:overflow-y-auto lg:overscroll-contain ${
          sheet ? "max-lg:visible max-lg:translate-y-0" : "max-lg:invisible max-lg:translate-y-full"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white py-1.5 pr-1.5 pl-4 lg:hidden">
          <h2 className="text-[16px] font-semibold">Coin</h2>
          <button type="button" aria-label="Close" onClick={() => setSheet(false)} className="grid size-11 place-items-center rounded-[3px] hover:bg-ink/10">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
        <Panel
          draft={draft}
          busy={busy}
          patch={(body) => call(`/api/drafts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })}
          art={(form) => call(`/api/drafts/${id}/art`, { method: "POST", body: form })}
          onLaunched={setDraft}
        />
      </aside>
    </main>
  );
}

export function Studio({ id }: { id: string }) {
  return (
    <SignInGate>
      <Inner id={id} />
    </SignInGate>
  );
}
