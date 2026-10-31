import { PONS } from "@/config/brand";

/*
 * Rules for the read-only JSON-RPC relay (/api/rpc), kept apart from the
 * route so they can be tested. Only read methods pass; there is no way to
 * send a transaction through it (transactions always go from the visitor's
 * own wallet), and every call that could be expensive is shaped or priced:
 *
 *   eth_call             a contract `to`, hex data, no state overrides, gas
 *                        capped (filled in when the caller leaves it out)
 *   eth_getLogs          numeric fromBlock AND toBlock, a span cap, and an
 *                        `address` (one, or a short list) that must be one of
 *                        the relay's targets; topic-only queries are refused
 *   eth_getBlockByNumber header only (full-transactions flag must be false)
 * Log queries are priced by their block span.
 */

export const ALLOWED_METHODS = new Set([
  "eth_call",
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_gasPrice",
  "eth_getTransactionReceipt",
  "eth_getLogs",
]);

/** Contracts whose logs the relay serves. */
export const LOG_TARGETS = new Set([PONS.factory.toLowerCase(), PONS.launchAndBuy.toLowerCase()]);

export const MAX_CALLS = 20;
/** Gas ceiling for a relayed eth_call; without it the node would use its own, much larger default. */
export const MAX_CALL_GAS = 8_000_000;
export const MAX_LOGS_PER_BATCH = 3;
export const MAX_LOG_SPAN = 5_000;
export const MAX_LOG_ADDRESSES = 3;

const hexNum = (v: unknown) => (typeof v === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(v) ? Number(BigInt(v)) : null);
const isAddr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isTag = (v: unknown) => v === undefined || v === "latest" || v === "pending" || v === "safe" || v === "finalized" || hexNum(v) !== null;
const isTopic = (t: unknown): boolean =>
  t === null || (typeof t === "string" && /^0x[0-9a-fA-F]{64}$/.test(t)) || (Array.isArray(t) && t.length <= 4 && t.every((x) => typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x)));

export type Call = { jsonrpc?: string; id?: number | string; method?: unknown; params?: unknown };
export type Clean = { id: number | string | undefined; method: string; params: unknown[] };

