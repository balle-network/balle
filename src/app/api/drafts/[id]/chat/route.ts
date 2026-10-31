import { publicDraft, readDraft, saveDraft, withDraftLock } from "@/lib/drafts";
import { fail, ok, readUpload, requireWallet } from "@/lib/api";
import { runTurn } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Ask for changes, pick a direction, or add material to an existing draft. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  const id = (await ctx.params).id;
  const upload = await readUpload(request);
  if ("response" in upload) return upload.response;
  const result = await withDraftLock(auth.store, id, async () => {
    const d = await readDraft(auth.store, id);
    if (!d || d.wallet !== auth.wallet) return { error: "No such draft for this wallet.", status: 404 };
    if (d.launched) return { error: "This coin is already launched.", status: 409 };
    const turn = await runTurn(auth.store, d, auth.wallet, upload);
    if ("error" in turn) return turn;
    await saveDraft(auth.store, d);
    return { draft: publicDraft(d) };
  });
  if (result === "busy") return fail("The last message is still being answered.", 409);
  if ("error" in result) return fail(result.error ?? "That message could not be answered.", result.status);
  return ok(result);
}
