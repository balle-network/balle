import { getStore } from "@/lib/auth/store";
import { sessionWallet } from "@/lib/auth/session";
import { ok } from "@/lib/api";
import { llmConfigured } from "@/lib/llm/openrouter";
import { pinataConfigured } from "@/lib/pinata";
import { ALLOWANCE, left } from "@/lib/quota";

export const dynamic = "force-dynamic";

/** Who is signed in, what is configured, and today's allowances. */
export async function GET() {
  const store = getStore();
  const wallet = store ? await sessionWallet() : null;
  const configured = { store: Boolean(store), ai: llmConfigured(), uploads: pinataConfigured() };
  if (!store || !wallet) return ok({ wallet: null, configured, allowance: ALLOWANCE });
  const [messages, art] = await Promise.all([left(store, "messages", wallet), left(store, "art", wallet)]);
  return ok({ wallet, configured, allowance: ALLOWANCE, left: { messages, art } });
}
