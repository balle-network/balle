import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMcp, type McpDeps } from "./mcp.ts";

const TOKEN = "0x1111111111111111111111111111111111111111";
const deps = (over: Partial<McpDeps> = {}): McpDeps => ({
  list: async () => ({ v: 1, items: [] }),
  get: async (t) => (t.toLowerCase() === TOKEN ? { v: 1, token: TOKEN } : null),
  reader: async () => {
    throw new Error("no chain in tests");
  },
  allowBuild: async () => true,
  ...over,
});
const call = (method: string, params?: Record<string, unknown>, id: number | undefined = 1) => ({ jsonrpc: "2.0", id, method, params });

test("initialize answers with a supported protocol and the tools capability", async () => {
  const a = (await handleMcp(call("initialize", { protocolVersion: "2025-03-26" }), deps()))!;
  const r = a.result as { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } };
  assert.equal(r.protocolVersion, "2025-03-26");
  assert.ok(r.capabilities.tools);
  assert.equal(r.serverInfo.name, "balle");
  const b = (await handleMcp(call("initialize", { protocolVersion: "1999-01-01" }), deps()))!;
  assert.equal((b.result as { protocolVersion: string }).protocolVersion, "2025-06-18");
});

test("tools/list names the three tools, all read-only", async () => {
  const a = (await handleMcp(call("tools/list"), deps()))!;
  const tools = (a.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
  assert.deepEqual(tools.map((t) => t.name), ["list_launches", "get_launch", "build_launch_draft"]);
  assert.ok(tools.every((t) => t.annotations.readOnlyHint));
});

test("get_launch validates the address and says when a coin is not a Balle launch", async () => {
  const ok = (await handleMcp(call("tools/call", { name: "get_launch", arguments: { token: TOKEN } }), deps()))!;
  assert.equal((ok.result as { isError: boolean }).isError, false);
  const bad = (await handleMcp(call("tools/call", { name: "get_launch", arguments: { token: "javascript:alert(1)" } }), deps()))!;
  assert.equal((bad.result as { isError: boolean }).isError, true);
  const missing = (await handleMcp(call("tools/call", { name: "get_launch", arguments: { token: "0x2222222222222222222222222222222222222222" } }), deps()))!;
  assert.match(JSON.stringify(missing.result), /not launched through Balle/);
});

test("notifications get no answer; unknown methods and tools are JSON-RPC errors", async () => {
  assert.equal(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" } as never, deps()), null);
  assert.equal((await handleMcp(call("nope"), deps()))!.error!.code, -32601);
  assert.equal((await handleMcp(call("tools/call", { name: "send_tx" }), deps()))!.error!.code, -32602);
  assert.equal((await handleMcp({ id: 1, method: "ping" } as never, deps()))!.error!.code, -32600);
});

test("build_launch_draft respects its budget and fails calmly without a chain", async () => {
  const limited = (await handleMcp(call("tools/call", { name: "build_launch_draft", arguments: { name: "Test Coin", symbol: "TEST" } }), deps({ allowBuild: async () => false })))!;
  assert.match(JSON.stringify(limited.result), /Too many launch drafts/);
  const down = (await handleMcp(call("tools/call", { name: "build_launch_draft", arguments: { name: "Test Coin", symbol: "TEST" } }), deps()))!;
  assert.match(JSON.stringify(down.result), /could not be read/);
});
