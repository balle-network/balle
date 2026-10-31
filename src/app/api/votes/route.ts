import { getStore } from "@/lib/auth/store";
import { fail, ok, requireWallet } from "@/lib/api";
import { allowPublic, readJson, tooMany } from "@/lib/guard";
import { spend } from "@/lib/ratelimit";
import { readLaunch } from "@/lib/registry";
import { listPolls, openPoll } from "@/lib/votes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "votes", 60, 900))) return tooMany();
  if (!store) return ok({ configured: false, polls: [] });
  return ok({ configured: true, polls: await listPolls(store) });
}

/** The wallet that launched a coin opens a vote for its holders. */
export async function POST(request: Request) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  if (!(await spend(`poll-open:${auth.wallet}`, 1, 3, 86400))) return fail("A wallet can open three votes a day.", 429);
  const body = await readJson<{ token?: string; question?: string }>(request, 1024);
  const launch = await readLaunch(auth.store, String(body?.token ?? ""));
  if (!launch) return fail("Only coins launched with Balle can hold a vote.", 404);
  const r = await openPoll(auth.store, launch, auth.wallet, String(body?.question ?? ""));
  if ("error" in r) return fail(r.error, r.status);
  return ok(r);
}
