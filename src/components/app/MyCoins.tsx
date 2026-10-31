"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { ago } from "@/lib/format";
import { Mark } from "@/components/Mark";
import { SignInGate } from "@/components/app/SignInGate";

type Row = { id: string; updatedAt: number; name: string; ticker: string; line?: string; messages?: number; art: string | null; launched: { token: string } | null };

function List() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/drafts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { drafts?: Row[] }) => setRows(j.drafts ?? []))
      .catch(() => setRows([]));
  }, []);

  const remove = async (id: string) => {
    setProblem(null);
    setGone(id);
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not delete that draft.");
      setRows((r) => (r ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not delete that draft.");
    } finally {
      setGone(null);
    }
  };

  return (
    <main className="px-[clamp(16px,2vw,28px)] pt-10 pb-20 text-forest md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[44px] leading-none font-medium tracking-[-0.055em] md:text-[72px]">My coins</h1>
          <p className="mt-3 font-mono text-[11px] text-ash">Kept on {BRAND.name} for 30 days after the last edit</p>
        </div>
        <Link href="/app" className="rounded-[3px] bg-ink px-5 py-3 text-[15px] font-medium text-white transition-transform active:scale-[0.97]">
          New coin
        </Link>
      </div>
      {problem ? <p className="mt-6 text-[14px] text-down">{problem}</p> : null}
      {rows === null ? (
        <p className="mt-8 font-mono text-[12px] text-ash">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-[4px] border border-rule bg-card px-5 py-10 text-center text-[15px] text-forest-2">
          Nothing saved yet.{" "}
          <Link href="/app" className="underline underline-offset-4">
            Start one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {rows.map((r) => (
            <li key={r.id} className={`group relative transition-[opacity,transform] duration-150 ease-out ${gone === r.id ? "scale-[0.98] opacity-50" : ""}`}>
              <Link href={r.launched ? `/coin/${r.launched.token}` : `/app/${r.id}`} className="block rounded-[4px] border border-line bg-white p-2 transition-colors hover:border-ink">
                <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-[2px] bg-paper text-line">
                  {r.art ? <img src={`/api/art/${r.art}`} alt={`${r.name || "Coin"} art`} className="size-full object-cover" loading="lazy" /> : <Mark size={64} className="size-16" />}
                </div>
                <div className="flex items-start justify-between gap-3 px-1.5 pt-4 pb-1">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{r.name || "Untitled"}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug break-words text-ash">{r.ticker ? `$${r.ticker}` : r.line || "No ticker yet"}</p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px] text-ash">
                    <p className="text-ink">{r.launched ? "Live" : "Draft"}</p>
                    <p className="mt-1">{r.messages ? `${r.messages} msgs` : "No msgs"}</p>
                    <p className="mt-1">{ago(r.updatedAt)} ago</p>
                  </div>
                </div>
              </Link>
              {!r.launched ? (
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={gone === r.id}
                  className="absolute top-4 right-4 rounded-[3px] border border-line bg-white px-2 py-1 font-mono text-[11px] text-ink transition-[opacity,transform] duration-150 ease-out focus-visible:opacity-100 active:scale-[0.97] pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function MyCoins() {
  return (
    <SignInGate>
      <List />
    </SignInGate>
  );
}
