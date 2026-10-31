import { after } from "next/server";
import { getStore } from "@/lib/auth/store";
import { fail, ok } from "@/lib/api";
import { coinView } from "@/lib/coinview";
import { allowPublic, tooMany } from "@/lib/guard";
import { coinPosts, maybePost, readMind } from "@/lib/minds";

export const dynamic = "force-dynamic";

/** One coin, read from chain, plus its mind's posts when it was launched with Balle. */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token;
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return fail("Not a token address.");
  const store = getStore();
  if (!(await allowPublic(store, request, "coin", 60, 900))) return tooMany();
  const view = await coinView(token).catch(() => undefined);
  if (view === undefined) return fail("Robinhood Chain could not be read right now. Try again in a moment.", 503);
  if (!view) return fail("Pons has no launch for this address.", 404);
  const [posts, mind] = store && view.launch ? await Promise.all([coinPosts(store, token, 60), readMind(store, token)]) : [[], null];
  // The mind may have something to say; it never delays this answer.
  if (store && view.launch) {
    const launch = view.launch;
    after(() => maybePost(store, launch).catch(() => null));
  }
  return ok({ view, posts, mind });
}
