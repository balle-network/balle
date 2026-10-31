import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { serverReader } from "@/lib/feeds/rpc";
import { allowNetwork, allowPublic, readBody, tooMany } from "@/lib/guard";
import { getPublicLaunch, listPublicLaunches } from "@/lib/launches-api";
import { handleMcp } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
}

/** Stateless server: no event stream to open. */
export function GET() {
  return NextResponse.json({ error: "POST JSON-RPC messages to this endpoint (MCP Streamable HTTP, stateless)." }, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

/** POST /api/mcp — MCP over Streamable HTTP. One message or a batch; answers in JSON. Never signs or sends transactions. */
export async function POST(request: Request) {
  if (!(await allowPublic(getStore(), request, "mcp", 60, 900))) return tooMany();
  const body = await readBody<unknown>(request, 16 * 1024);
  if ("response" in body) return body.response;
  const batch = Array.isArray(body.data);
  const messages = (batch ? body.data : [body.data]) as Record<string, unknown>[];
  if (messages.length === 0 || messages.length > 10) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send 1 to 10 messages." } }, { status: 400, headers: CORS });
  }
  const deps = {
    list: listPublicLaunches,
    get: getPublicLaunch,
    reader: serverReader,
    // Each draft runs several chain reads and simulations: 10 a minute per network.
    allowBuild: () => allowNetwork(request, "mcp-build", 10, 60),
  };
  const answers = (await Promise.all(messages.map((m) => handleMcp(m as never, deps)))).filter((a) => a !== null);
  if (answers.length === 0) return new Response(null, { status: 202, headers: CORS });
  return NextResponse.json(batch ? answers : answers[0], { headers: { ...CORS, "cache-control": "no-store" } });
}
