import { isAddress } from "viem";
import { MIND_KINDS } from "@/config/minds";
import { publicDraft, readDraft, saveDraft, withDraftLock, type Draft } from "@/lib/drafts";
import { fail, ok, requireWallet } from "@/lib/api";
import { readJson } from "@/lib/guard";
import { checkField } from "@/lib/llm/draft";
import { asciiClean, fieldProblems } from "@/lib/safety";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function own(id: string) {
  const auth = await requireWallet();
  if ("response" in auth) return auth;
  const d = await readDraft(auth.store, id);
  if (!d || d.wallet !== auth.wallet) return { response: fail("No such draft for this wallet.", 404) };
  return { ...auth, d };
}

export async function GET(_req: Request, ctx: Ctx) {
  const r = await own((await ctx.params).id);
  if ("response" in r) return r.response;
  return ok({ draft: publicDraft(r.d) });
}

type Patch = {
  coin?: Partial<Record<"name" | "ticker" | "tagline" | "description" | "post", string>>;
  settings?: Partial<Draft["settings"]>;
  chosenArt?: string;
};

const linkOk = (v: string, hosts: RegExp) => {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && hosts.test(u.hostname) && v.length <= 256;
  } catch {
    return false;
  }
};

/** Edits by hand: coin fields (checked like model output, a little looser on the ticker), launch settings, chosen art. */
export async function PATCH(request: Request, ctx: Ctx) {
  const r = await own((await ctx.params).id);
  if ("response" in r) return r.response;
  const body = await readJson<Patch>(request, 8192);
  if (!body) return fail("Invalid request body.");
  const result = await withDraftLock(r.store, r.d.id, async () => {
    const d = (await readDraft(r.store, r.d.id)) ?? r.d;
    if (d.launched) return { error: "This coin is already launched; its on-chain fields cannot change." };
    for (const [k, v] of Object.entries(body.coin ?? {})) {
      if (!["name", "ticker", "tagline", "description", "post"].includes(k) || typeof v !== "string") continue;
      const key = k as keyof Draft["coin"];
      if (!v.trim()) {
        d.coin[key] = "";
        continue;
      }
      const c = checkField(key, v, true);
      if (!c.ok) return { error: `${key}: ${c.problems[0]}` };
      d.coin[key] = c.value;
    }
    const s = body.settings;
    if (s) {
      if (s.pair !== undefined) {
        if (s.pair !== "eth" && !isAddress(s.pair)) return { error: "Unknown pair." };
        d.settings.pair = s.pair;
      }
      if (s.buy !== undefined) {
        if (!/^\d{0,3}(\.\d{0,6})?$/.test(s.buy) || Number(s.buy) > 5) return { error: "Opening buy must be between 0 and 5 ETH." };
        d.settings.buy = s.buy || "0";
      }
      if (s.creatorTaxBps !== undefined) {
        if (!Number.isInteger(s.creatorTaxBps) || s.creatorTaxBps < 0 || s.creatorTaxBps > 1000) return { error: "Creator tax must be between 0% and 10%." };
        d.settings.creatorTaxBps = s.creatorTaxBps;
      }
      if (s.buyback !== undefined) d.settings.buyback = Boolean(s.buyback);
      if (s.feeWallet !== undefined) {
        if (s.feeWallet && !isAddress(s.feeWallet)) return { error: "The fee wallet is not a valid address." };
        d.settings.feeWallet = s.feeWallet;
      }
      if (s.exemptions !== undefined) {
        if (!Array.isArray(s.exemptions) || s.exemptions.length > 31 || !s.exemptions.every((a) => typeof a === "string" && isAddress(a))) return { error: "Snipe-tax wallets must be valid addresses (31 at most)." };
        d.settings.exemptions = [...new Set(s.exemptions.map((a) => a.toLowerCase()))];
      }
      if (s.mind !== undefined) {
        if (!MIND_KINDS.some((m) => m.id === s.mind)) return { error: "Unknown mind." };
        d.settings.mind = s.mind;
      }
      if (s.mindCustom !== undefined) {
        const v = asciiClean(s.mindCustom, 200);
        if (v && fieldProblems("description", v).length) return { error: "That character description uses words this site does not pass on." };
        d.settings.mindCustom = v;
      }
      if (s.links) {
        const l = { ...d.settings.links, ...s.links };
        if (!linkOk(l.x, /^(x|twitter)\.com$/)) return { error: "X link must be an https://x.com/ address." };
        if (!linkOk(l.telegram, /^t\.me$/)) return { error: "Telegram link must be an https://t.me/ address." };
        if (!linkOk(l.website, /^[a-z0-9.-]+\.[a-z]{2,}$/i)) return { error: "Website must be an https:// address." };
        d.settings.links = { x: l.x, telegram: l.telegram, website: l.website };
      }
    }
    if (body.chosenArt !== undefined) {
      if (!d.art.options.some((o) => o.id === body.chosenArt)) return { error: "That art is not in this draft." };
      d.art.chosen = body.chosenArt;
    }
    await saveDraft(r.store, d);
    return { draft: publicDraft(d) };
  });
  if (result === "busy") return fail("This draft is busy with another change. Try again.", 409);
  if ("error" in result) return fail(String(result.error));
  return ok(result);
}

/** Removes an unlaunched draft and its art. A launched coin stays listed. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await own((await ctx.params).id);
  if ("response" in r) return r.response;
  const result = await withDraftLock(r.store, r.d.id, async () => {
    const d = (await readDraft(r.store, r.d.id)) ?? r.d;
    if (d.launched) return "launched" as const;
    await Promise.all([r.store.del(`draft:${d.id}`), ...d.art.options.map((o) => r.store.del(`art:${o.id}`))]);
    return "done" as const;
  });
  if (result === "busy") return fail("This draft is being changed right now. Try again in a moment.", 409);
  if (result === "launched") return fail("A launched coin stays in your list.", 409);
  return ok({ deleted: true });
}
