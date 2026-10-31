"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretDown, Check, Copy } from "@phosphor-icons/react";
import { BRAND, PONS, explorerToken, shortAddress } from "@/config/brand";
import { MIND_KINDS } from "@/config/minds";
import { PAIR_TOKENS } from "@/config/pairs.generated";
import type { PublicDraft, Settings } from "@/lib/drafts";
import { openingShare, readLaunchContext, type LaunchContext } from "@/lib/launch";
import { rpc } from "@/lib/rpc";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCopy } from "@/components/CopyCa";
import { Mark } from "@/components/Mark";
import { useWallet } from "@/components/wallet/WalletProvider";
import { LaunchButton } from "@/components/app/LaunchButton";

type Props = {
  draft: PublicDraft;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
  art: (form: FormData) => Promise<boolean>;
  busy: boolean;
  onLaunched: (d: PublicDraft) => void;
};

const BUYS = ["0", "0.001", "0.005", "0.01", "0.05"];
const reader = <T,>(method: string, params: unknown[]) => rpc<T>(method, params);

const FIELD = "w-full min-w-0 rounded-[3px] border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-mist focus:border-ink";
const SMALL_DARK = "rounded-[3px] bg-ink px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40";
const SMALL_LIGHT = "rounded-[3px] bg-white px-3 py-1.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_#cfd2bf] disabled:opacity-40";

