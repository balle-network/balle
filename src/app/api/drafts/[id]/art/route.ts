import { newId, publicDraft, readDraft, saveArt, saveDraft, withDraftLock } from "@/lib/drafts";
import { fail, ok, readUpload, requireWallet } from "@/lib/api";
import { fromDataUrl, toCoinArt } from "@/lib/images";
import { imageCall } from "@/lib/llm/openrouter";
import { cooldown, take } from "@/lib/quota";
import { asciiClean, fieldProblems } from "@/lib/safety";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const OPTIONS_PER_PRESS = 2;

/**
 * Art for a draft: `action=upload` with an image (re-encoded to 512 px WebP),
 * or `action=generate`, which asks the image model for two options. Each
 * option is one paid call: two are taken from the wallet's daily art
 * allowance first and each call is charged to the site's hourly ceiling.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  const id = (await ctx.params).id;
  const upload = await readUpload(request);
  if ("response" in upload) return upload.response;
  const action = upload.fields.action;
  const result = await withDraftLock(auth.store, id, async () => {
    const d = await readDraft(auth.store, id);
    if (!d || d.wallet !== auth.wallet) return { error: "No such draft for this wallet.", status: 404 };
    if (d.launched) return { error: "This coin is already launched.", status: 409 };

    if (action === "upload") {
      if (!upload.image) return { error: "Add an image to upload.", status: 400 };
      if (!(await take(auth.store, "uploads", auth.wallet))) return { error: "That is today's upload limit for this wallet.", status: 429 };
      let art: Buffer;
      try {
        art = await toCoinArt(upload.image);
      } catch {
        return { error: "That image could not be read.", status: 400 };
      }
      const artId = newId(12);
      await saveArt(auth.store, artId, art);
      d.art.options.push({ id: artId, source: "upload", at: Date.now() });
      d.art.chosen = artId;
      await saveDraft(auth.store, d);
      return { draft: publicDraft(d) };
    }

    if (action !== "generate") return { error: "Unknown art action.", status: 400 };
    if (!d.coin.name) return { error: "Pick a name first, so the art has something to show.", status: 400 };
    const brief = asciiClean(upload.fields.brief ?? "", 300);
    if (brief && fieldProblems("description", brief.slice(0, 240)).length) return { error: "That art description uses words this site does not pass on.", status: 400 };
    if (!(await cooldown(auth.store, `art:${d.id}`, 20))) return { error: "Art was just made for this coin. Give it a few seconds.", status: 429 };
    if (!(await take(auth.store, "art", auth.wallet, OPTIONS_PER_PRESS))) return { error: "That is today's art allowance for this wallet.", status: 429 };
    const saved = d.memory.facts.find((f) => f.startsWith("Art brief: "))?.slice(11) ?? "";
    const prompt = [
      `Square coin logo for "${d.coin.name}" ($${d.coin.ticker}).`,
      d.coin.tagline || d.memory.reading,
      brief || saved || "One bold central subject, flat colours, thick clean outlines, plain background, readable at small size.",
      "No text, no letters, no logos of real companies, no watermark.",
    ]
      .filter(Boolean)
      .join(" ");
    const made: string[] = [];
    let reason = "";
    for (let i = 0; i < OPTIONS_PER_PRESS; i++) {
      const r = await imageCall(auth.store, prompt);
      if (!r.ok) {
        reason = r.reason;
        break;
      }
      for (const url of r.value) {
        const raw = fromDataUrl(url);
        if (!raw) continue;
        try {
          const art = await toCoinArt(raw);
          const artId = newId(12);
          await saveArt(auth.store, artId, art);
          d.art.options.push({ id: artId, source: "ai", at: Date.now() });
          made.push(artId);
        } catch {
          // Skip an image that does not decode.
        }
        break;
      }
    }
    if (made.length) d.art.chosen ??= made[0];
    await saveDraft(auth.store, d);
    if (!made.length) return { error: reason || "No art came back this time.", status: 502 };
    return { draft: publicDraft(d) };
  });
  if (result === "busy") return fail("This draft is busy with another change. Try again.", 409);
  if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
  return ok(result);
}
