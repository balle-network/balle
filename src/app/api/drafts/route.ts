import { blankDraft, indexDraft, listDrafts, publicDraft, saveDraft } from "@/lib/drafts";
import { fail, ok, readUpload, requireWallet } from "@/lib/api";
import { runTurn } from "@/lib/chat";
import { allowNetwork, tooMany } from "@/lib/guard";
import { take } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The signed-in wallet's drafts and launches, newest first. */
export async function GET() {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  const drafts = await listDrafts(auth.store, auth.wallet);
  return ok({
    drafts: drafts.map((d) => ({ id: d.id, updatedAt: d.updatedAt, name: d.coin.name, ticker: d.coin.ticker, line: d.coin.tagline || d.coin.description || (d.messages.find((m) => m.role === "you")?.text ?? "").slice(0, 140), messages: d.messages.length, art: d.art.chosen, launched: d.launched })),
  });
}

/** Starts a coin from a first message (text, link, image or document). */
export async function POST(request: Request) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  if (!(await allowNetwork(request, "draft-new", 40, 86400))) return tooMany();
  const upload = await readUpload(request);
  if ("response" in upload) return upload.response;
  if (!upload.text.trim() && !upload.image && !upload.file) return fail("Write something, paste a link or add an image.");
  if (!(await take(auth.store, "drafts", auth.wallet))) return fail("That is today's limit of new coins for this wallet. Continue one in My coins.", 429);
  const d = blankDraft(auth.wallet);
  const turn = await runTurn(auth.store, d, auth.wallet, upload);
  if ("error" in turn) return fail(turn.error, turn.status);
  await saveDraft(auth.store, d);
  await indexDraft(auth.store, auth.wallet, d.id);
  return ok({ draft: publicDraft(d) });
}
