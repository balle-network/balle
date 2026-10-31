import { publicDraft, readArt, readDraft, saveDraft, withDraftLock } from "@/lib/drafts";
import { fail, ok, requireWallet } from "@/lib/api";
import { pinWebp } from "@/lib/pinata";
import { take } from "@/lib/quota";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Pins the chosen art to IPFS so its link can go into the launch. Done once per art. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  const id = (await ctx.params).id;
  const result = await withDraftLock(auth.store, id, async () => {
    const d = await readDraft(auth.store, id);
    if (!d || d.wallet !== auth.wallet) return { error: "No such draft for this wallet.", status: 404 };
    if (!d.art.chosen) return { error: "Choose art first.", status: 400 };
    if (d.art.pinned?.artId === d.art.chosen) return { draft: publicDraft(d) };
    const bytes = await readArt(auth.store, d.art.chosen);
    if (!bytes) return { error: "That art expired. Make or upload it again.", status: 410 };
    if (!(await take(auth.store, "uploads", auth.wallet))) return { error: "That is today's upload limit for this wallet.", status: 429 };
    const pinned = await pinWebp(bytes, d.art.chosen);
    if ("error" in pinned) return { error: pinned.error, status: 503 };
    d.art.pinned = { artId: d.art.chosen, cid: pinned.cid, url: pinned.url };
    await saveDraft(auth.store, d);
    return { draft: publicDraft(d) };
  });
  if (result === "busy") return fail("This draft is busy with another change. Try again.", 409);
  if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
  return ok(result);
}
