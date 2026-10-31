import { getStore } from "@/lib/auth/store";
import { ok } from "@/lib/api";
import { race } from "@/lib/board";
import { allowPublic, tooMany } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "race", 60, 900))) return tooMany();
  const r = await race();
  return ok({ configured: r !== null, race: r });
}
