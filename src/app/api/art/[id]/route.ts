import { getStore } from "@/lib/auth/store";
import { readArt } from "@/lib/drafts";
import { allowPublic, tooMany } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Draft art, by its unguessable id. Always WebP the site encoded itself. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = getStore();
  if (!store) return new Response("Not configured", { status: 503 });
  if (!(await allowPublic(store, request, "art-read", 240, 4000))) return tooMany();
  const bytes = await readArt(store, (await ctx.params).id);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400, immutable", "x-content-type-options": "nosniff" },
  });
}
