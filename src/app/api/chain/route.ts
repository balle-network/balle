import { getStore } from "@/lib/auth/store";
import { ok } from "@/lib/api";
import { chainFacts } from "@/lib/chain/facts";
import { allowPublic, tooMany } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Latest block, gas price, ETH/USD and the live Pons launch fee. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "chain", 60, 1200))) return tooMany();
  return ok(await chainFacts());
}
