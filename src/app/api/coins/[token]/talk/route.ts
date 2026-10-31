import { fail, ok, requireWallet } from "@/lib/api";
import { readJson } from "@/lib/guard";
import { balanceNow, talk } from "@/lib/minds";
import { cooldown, take } from "@/lib/quota";
import { readLaunch } from "@/lib/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A signed-in wallet that holds the coin talks to its mind. Paid: holder check, cooldown, daily allowance, hourly ceilings. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const auth = await requireWallet();
  if ("response" in auth) return auth.response;
  const token = (await ctx.params).token;
  const launch = await readLaunch(auth.store, token);
  if (!launch) return fail("Only coins launched with Balle have a mind.", 404);
  const body = await readJson<{ text?: string }>(request, 2048);
  // Holders only, checked before anything is charged.
  const held = await balanceNow(launch.token, auth.wallet).catch(() => null);
  if (held === null) return fail("Your balance could not be read from chain. Try again.", 502);
  if (held === 0n) return fail(`Only wallets holding $${launch.symbol} can talk to its mind.`, 403);
  if (!(await cooldown(auth.store, `talk:${auth.wallet}`, 15))) return fail("Give the mind a few seconds between messages.", 429);
  if (!(await take(auth.store, "talk", auth.wallet))) return fail("That is today's limit of messages to minds for this wallet.", 429);
  const r = await talk(auth.store, launch, auth.wallet, String(body?.text ?? ""));
  if ("error" in r) return fail(r.error, r.status);
  return ok(r);
}
