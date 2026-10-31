import { fail, ok, requireWallet } from "@/lib/api";
import { readJson } from "@/lib/guard";
import { spend } from "@/lib/ratelimit";
import { castVote } from "@/lib/votes";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  if (!(await spend(`vote:${auth.wallet}`, 1, 30, 3600))) return fail("Too many votes from this wallet. Wait a little.", 429);
  const body = await readJson<{ choice?: string }>(request, 256);
  const r = await castVote(auth.store, (await ctx.params).id, auth.wallet, String(body?.choice ?? ""));
  if ("error" in r) return fail(r.error, r.status);
  return ok(r);
}
