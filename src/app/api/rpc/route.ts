import { NextResponse } from "next/server";
import { RpcError, rpc, rpcBatch } from "@/lib/feeds/rpc";
import { allowNetwork, readBody, tooMany, trustProxyHeaders } from "@/lib/guard";
import { spend } from "@/lib/ratelimit";
import { checkRequest, cost, type Call } from "@/lib/relay";

export const dynamic = "force-dynamic";

/*
 * Read-only JSON-RPC relay. Some networks intercept the chain's public RPC
 * host, so the browser can read through this server instead. The rules for
 * what passes live in src/lib/relay.ts; nothing here can send a transaction.
 * Every request is charged against a per-network budget weighted by cost
 * (log queries by block span); self-hosted, a site-wide ceiling applies too.
 * Upstream answers are size-capped in the server RPC client.
 */

const MAX_BODY = 32 * 1024;
const BUDGET = 1500;
const SITE_BUDGET = 12_000;
const WINDOW_SEC = 600;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(request: Request) {
  const body = await readBody<Call | Call[]>(request, MAX_BODY);
  if ("response" in body) return body.response;
  const calls = checkRequest(body.data);
  if (typeof calls === "string") return bad(calls);

  const units = calls.reduce((sum, c) => sum + cost(c), 0);
  if (!(await allowNetwork(request, "rpc", BUDGET, WINDOW_SEC, units))) return tooMany();
  if (!trustProxyHeaders() && !(await spend("rpc:site", units, SITE_BUDGET, WINDOW_SEC))) return tooMany();

  if (!Array.isArray(body.data)) {
    // A single call keeps the node's own error, so a revert reads as a revert.
    const c = calls[0];
    try {
      const result = await rpc(c.method, c.params);
      return NextResponse.json({ jsonrpc: "2.0", id: c.id ?? 1, result }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof RpcError && error.revert) {
        return NextResponse.json({ jsonrpc: "2.0", id: c.id ?? 1, error: { code: 3, message: error.message, ...(error.data ? { data: error.data } : {}) } });
      }
      return NextResponse.json({ error: "The chain could not be reached." }, { status: 502 });
    }
  }
  try {
    const results = await rpcBatch(calls.map((c) => ({ method: c.method, params: c.params })));
    const out = calls.map((c, i) => ({ jsonrpc: "2.0", id: c.id ?? i, result: results[i] ?? null }));
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The chain could not be reached." }, { status: 502 });
  }
}
