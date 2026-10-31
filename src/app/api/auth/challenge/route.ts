import { createChallenge } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";
import { allowPerIp, readJson, tooMany } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Hands out a stateless sign-in message (nothing is stored). */
export async function POST(request: Request) {
  if (!(await allowPerIp(request, "auth-challenge", 120, 600))) return tooMany();
  const body = await readJson<{ address?: string }>(request, 512);
  const challenge = await createChallenge(request.headers.get("host"), String(body?.address ?? ""));
  if (!challenge) return fail("Connect a wallet first.");
  return ok(challenge);
}