/** Validates one call and returns exactly what will be forwarded, or why it is refused. */
export function check(c: Call): Clean | string {
  if (typeof c.method !== "string" || !ALLOWED_METHODS.has(c.method)) return `Method not allowed: ${String(c.method).slice(0, 40)}`;
  if (c.params !== undefined && !Array.isArray(c.params)) return "params must be an array.";
  if (c.id !== undefined && typeof c.id !== "number" && !(typeof c.id === "string" && c.id.length <= 40)) return "Invalid id.";
  const params = (c.params as unknown[] | undefined) ?? [];

  if (c.method === "eth_call") {
    if (params.length < 1 || params.length > 2) return "eth_call takes a call object and a block tag.";
    const call = params[0] as Record<string, unknown> | null;
    if (!call || typeof call !== "object" || !isAddr(call.to)) return "eth_call needs a contract address in `to`.";
    if (call.data !== undefined && (typeof call.data !== "string" || !/^0x[0-9a-fA-F]*$/.test(call.data) || call.data.length > 16_384)) return "eth_call data must be hex.";
    if (call.from !== undefined && !isAddr(call.from)) return "eth_call from must be an address.";
    if (call.value !== undefined && !(typeof call.value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(call.value))) return "eth_call value must be hex.";
    const gas = call.gas === undefined ? MAX_CALL_GAS : hexNum(call.gas);
    if (gas === null || gas > MAX_CALL_GAS) return "eth_call gas must be hex and within the cap.";
    if (!isTag(params[1])) return "Unsupported block tag.";
    const forwarded: Record<string, unknown> = { to: call.to, gas: `0x${gas.toString(16)}` };
    if (call.data !== undefined) forwarded.data = call.data;
    if (call.from !== undefined) forwarded.from = call.from;
    if (call.value !== undefined) forwarded.value = call.value;
    return { id: c.id, method: c.method, params: [forwarded, params[1] ?? "latest"] };
  }

  if (c.method === "eth_getLogs") {
    if (params.length !== 1 || !params[0] || typeof params[0] !== "object") return "eth_getLogs takes one filter.";
    const filter = params[0] as { fromBlock?: unknown; toBlock?: unknown; blockHash?: unknown; address?: unknown; topics?: unknown };
    if (filter.blockHash !== undefined) return "eth_getLogs by blockHash is not relayed.";
    const from = hexNum(filter.fromBlock);
    const to = hexNum(filter.toBlock);
    if (from === null || to === null) return "eth_getLogs needs numeric fromBlock and toBlock.";
    if (to < from || to - from > MAX_LOG_SPAN) return "Log range too wide.";
    const addresses = Array.isArray(filter.address) ? filter.address : filter.address === undefined ? [] : [filter.address];
    if (addresses.length === 0) return "eth_getLogs needs a contract address.";
    if (addresses.length > MAX_LOG_ADDRESSES) return "Too many addresses in one log query.";
    if (!addresses.every((a) => isAddr(a) && LOG_TARGETS.has(a.toLowerCase()))) return "Logs are only relayed for the Pons launch contracts.";
    if (filter.topics !== undefined && !(Array.isArray(filter.topics) && filter.topics.length <= 4 && filter.topics.every(isTopic))) return "Invalid topics.";
    return {
      id: c.id,
      method: c.method,
      params: [{ fromBlock: filter.fromBlock, toBlock: filter.toBlock, address: filter.address, ...(filter.topics ? { topics: filter.topics } : {}) }],
    };
  }

  if (c.method === "eth_getBlockByNumber") {
    if (params.length !== 2 || !isTag(params[0]) || params[1] !== false) return "eth_getBlockByNumber takes a block tag and false.";
    return { id: c.id, method: c.method, params: [params[0], false] };
  }

  if (c.method === "eth_getBalance") {
    if (params.length < 1 || params.length > 2 || !isAddr(params[0]) || !isTag(params[1])) return "eth_getBalance takes an address and a block tag.";
    return { id: c.id, method: c.method, params: [params[0], params[1] ?? "latest"] };
  }

  if (c.method === "eth_getTransactionReceipt") {
    if (params.length !== 1 || typeof params[0] !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(params[0])) return "eth_getTransactionReceipt takes one transaction hash.";
    return { id: c.id, method: c.method, params };
  }

  if (params.length > 0) return "This method takes no params.";
  return { id: c.id, method: c.method, params: [] };
}

export function logSpan(c: Clean) {
  if (c.method !== "eth_getLogs") return 0;
  const f = c.params[0] as { fromBlock: string; toBlock: string };
  return (hexNum(f.toBlock) ?? 0) - (hexNum(f.fromBlock) ?? 0);
}

/** Budget units a call costs: log queries by span, calls a little more than plain reads. */
export function cost(c: Clean) {
  if (c.method === "eth_getLogs") return 5 + Math.ceil(logSpan(c) / 250);
  if (c.method === "eth_call") return 2;
  if (c.method === "eth_getBlockByNumber" || c.method === "eth_getTransactionReceipt") return 2;
  return 1;
}

/** Checks a whole request (single call or batch). */
export function checkRequest(raw: Call | Call[]): Clean[] | string {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0 || list.length > MAX_CALLS) return "Too many calls.";
  const calls: Clean[] = [];
  for (const c of list) {
    const clean = check(c && typeof c === "object" ? c : {});
    if (typeof clean === "string") return clean;
    calls.push(clean);
  }
  const logs = calls.filter((c) => c.method === "eth_getLogs");
  if (logs.length > MAX_LOGS_PER_BATCH) return "Too many log queries in one request.";
  if (logs.reduce((sum, c) => sum + logSpan(c), 0) > MAX_LOG_SPAN) return "Log ranges too wide in total.";
  return calls;
}
