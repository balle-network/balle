import { test } from "node:test";
import assert from "node:assert/strict";
import { check, checkRequest, cost, type Clean } from "./relay.ts";

const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const OTHER = "0x5ea6858980d69d844a226221e1dab753902c249e";
const logs = (filter: Record<string, unknown>) => check({ method: "eth_getLogs", params: [filter] });

test("eth_getLogs needs an address the relay serves", () => {
  assert.match(String(logs({ fromBlock: "0x1", toBlock: "0x10" })), /needs a contract address/);
  assert.match(String(logs({ fromBlock: "0x1", toBlock: "0x10", topics: ["0x" + "a".repeat(64)] })), /needs a contract address/);
  assert.match(String(logs({ fromBlock: "0x1", toBlock: "0x10", address: OTHER })), /only relayed/);
  assert.match(String(logs({ fromBlock: "0x1", toBlock: "0x10", address: [FACTORY, OTHER] })), /only relayed/);
  assert.match(String(logs({ fromBlock: "0x1", toBlock: "0x10", address: [FACTORY, FACTORY, FACTORY, FACTORY] })), /Too many addresses/);
  assert.equal(typeof logs({ fromBlock: "0x1", toBlock: "0x10", address: FACTORY }), "object");
});

test("eth_getLogs needs numeric bounds within the span cap", () => {
  assert.match(String(logs({ fromBlock: "latest", toBlock: "0x10", address: FACTORY })), /numeric/);
  assert.match(String(logs({ fromBlock: "0x1", address: FACTORY })), /numeric/);
  assert.match(String(logs({ fromBlock: "0x1", toBlock: "0x2000", address: FACTORY })), /too wide/);
  assert.match(String(logs({ blockHash: "0x" + "1".repeat(64), address: FACTORY })), /blockHash/);
});

test("log queries are priced by span", () => {
  const small = logs({ fromBlock: "0x1", toBlock: "0x2", address: FACTORY }) as Clean;
  const big = logs({ fromBlock: "0x1", toBlock: "0x1388", address: FACTORY }) as Clean;
  assert.ok(cost(big) > cost(small) * 4, `${cost(big)} vs ${cost(small)}`);
});

test("blocks are relayed header-only", () => {
  assert.match(String(check({ method: "eth_getBlockByNumber", params: ["latest", true] })), /false/);
  assert.equal(typeof check({ method: "eth_getBlockByNumber", params: ["latest", false] }), "object");
});

test("no transactions, no state overrides", () => {
  assert.match(String(check({ method: "eth_sendRawTransaction", params: ["0x00"] })), /not allowed/);
  assert.match(String(check({ method: "eth_sendTransaction", params: [{}] })), /not allowed/);
  assert.match(String(check({ method: "eth_call", params: [{ to: FACTORY, data: "0x" }, "latest", { [FACTORY]: { code: "0x00" } }] })), /call object and a block tag/);
});

test("batches are capped", () => {
  const many = Array.from({ length: 21 }, () => ({ method: "eth_blockNumber", params: [] }));
  assert.match(String(checkRequest(many)), /Too many calls/);
  const fourLogs = Array.from({ length: 4 }, () => ({ method: "eth_getLogs", params: [{ fromBlock: "0x1", toBlock: "0x2", address: FACTORY }] }));
  assert.match(String(checkRequest(fourLogs)), /Too many log queries/);
});

test("eth_call is forwarded with a gas cap and only known fields", () => {
  const TO = "0x" + "1".repeat(40);
  const plain = check({ method: "eth_call", params: [{ to: TO, data: "0x" }, "latest"] }) as Clean;
  assert.deepEqual(plain.params[0], { to: TO, gas: "0x7a1200", data: "0x" });
  const low = check({ method: "eth_call", params: [{ to: TO, gas: "0x5208" }] }) as Clean;
  assert.equal((low.params[0] as { gas: string }).gas, "0x5208");
  assert.match(String(check({ method: "eth_call", params: [{ to: TO, gas: "0x7a1201" }] })), /gas/);
  assert.match(String(check({ method: "eth_call", params: [{ to: TO, gas: 21000 }] })), /gas/);
  const odd = check({ method: "eth_call", params: [{ to: TO, TO: "0x" + "2".repeat(40), input: "0xdead" }] }) as Clean;
  assert.deepEqual(odd.params[0], { to: TO, gas: "0x7a1200" });
});
