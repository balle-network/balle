import { getStore } from "@/lib/auth/store";
import { ok } from "@/lib/api";
import { board } from "@/lib/board";
import { allowPublic, tooMany } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "board", 60, 900))) return tooMany();
  const rows = await board();
  return ok({ configured: rows !== null, rows: rows ?? [] });
}
