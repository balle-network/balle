import { publicDraft, readDraft, saveDraft } from "@/lib/drafts";
import { fail, ok, requireWallet } from "@/lib/api";
import { readJson } from "@/lib/guard";
import { registerLaunch } from "@/lib/registry";
import { spend } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** After the wallet's launch transaction: the server checks it on chain and lists the coin. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  if (!(await spend(`launched:${auth.wallet}`, 1, 30, 3600))) return fail("Too many checks. Wait a minute.", 429);
  const body = await readJson<{ tx?: string }>(request, 512);
  const d = await readDraft(auth.store, (await ctx.params).id);
  if (!d || d.wallet !== auth.wallet) return fail("No such draft for this wallet.", 404);
  const r = await registerLaunch(auth.store, auth.wallet, d, String(body?.tx ?? ""));
  if ("error" in r) return fail(r.error, r.status);
  d.launched = { token: r.launch.token, curve: r.launch.curve, tx: r.launch.tx, at: Date.now() };
  await saveDraft(auth.store, d);
  return ok({ draft: publicDraft(d), launch: r.launch });
}