function Row({ title, value, children, id, open, setOpen }: { title: string; value: string; children: React.ReactNode; id: string; open: string | null; setOpen: (v: string | null) => void }) {
  const isOpen = open === id;
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : id)}
        className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-[14px]"
        data-testid={`row-${id}`}
      >
        <span className="shrink-0 text-ash">{title}</span>
        <span className="flex min-w-0 items-center gap-2.5 font-medium">
          <span className="truncate">{value}</span>
          <CaretDown size={13} className={`shrink-0 text-ash transition-transform duration-150 ease-out ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen ? <div className="pb-4">{children}</div> : null}
    </div>
  );
}

function Toggle({ on, onChange, label, disabled = false, testid }: { on: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; testid?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      data-testid={testid}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-ink" : "bg-[#dfe2d8]"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-[0_1px_2px_#082f2640] transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function EditForm({ draft, patch, close }: { draft: PublicDraft; patch: Props["patch"]; close: () => void }) {
  const [v, setV] = useState({ ...draft.coin });
  const [saving, setSaving] = useState(false);
  const field = (k: keyof typeof v, label: string, max: number, area = false) => (
    <label className="grid gap-1.5">
      <span className="flex justify-between font-mono text-[11px] text-ash">
        {label}
        {area ? (
          <span>
            {v[k].length}/{max}
          </span>
        ) : null}
      </span>
      {area ? (
        <textarea rows={4} maxLength={max} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`${FIELD} resize-y`} />
      ) : (
        <input
          maxLength={max}
          value={v[k]}
          onChange={(e) => setV({ ...v, [k]: k === "ticker" ? e.target.value.toUpperCase() : e.target.value })}
          className={`${FIELD} ${k === "ticker" ? "font-pixel text-[16px]" : ""}`}
          data-testid={`edit-${k}`}
        />
      )}
    </label>
  );
  return (
    <form
      className="mt-4 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const ok = await patch({ coin: v });
        setSaving(false);
        if (ok) close();
      }}
    >
      {field("name", "Name", 32)}
      {field("ticker", "Ticker", 10)}
      {field("tagline", "Tagline", 80)}
      {field("description", "Description", 240, true)}
      {field("post", "First post for X", 280, true)}
      <div className="flex gap-2">
        <button type="submit" className="rounded-[3px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40" disabled={saving} data-testid="edit-save">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="rounded-[3px] bg-white px-4 py-2.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_#cfd2bf]" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function Panel({ draft, patch, art, busy, onLaunched }: Props) {
  const { address, balance } = useWallet();
  const { me } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ctx, setCtx] = useState<LaunchContext | null>(null);
  const [ctxError, setCtxError] = useState(false);
  const [brief, setBrief] = useState("");
  const [exempt, setExempt] = useState("");
  const [buyText, setBuyText] = useState(draft.settings.buy);
  const upload = useRef<HTMLInputElement>(null);
  const s = draft.settings;
  const launched = draft.launched;
  const post = useCopy(draft.coin.post);
  const pairAddr = s.pair === "eth" ? "0x0000000000000000000000000000000000000000" : s.pair;

  useEffect(() => {
    let stop = false;
    readLaunchContext(reader, address, pairAddr)
      .then((c) => {
        if (stop) return;
        setCtx(c);
        setCtxError(false);
      })
      .catch(() => !stop && setCtxError(true));
    return () => {
      stop = true;
    };
  }, [address, pairAddr]);

  const set = (settings: Partial<Settings>) => patch({ settings });
  const pairLabel = s.pair === "eth" ? "ETH" : (PAIR_TOKENS.find((p) => p.address.toLowerCase() === s.pair.toLowerCase())?.symbol ?? "Token");
  const buyEth = Number(s.buy) || 0;
  const share = ctx && buyEth > 0 ? openingShare(BigInt(Math.round(buyEth * 1e6)) * 10n ** 12n, ctx.pair.phantomQuote, ctx.config.curveFeeBps) : 0;
  const creatorPct = ctx ? (Number(ctx.config.curveFeeBps) / 100) * 0.7 : 0.7;
  const chosen = draft.art.chosen ? `/api/art/${draft.art.chosen}` : null;
  const mind = MIND_KINDS.find((m) => m.id === s.mind) ?? MIND_KINDS[0];
  const lockedNote = launched ? <p className="text-[12px] text-ash">Fixed at launch; this lives on chain now.</p> : null;

  const artButtonsOff = busy || !draft.coin.name || (me ? !me.configured.ai : false);
  const generate = () => {
    const form = new FormData();
    form.set("action", "generate");
    if (brief.trim()) form.set("brief", brief.trim());
    art(form);
  };

  return (
    <div className="rounded-[4px] border border-ink bg-white max-lg:rounded-none max-lg:border-0" aria-label="Coin" role="region">
      <section className="p-4" aria-label="Coin details">
        <div className="flex items-center gap-3.5">
          {chosen ? (
            <img src={chosen} alt={`${draft.coin.name || "Coin"} art`} width={64} height={64} className="size-16 shrink-0 rounded-[3px] border border-line object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-[3px] border border-dashed border-rule bg-paper text-mist">
              <Mark size={28} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[18px] font-semibold tracking-[-0.01em] ${draft.coin.name ? "" : "text-mist"}`} data-testid="coin-name">
              {draft.coin.name || "Name"}
            </p>
            <p className={`truncate font-pixel text-[16px] ${draft.coin.ticker ? "" : "text-mist"}`} data-testid="coin-ticker">
              ${draft.coin.ticker || "TICKER"}
              {draft.coin.ticker ? <span className="text-ash"> / {pairLabel}</span> : null}
            </p>
          </div>
          {!launched ? (
            <button type="button" className={`shrink-0 ${SMALL_LIGHT}`} onClick={() => setEditing((e) => !e)} data-testid="edit">
              {editing ? "Close" : "Edit"}
            </button>
          ) : null}
        </div>
        {draft.coin.tagline && !editing ? <p className="mt-3 text-[14px] font-medium">{draft.coin.tagline}</p> : null}
        {!editing ? (
          <p className={`mt-2 line-clamp-3 text-[13px] leading-relaxed ${draft.coin.description ? "text-ash" : "text-mist"}`}>
            {draft.coin.description || "Pick a direction in the chat and the story lands here."}
          </p>
        ) : null}

        {!launched ? (
          <>
            {editing ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={SMALL_LIGHT} disabled={busy} onClick={() => upload.current?.click()}>
                  Upload art
                </button>
                <button type="button" className={SMALL_LIGHT} disabled={artButtonsOff} onClick={generate}>
                  New art options
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[3px] bg-paper p-2.5">
                <span className="mr-auto text-[13px] font-semibold">{draft.art.options.length ? "Pick the art" : "No art yet"}</span>
                <button type="button" className={SMALL_DARK} disabled={busy} onClick={() => upload.current?.click()}>
                  Upload
                </button>
                <button
                  type="button"
                  className={SMALL_LIGHT}
                  disabled={artButtonsOff}
                  title={me && !me.configured.ai ? "AI art is off on this site for now: upload your own image instead" : undefined}
                  onClick={generate}
                  data-testid="art-generate"
                >
                  Draw options
                </button>
                {draft.coin.name ? (
                  <input value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={300} placeholder="Optional: what the art should show" className={`${FIELD} mt-1 basis-full py-2 text-[13px]`} />
                ) : null}
                {draft.art.options.length ? (
                  <div className="flex basis-full flex-wrap gap-2 pt-1" role="radiogroup" aria-label="Art options">
                    {draft.art.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={draft.art.chosen === o.id}
                        onClick={() => patch({ chosenArt: o.id })}
                        className={`rounded-[4px] border-2 p-0.5 ${draft.art.chosen === o.id ? "border-ink" : "border-transparent hover:border-line"}`}
                      >
                        <img src={`/api/art/${o.id}`} alt={o.source === "ai" ? "AI art option" : "Uploaded art"} width={52} height={52} className="block size-[52px] rounded-[2px] object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {me && !me.configured.uploads && draft.art.options.length ? (
                  <p className="basis-full text-[12px] text-ash">Art uploads to IPFS are not configured on this site yet, so a launch from here goes out without art for now.</p>
                ) : null}
              </div>
            )}
            <input
              ref={upload}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.set("action", "upload");
                form.set("image", f);
                art(form);
                e.target.value = "";
              }}
              data-testid="art-upload"
            />
          </>
        ) : null}
        {editing && !launched ? <EditForm draft={draft} patch={patch} close={() => setEditing(false)} /> : null}

        {draft.coin.post && !editing ? (
          <div className="mt-3 rounded-[3px] border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] text-ash">First post for X</p>
              <div className="flex items-center gap-1">
                <button type="button" className="grid size-8 place-items-center rounded-[3px] text-ash hover:bg-ink/5 hover:text-ink" aria-label="Copy post" onClick={post.copy}>
                  {post.copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <a
                  className={SMALL_DARK}
                  target="_blank"
                  rel="noreferrer"
                  href={`https://x.com/intent/post?text=${encodeURIComponent(`${draft.coin.post}${launched ? ` ${BRAND.url}/coin/${launched.token}` : ""}`)}`}
                >
                  Post on X
                </a>
              </div>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-wrap" data-testid="first-post">
              {draft.coin.post}
            </p>
            {!launched ? <p className="mt-2 font-mono text-[10px] text-ash">Post it once the coin is live so the link works.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="border-t border-line" aria-label="Launch">
        <div className="px-4">
          <Row id="pair" title="Trades against" value={pairLabel} open={open} setOpen={setOpen}>
            {lockedNote ?? (
              <>
                <select
                  value={s.pair}
                  onChange={(e) => {
                    const pair = e.target.value;
                    set(pair === "eth" ? { pair } : { pair, buy: "0" });
                    if (pair !== "eth") setBuyText("0");
                  }}
                  className={FIELD}
                  aria-label="Pair"
                  data-testid="pair-select"
                >
                  <option value="eth">ETH</option>
                  {PAIR_TOKENS.map((p) => (
                    <option key={p.address} value={p.address}>
                      {p.name} ({p.symbol})
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[12px] leading-relaxed text-ash">
                  {s.pair === "eth" ? "Buyers pay in ETH." : `Buyers pay in ${pairLabel}. Pons checks it is still accepted before you sign.`}
                </p>
              </>
            )}
          </Row>
          <Row id="buy" title="Buy at launch" value={buyEth > 0 ? `${s.buy} ETH` : "None"} open={open} setOpen={setOpen}>
            {lockedNote ??
              (s.pair !== "eth" ? (
                <p className="text-[12px] text-ash">An opening buy is offered for coins that trade against ETH.</p>
              ) : (
                <>
                  <p className="mb-2 flex justify-between text-[12px] text-ash">
                    <span>ETH in</span>
                    <span>Share of supply</span>
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {BUYS.map((b) => {
                      const pct = ctx && Number(b) > 0 ? openingShare(BigInt(Math.round(Number(b) * 1e6)) * 10n ** 12n, ctx.pair.phantomQuote, ctx.config.curveFeeBps) * 100 : 0;
                      const on = s.buy === b;
                      return (
                        <button
                          key={b}
                          type="button"
                          data-testid={`buy-${b}`}
                          onClick={() => {
                            setBuyText(b);
                            set({ buy: b });
                          }}
                          className={`grid min-w-0 gap-0.5 rounded-[3px] px-1 py-2.5 text-center font-mono transition-colors ${on ? "bg-ink text-white" : "bg-paper hover:bg-[#ebe6d9]"}`}
                        >
                          <span className="truncate text-[13px]">{b === "0" ? "None" : b}</span>
                          <span className={`truncate text-[10px] ${on ? "text-white/70" : "text-ash"}`}>{b === "0" ? "0%" : ctx ? `${pct < 0.1 ? pct.toFixed(3) : pct.toFixed(2)}%` : "…"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-3 grid gap-1.5">
                    <span className="font-mono text-[11px] text-ash">Or type an amount (up to 5 ETH)</span>
                    <input
                      inputMode="decimal"
                      value={buyText}
                      onChange={(e) => setBuyText(e.target.value.replace(/[^\d.]/g, ""))}
                      onBlur={() => buyText !== s.buy && set({ buy: buyText || "0" })}
                      className={`${FIELD} font-mono tabular-nums`}
                      data-testid="buy-input"
                    />
                  </label>
                  {buyEth > 0 ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-ash">
                      About {(share * 100).toFixed(2)}% of the supply, bought inside the launch transaction through Pons&apos; launch-and-buy contract. The exact amount is simulated before you sign.
                    </p>
                  ) : null}
                </>
              ))}
          </Row>
          <Row id="fees" title="Fees" value={`${creatorPct.toFixed(1)}% of trades to you${s.creatorTaxBps ? ` + ${s.creatorTaxBps / 100}%` : ""}`} open={open} setOpen={setOpen}>
            {lockedNote ?? (
              <div className="grid gap-4 text-[14px]">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ash">Fees to holders</p>
                    <Toggle on={false} label="Fees to holders" disabled />
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ash">Not offered yet: Pons pays creator fees to one wallet, and {BRAND.name} runs no contract that could split them.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ash">Mind treasury</p>
                    <Toggle on={false} label="Mind treasury" disabled />
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ash">Not offered yet: a mind only talks and holds nothing. Holders can still vote on what you do with the fees.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ash">Buyback</p>
                    <Toggle on={s.buyback} onChange={(v) => set({ buyback: v })} label="Buyback" testid="toggle-buyback" />
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ash">{s.buyback ? "Part of the creator fees buys the coin back, run by Pons." : "Every creator fee goes straight to the fee wallet."}</p>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-ash">Fee wallet</span>
                  <input value={s.feeWallet} onChange={(e) => set({ feeWallet: e.target.value.trim() })} placeholder={address ?? "0x…"} className={`${FIELD} font-mono text-[12px]`} />
                  <span className="text-[12px] leading-relaxed text-ash">Where creator fees and any tax land. Blank means your own wallet.</span>
                </label>
                <label className="grid gap-1.5">
                  <span className="flex justify-between text-ash">
                    Creator tax <span className="font-mono text-[12px] text-ink">{(s.creatorTaxBps / 100).toFixed(2)}%</span>
                  </span>
                  <input type="range" min={0} max={ctx?.maxCreatorTaxBps ?? 1000} step={25} value={s.creatorTaxBps} onChange={(e) => set({ creatorTaxBps: Number(e.target.value) })} aria-label="Creator tax" className="accent-[#073e32]" />
                  <span className="text-[12px] leading-relaxed text-ash">
                    Every trade pays {ctx ? Number(ctx.config.curveFeeBps) / 100 : 1}% to the Pons curve, plus this share for you. Max {ctx ? ctx.maxCreatorTaxBps / 100 : 10}%.
                  </span>
                </label>
                <div className="grid gap-1.5">
                  <span className="text-ash">Wallets that skip the snipe tax</span>
                  <span className="text-[12px] leading-relaxed text-ash">
                    Buys in the first {ctx?.snipeTaxSeconds ?? 3} seconds pay up to {ctx ? ctx.snipeTaxStartBps / 100 : 99}%, sliding to zero. Your wallet always skips it. The list is public on chain.
                  </span>
                  <div className="flex gap-2">
                    <input value={exempt} onChange={(e) => setExempt(e.target.value.trim())} placeholder="0x…" className={`${FIELD} font-mono text-[12px]`} />
                    <button
                      type="button"
                      className={SMALL_LIGHT}
                      onClick={() => {
                        if (!/^0x[0-9a-fA-F]{40}$/.test(exempt)) return;
                        set({ exemptions: [...s.exemptions, exempt] });
                        setExempt("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {s.exemptions.map((x) => (
                    <span key={x} className="flex items-center justify-between font-mono text-[11px]">
                      {shortAddress(x, 8, 6)}
                      <button type="button" className="text-down hover:underline" onClick={() => set({ exemptions: s.exemptions.filter((y) => y !== x) })}>
                        remove
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Row>
          <Row id="mind" title="Mind" value={mind.label} open={open} setOpen={setOpen}>
            {lockedNote ?? (
              <div className="grid gap-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {MIND_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      data-testid={`mind-${k.id}`}
                      onClick={() => set({ mind: k.id })}
                      className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${s.mind === k.id ? "bg-ink text-white" : "bg-paper hover:bg-[#ebe6d9]"}`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] leading-relaxed text-ash">
                  {s.mind === "off"
                    ? "No mind: the coin page shows chain data only."
                    : s.mind === "custom"
                      ? "Describe the character in a sentence."
                      : `${mind.persona} It speaks up on the coin's page when the chain brings news, and answers holders. It only writes; it holds and sends nothing.`}
                </p>
                {s.mind === "custom" ? <input defaultValue={s.mindCustom} onBlur={(e) => set({ mindCustom: e.target.value })} maxLength={200} className={FIELD} placeholder="A retired lighthouse keeper who counts every wallet" /> : null}
              </div>
            )}
          </Row>
          <Row id="links" title="Links" value={[s.links.x && "X", s.links.telegram && "Telegram", s.links.website && "Site"].filter(Boolean).join(", ") || "None"} open={open} setOpen={setOpen}>
            {lockedNote ?? (
              <div className="grid gap-2">
                {(
                  [
                    ["x", "Profile on X (https://x.com/…)"],
                    ["telegram", "Telegram group (https://t.me/…)"],
                    ["website", "Site address (https://…)"],
                  ] as const
                ).map(([k, ph]) => (
                  <input key={k} defaultValue={s.links[k]} onBlur={(e) => e.target.value.trim() !== s.links[k] && set({ links: { ...s.links, [k]: e.target.value.trim() } })} placeholder={ph} className={`${FIELD} text-[13px]`} aria-label={ph} />
                ))}
                <p className="text-[12px] text-ash">Written into the coin on chain; they stay fixed after launch.</p>
              </div>
            )}
          </Row>
        </div>

        <div className="sticky bottom-0 rounded-b-[4px] border-t border-line bg-white p-4 max-lg:pb-[max(16px,env(safe-area-inset-bottom))]">
          {launched ? (
            <div className="grid gap-3" data-testid="launched">
              <p className="text-[17px] font-semibold">Live on Pons</p>
              <p className="font-mono text-[11px] break-all text-ash" data-testid="launched-token">
                {launched.token}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/coin/${launched.token}`} className={SMALL_DARK}>
                  Coin page
                </Link>
                <a href={PONS.page(launched.token)} target="_blank" rel="noreferrer" className={SMALL_LIGHT}>
                  Open on Pons ↗
                </a>
                <a href={explorerToken(launched.token)} target="_blank" rel="noreferrer" className={SMALL_LIGHT}>
                  Blockscout ↗
                </a>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-1.5 flex justify-between gap-3 text-[13px]">
                <span className="text-ash">Wallet</span>
                <span className="text-right tabular-nums">
                  {address ? (
                    <>
                      <span className="font-mono text-[12px]">{shortAddress(address, 6, 4).toLowerCase()}</span>, {balance ?? "…"} ETH
                    </>
                  ) : (
                    "Not connected"
                  )}
                </span>
              </p>
              <p className="flex justify-between gap-3 text-[13px]">
                <span className="text-ash">Cost</span>
                <span className="text-right">
                  {ctx ? `${Number(ctx.launchFee) / 1e18} ETH Pons fee${buyEth > 0 ? ` + ${s.buy} ETH buy` : ""}` : ctxError ? "Pons fee unreadable" : "reading Pons…"}
                  <span className="block text-[12px] text-ash">plus gas · {BRAND.name} takes 0%</span>
                </span>
              </p>
              <LaunchButton draft={draft} ctx={ctx} onLaunched={onLaunched} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
