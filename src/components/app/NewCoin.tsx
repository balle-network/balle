"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageSquare, X } from "@phosphor-icons/react";
import { BRAND } from "@/config/brand";
import { useAuth } from "@/components/auth/AuthProvider";
import { IDEA_KEY } from "@/components/home/HeroComposer";

const STARTERS = [
  "a raccoon who reviews vending machines",
  "my plant got more likes than me",
  "the last fax machine in the office",
  "a crab that only walks forward",
];

export const MAX_IMAGE = 4 * 1024 * 1024;
export const MAX_DOC = 2 * 1024 * 1024;

/** Attach buttons shared by the first message and the chat composer. */
export function useAttachments() {
  const [image, setImage] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pickImage = (f: File | undefined) => {
    setProblem(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setProblem("Images must be PNG, JPEG, WebP or GIF.");
    if (f.size > MAX_IMAGE) return setProblem("Images can be 4 MB at most.");
    setImage(f);
  };
  const pickFile = (f: File | undefined) => {
    setProblem(null);
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) return setProblem("Documents must be PDF or Word (.docx).");
    if (f.size > MAX_DOC) return setProblem("Documents can be 2 MB at most.");
    setFile(f);
  };
  const clear = () => {
    setImage(null);
    setFile(null);
  };
  return { image, file, problem, setProblem, pickImage, pickFile, clear, setImage, setFile };
}

export function AttachRow({ a, compact = false }: { a: ReturnType<typeof useAttachments>; compact?: boolean }) {
  const img = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const label = compact
    ? "grid size-11 shrink-0 cursor-pointer place-items-center rounded-[3px] text-forest hover:bg-black/5"
    : "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[3px] px-3 py-2 text-[14px] font-medium text-forest hover:bg-forest/5";
  return (
    <>
      <input ref={img} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} onChange={(e) => a.pickImage(e.target.files?.[0])} data-testid="attach-image" />
      <input ref={doc} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" tabIndex={-1} onChange={(e) => a.pickFile(e.target.files?.[0])} />
      <button type="button" onClick={() => img.current?.click()} className={label} aria-label={compact ? "Add a picture" : undefined}>
        <ImageSquare size={compact ? 20 : 17} />
        {compact ? null : "Add image"}
      </button>
      <button type="button" onClick={() => doc.current?.click()} className={label} aria-label={compact ? "Add a PDF or Word file" : undefined}>
        <FileText size={compact ? 20 : 17} />
        {compact ? null : (
          <>
            Add file <span className="hidden font-mono text-[11px] font-normal text-ash sm:inline">PDF or Word</span>
          </>
        )}
      </button>
    </>
  );
}

/** Attached files, shown as small removable plates above or inside a composer. */
export function AttachList({ a, className = "" }: { a: ReturnType<typeof useAttachments>; className?: string }) {
  if (!a.image && !a.file) return null;
  const plate = "flex max-w-full min-w-0 items-center gap-2 rounded-[3px] bg-forest/[0.07] py-1 pr-1 pl-2.5 font-mono text-[12px] leading-4 text-forest-2";
  const x = "grid size-6 shrink-0 place-items-center rounded-[3px] text-forest hover:bg-forest/10";
  return (
    <div className={`flex min-w-0 flex-wrap gap-2 ${className}`}>
      {a.image ? (
        <span className={plate}>
          <ImageSquare size={14} className="shrink-0" />
          <span className="min-w-0 truncate">{a.image.name}</span>
          <button type="button" aria-label="Remove image" onClick={() => a.setImage(null)} className={x}>
            <X size={12} />
          </button>
        </span>
      ) : null}
      {a.file ? (
        <span className={plate}>
          <FileText size={14} className="shrink-0" />
          <span className="min-w-0 truncate">{a.file.name}</span>
          <button type="button" aria-label="Remove file" onClick={() => a.setFile(null)} className={x}>
            <X size={12} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

export function NewCoin() {
  const router = useRouter();
  const { me } = useAuth();
  const [text, setText] = useState(() => {
    // Carries over what was typed on the home page.
    try {
      const idea = typeof window === "undefined" ? null : sessionStorage.getItem(IDEA_KEY);
      if (idea) sessionStorage.removeItem(IDEA_KEY);
      return idea ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = useAttachments();

  const send = async (value = text) => {
    if (busy) return;
    if (!value.trim() && !a.image && !a.file) return setError("Write something, paste a link or add an image.");
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("text", value.trim());
    if (a.image) form.set("image", a.image);
    if (a.file) form.set("file", a.file);
    try {
      const res = await fetch("/api/drafts", { method: "POST", body: form });
      const j = (await res.json()) as { draft?: { id: string }; error?: string };
      if (!res.ok || !j.draft) throw new Error(j.error ?? "Could not start the coin.");
      router.push(`/app/${j.draft.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the coin.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100svh-90px)] w-full max-w-[760px] flex-col justify-center px-5 py-14 text-forest md:py-20">
      <h1 className="text-[40px] leading-[1.04] font-medium tracking-[-0.035em] md:text-[60px]">Where does the coin start?</h1>
      <p className="mt-4 max-w-[36rem] text-[17px] leading-relaxed text-ash">
        Type a line, paste a post or a link, or drop in a meme or a document. {BRAND.name} turns it into a name, a ticker and art.
      </p>
      <div className="mt-10">
        <form
          className="rounded-[4px] border border-line bg-white p-2 transition-colors focus-within:border-ink"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="first" className="sr-only">
            Describe your coin
          </label>
          <textarea
            id="first"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="A line, a post or a link: what is the coin?"
            className="block w-full resize-none bg-transparent px-3 pt-3 pb-2 text-[17px] leading-relaxed outline-none placeholder:text-mist"
            data-testid="first-input"
          />
          <AttachList a={a} className="px-3 pb-2" />
          <div className="flex items-center justify-between gap-3 border-t border-line px-1 pt-2">
            <div className="flex flex-wrap items-center">
              <AttachRow a={a} />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-[3px] bg-ink px-5 py-3 text-[15px] font-semibold text-white transition-[transform,opacity] active:scale-[0.97] disabled:opacity-35"
              disabled={busy || (!text.trim() && !a.image && !a.file)}
              data-testid="first-send"
            >
              {busy ? "Reading it…" : "Draft my coin"}
            </button>
          </div>
        </form>
        {a.problem || error ? <p className="mt-3 text-[14px] text-down">{a.problem || error}</p> : null}
        {me && !me.configured.ai ? (
          <p className="mt-3 text-[14px] text-ash">AI drafting is off on this site for now. Balle still starts a draft from your words (a name and ticker you can change), and launching works as usual.</p>
        ) : null}
        <p className="mt-10 font-mono text-[12px] text-ash">Stuck? Borrow one of these</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => setText(s)} className="rounded-[3px] border border-line bg-white px-4 py-2.5 text-left text-[14px] transition-colors hover:border-ink">
                {s}
              </button>
            </li>
          ))}
        </ul>
        {me?.left ? (
          <p className="mt-6 font-mono text-[11px] text-ash">
            {me.left.messages} of {me.allowance.messages} free messages left today
          </p>
        ) : null}
      </div>
    </main>
  );
}
