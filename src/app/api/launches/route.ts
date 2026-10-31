import { getStore } from "@/lib/auth/store";
import { fail, ok } from "@/lib/api";
import { allowPublic, tooMany } from "@/lib/guard";
import { listPublicLaunches } from "@/lib/launches-api";

export const dynamic = "force-dynamic";

// A public read API: any origin may read it; nothing here takes credentials.
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
}

/** GET /api/launches?offset=0&limit=20 — coins launched through Balle, newest first, with live curve state. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "api-launches", 30, 600))) return tooMany();
  const q = new URL(request.url).searchParams;
  const offset = Number(q.get("offset") ?? 0);
  const limit = Number(q.get("limit") ?? 20);
  if (!Number.isFinite(offset) || !Number.isFinite(limit) || offset < 0 || limit < 1) return fail("offset must be 0 or more and limit 1 or more.");
  const page = await listPublicLaunches(offset, limit);
  if (!page) return fail("The launch registry is not configured on this site yet.", 503);
  return ok(page, { headers: { ...CORS, "cache-control": "public, max-age=15" } });
}
