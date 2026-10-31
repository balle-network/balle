import { getStore } from "@/lib/auth/store";
import { ok } from "@/lib/api";
import { allowPublic, tooMany } from "@/lib/guard";
import { llmConfigured } from "@/lib/llm/openrouter";
import { feed, roster } from "@/lib/minds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = getStore();
  if (!(await allowPublic(store, request, "minds", 60, 900))) return tooMany();
  if (!store) return ok({ configured: false, ai: llmConfigured(), roster: [], posts: [] });
  const [r, posts] = await Promise.all([roster(store), feed(store, 120)]);
  return ok({ configured: true, ai: llmConfigured(), roster: r, posts });
}
