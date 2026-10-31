import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { openSession, sessionCookie, verifyChallenge } from "@/lib/auth/session";
import { fail, notConfigured } from "@/lib/api";
import { allowPerIp, readJson, tooMany } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Drafts need the store; without it there is nothing to sign in to.
  if (!getStore()) return notConfigured();
  if (!(await allowPerIp(request, "auth-verify", 120, 600))) return tooMany();
  const body = await readJson<{ address?: string; nonce?: string; signature?: string }>(request, 1024);
  const result = await verifyChallenge(request.headers.get("host"), String(body?.address ?? ""), String(body?.nonce ?? ""), String(body?.signature ?? ""));
  if ("error" in result) return fail(result.error, 401);
  const session = await openSession(result.wallet);
  const res = NextResponse.json({ wallet: result.wallet }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(sessionCookie(session.value, session.maxAge));
  return res;
}
