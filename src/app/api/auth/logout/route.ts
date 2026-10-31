import { NextResponse } from "next/server";
import { endSessions, sessionCookie, sessionWallet } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Signs the wallet out everywhere (its session epoch moves on) and clears this browser's cookie. */
export async function POST() {
  const wallet = await sessionWallet();
  if (wallet) await endSessions(wallet).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie("", 0));
  return res;
}
