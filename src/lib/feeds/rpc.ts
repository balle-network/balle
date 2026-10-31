import "server-only";
import { CHAIN, serverRpc } from "@/config/brand";

/*
 * JSON-RPC reads against Robinhood Chain from the server. The configured
 * endpoint is tried first, then the public fallback. Reads only: nothing here
 * signs or sends a transaction.
 *
 * Every upstream answer is read with a size cap (MAX_RESPONSE_BYTES): a log
 * query or a block that comes back larger is cut off and reported as an
 * error instead of being buffered whole.
 */

const endpoints = () => [serverRpc(), CHAIN.fallbackRpc].filter((url, i, all) => all.indexOf(url) === i);
let preferred = 0;

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class RpcError extends Error {
  readonly revert: boolean;
  readonly data?: string;
  constructor(message: string, revert = false, data?: string) {
    super(message);
    this.revert = revert;
    this.data = data;
  }
}

/** Reads a response body but stops past `max` bytes. */
export async function readLimited(res: Response, max = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) {
    await res.body?.cancel().catch(() => {});
    throw new RpcError("The chain's answer was too large.");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new RpcError("The chain's answer was too large.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function post(url: string, body: unknown, max: number) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new RpcError(`RPC ${res.status}`);
  }
  return JSON.parse(await readLimited(res, max));
}

type RpcBody<T> = { result?: T; error?: { message: string; code?: number; data?: unknown } };

export async function rpc<T>(method: string, params: unknown[], max = MAX_RESPONSE_BYTES): Promise<T> {
  const list = endpoints();
  let last: unknown;
  for (let n = 0; n < list.length; n++) {
    const i = (preferred + n) % list.length;
    try {
      const body = (await post(list[i], { jsonrpc: "2.0", id: 1, method, params }, max)) as RpcBody<T>;
      if (body.error) {
        // A revert is an answer, not an outage: do not try the next endpoint.
        if (/revert/i.test(body.error.message) || body.error.code === 3) {
          throw new RpcError(body.error.message, true, typeof body.error.data === "string" ? body.error.data : undefined);
        }
        throw new RpcError(body.error.message);
      }
      preferred = i;
      return body.result as T;
    } catch (error) {
      if (error instanceof RpcError && error.revert) throw error;
      last = error;
    }
  }
  throw last;
}

export async function rpcBatch<T>(calls: { method: string; params: unknown[] }[], max = MAX_RESPONSE_BYTES): Promise<(T | null)[]> {
  if (calls.length === 0) return [];
  const list = endpoints();
  let last: unknown;
  for (let n = 0; n < list.length; n++) {
    const i = (preferred + n) % list.length;
    try {
      const body = (await post(
        list[i],
        calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c })),
        max,
      )) as { id: number; result?: T; error?: unknown }[];
      if (!Array.isArray(body)) throw new RpcError("batch unsupported");
      preferred = i;
      const out: (T | null)[] = calls.map(() => null);
      for (const entry of body) if (!entry.error && entry.result !== undefined && typeof entry.id === "number" && entry.id < out.length) out[entry.id] = entry.result;
      return out;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

export const ethCall = (to: string, data: string) => rpc<string>("eth_call", [{ to, data }, "latest"]);

/** A reader with the shape the launch helpers expect. */
export const serverReader = <T,>(method: string, params: unknown[]) => rpc<T>(method, params);
