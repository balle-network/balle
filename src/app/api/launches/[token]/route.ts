import { isAddress } from "@/config/brand";
import { getStore } from "@/lib/auth/store";
import { fail, ok } from "@/lib/api";
import { allowPublic, tooMany } from "@/lib/guard";
import { getPublicLaunch } from "@/lib/launches-api";

export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
}

/** GET /api/launches/<token> — one coin launched through Balle, with its curve state read live from chain. */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await allowPublic(getStore(), request, "api-launch", 60, 900))) return tooMany();
  const token = (await ctx.params).token;
  if (!isAddress(token)) return fail("Not a token address (0x followed by 40 hex characters).");
  const launch = await getPublicLaunch(token).catch(() => undefined);
  if (launch === undefined) return fail("The launch registry is not configured on this site yet.", 503);
  if (!launch) return fail("This token was not launched through Balle.", 404);
  return ok(launch, { headers: { ...CORS, "cache-control": "public, max-age=15" } });
}
