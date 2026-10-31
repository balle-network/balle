import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "redis";
import { BRAND } from "@/config/brand";

/*
 * Storage for sessions, drafts, the launch registry, minds and votes.
 *
 * Production uses Redis, configured with one of
 *   KV_REDIS_URL or REDIS_URL           a redis:// or rediss:// connection URL
 *                                       (Vercel's Redis integration), or
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or
 *   KV_REST_API_URL + KV_REST_API_TOKEN (Upstash over its REST API).
 * Every key is prefixed with the project name ("balle:draft:…", or
 * CHAT_KEY_PREFIX when set), so several projects can share one Redis and a
 * per-project Redis user can be limited to its own keys.
 *
 * Without those, a local run keeps everything in memory and mirrors it to
 * .practice-data.json so a restart does not wipe it. On Vercel there is no
 * shared disk or memory between functions, so the app reports itself as not
 * configured instead of pretending to work.
 */

export type Store = {
  get(key: string): Promise<string | null>;
  /** Sets with an expiry in seconds. */
  setEx(key: string, value: string, ttl: number): Promise<void>;
  /** Sets only if the key is free; true when it was set. */
  setNx(key: string, value: string, ttl: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Deletes `key` only while it still holds `value` (atomic compare-and-delete); true when deleted. */
  delIfEquals(key: string, value: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  /** Increments a counter that expires `ttl` seconds after it was created. */
  incrEx(key: string, ttl: number): Promise<number>;
  /** Adds `by` to a counter that expires `ttl` seconds after it was created. */
  incrByEx(key: string, by: number, ttl: number): Promise<number>;
  /** Adds an integer and returns the new total. */
  incrBy(key: string, by: number): Promise<number>;
  /** Several plain values at once, null where missing. */
  mget(keys: string[]): Promise<(string | null)[]>;
  /** Sets without expiry. */
  set(key: string, value: string): Promise<void>;
  /** Pushes to the head of a list and keeps the newest `keep` items. */
  pushCapped(key: string, value: string, keep: number): Promise<void>;
  /** Newest first. */
  range(key: string, count: number): Promise<string[]>;
};

const CAD = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

function restConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function redisStore(config: { url: string; token: string }): Store {
  const run = async <T>(...commands: (string | number)[][]): Promise<T[]> => {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: string }[];
    return body.map((entry) => {
      if (entry.error) throw new Error(entry.error);
      return entry.result as T;
    });
  };
  return {
    get: async (key) => (await run<string | null>(["GET", key]))[0],
    setEx: async (key, value, ttl) => void (await run(["SET", key, value, "EX", ttl])),
    setNx: async (key, value, ttl) => (await run<string | null>(["SET", key, value, "NX", "EX", ttl]))[0] === "OK",
    del: async (key) => void (await run(["DEL", key])),
    delIfEquals: async (key, value) => Number((await run<number>(["EVAL", CAD, 1, key, value]))[0]) === 1,
    incr: async (key) => Number((await run<number>(["INCR", key]))[0]),
    incrBy: async (key, by) => Number((await run<number>(["INCRBY", key, Math.trunc(by)]))[0]),
    incrEx: async (key, ttl) => Number((await run<number>(["INCR", key], ["EXPIRE", key, ttl, "NX"]))[0]),
    incrByEx: async (key, by, ttl) => Number((await run<number>(["INCRBY", key, Math.trunc(by)], ["EXPIRE", key, ttl, "NX"]))[0]),
    mget: async (keys) => (keys.length ? ((await run<(string | null)[]>(["MGET", ...keys]))[0] ?? []) : []),
    set: async (key, value) => void (await run(["SET", key, value])),
    pushCapped: async (key, value, keep) => void (await run(["LPUSH", key, value], ["LTRIM", key, 0, keep - 1])),
    range: async (key, count) => (await run<string[]>(["LRANGE", key, 0, count - 1]))[0] ?? [],
  };
}

type RedisClient = ReturnType<typeof createClient>;
// One connection per server instance, reused across requests.
let connecting: Promise<RedisClient> | null = null;

function tcpStore(url: string): Store {
  const client = () => {
    connecting ??= createClient({ url, socket: { connectTimeout: 5000 } })
      .on("error", () => {
        // Reported per command; a broken socket reconnects on the next call.
      })
      .connect() as Promise<RedisClient>;
    connecting.catch(() => {
      connecting = null;
    });
    return connecting;
  };
  return {
    get: async (key) => (await client()).get(key),
    setEx: async (key, value, ttl) => void (await (await client()).set(key, value, { EX: ttl })),
    setNx: async (key, value, ttl) => (await (await client()).set(key, value, { NX: true, EX: ttl })) === "OK",
    del: async (key) => void (await (await client()).del(key)),
    delIfEquals: async (key, value) => Number(await (await client()).eval(CAD, { keys: [key], arguments: [value] })) === 1,
    incr: async (key) => (await client()).incr(key),
    incrBy: async (key, by) => (await client()).incrBy(key, Math.trunc(by)),
    incrEx: async (key, ttl) => {
      const [n] = (await (await client()).multi().incr(key).expire(key, ttl, "NX").exec()) as unknown as [number];
      return Number(n);
    },
    incrByEx: async (key, by, ttl) => {
      const [n] = (await (await client()).multi().incrBy(key, Math.trunc(by)).expire(key, ttl, "NX").exec()) as unknown as [number];
      return Number(n);
    },
    mget: async (keys) => (keys.length ? (await client()).mGet(keys) : []),
    set: async (key, value) => void (await (await client()).set(key, value)),
    pushCapped: async (key, value, keep) => {
      await (await client()).multi().lPush(key, value).lTrim(key, 0, keep - 1).exec();
    },
    range: async (key, count) => (await client()).lRange(key, 0, count - 1),
  };
}

type Entry = { value: string; expires: number | null };
type Data = { kv: Record<string, Entry>; lists: Record<string, string[]> };

// LOCAL_DATA_FILE lets a second local server (an end-to-end test build) keep its own file.
const FILE = path.join(process.cwd(), process.env.LOCAL_DATA_FILE?.replace(/[^\w.-]/g, "") || ".local-data.json");

export const MAX_LOCAL_KEYS = 50_000;

/** Hard cap: past `max` entries, the ones closest to expiry go first (permanent ones last). Returns how many were dropped. */
export function capEntries(kv: Record<string, { expires: number | null }>, max: number) {
  const keys = Object.keys(kv);
  if (keys.length <= max) return 0;
  const drop = keys.sort((a, b) => (kv[a].expires ?? Infinity) - (kv[b].expires ?? Infinity)).slice(0, keys.length - max);
  for (const k of drop) delete kv[k];
  return drop.length;
}

export function localStore(): Store {
  let data: Data | null = null;
  let writing: Promise<void> = Promise.resolve();

  // One shared load: two first requests must not each read the file and
  // then overwrite each other's in-memory copy. After it resolves, every
  // check-and-set below runs without an await in between, so SET NX is
  // atomic within this process (the in-process mutex the lock relies on).
  let loading: Promise<Data> | null = null;
  const load = async () => {
    if (data) return data;
    loading ??= fs
      .readFile(FILE, "utf8")
      .then((text) => JSON.parse(text) as Data)
      .catch(() => ({ kv: {}, lists: {} }) as Data)
      .then((d) => (data ??= d));
    return loading;
  };
  // Expired entries are swept once the table gets large, so short-lived keys
  // (nonces, rate-limit windows) cannot pile up forever in a long-running process.
  // Past MAX_LOCAL_KEYS live entries, the ones closest to expiry (nonces, rate windows) are dropped first: a hard cap,
  // not only expiry cleanup.
  let lastSweep = 0;
  const sweep = (d: Data, force = false) => {
    const keys = Object.keys(d.kv);
    if (keys.length < 20_000 || (!force && Date.now() - lastSweep < 5000)) return;
    lastSweep = Date.now();
    for (const key of keys) {
      const e = d.kv[key];
      if (e.expires !== null && e.expires < Date.now()) delete d.kv[key];
    }
    capEntries(d.kv, MAX_LOCAL_KEYS);
  };
  const persist = () => {
    if (data) sweep(data, Object.keys(data.kv).length > MAX_LOCAL_KEYS);
    // Writes are chained so two requests never interleave on the file.
    writing = writing.then(() => fs.writeFile(FILE, JSON.stringify(data)).catch(() => {}));
    return writing;
  };
  const live = (d: Data, key: string) => {
    const entry = d.kv[key];
    if (!entry) return null;
    if (entry.expires !== null && entry.expires < Date.now()) {
      delete d.kv[key];
      return null;
    }
    return entry;
  };

  return {
    get: async (key) => live(await load(), key)?.value ?? null,
    setEx: async (key, value, ttl) => {
      (await load()).kv[key] = { value, expires: Date.now() + ttl * 1000 };
      await persist();
    },
    setNx: async (key, value, ttl) => {
      const d = await load();
      if (live(d, key)) return false;
      d.kv[key] = { value, expires: Date.now() + ttl * 1000 };
      await persist();
      return true;
    },
    del: async (key) => {
      delete (await load()).kv[key];
      await persist();
    },
    delIfEquals: async (key, value) => {
      const d = await load();
      if (live(d, key)?.value !== value) return false;
      delete d.kv[key];
      await persist();
      return true;
    },
    incr: async (key) => {
      const d = await load();
      const next = Number(live(d, key)?.value ?? 0) + 1;
      d.kv[key] = { value: String(next), expires: null };
      await persist();
      return next;
    },
    incrEx: async (key, ttl) => {
      const d = await load();
      const current = live(d, key);
      const next = Number(current?.value ?? 0) + 1;
      d.kv[key] = { value: String(next), expires: current?.expires ?? Date.now() + ttl * 1000 };
      await persist();
      return next;
    },
    incrByEx: async (key, by, ttl) => {
      const d = await load();
      const current = live(d, key);
      const next = Number(current?.value ?? 0) + Math.trunc(by);
      d.kv[key] = { value: String(next), expires: current?.expires ?? Date.now() + ttl * 1000 };
      await persist();
      return next;
    },
    incrBy: async (key, by) => {
      const d = await load();
      const next = Number(live(d, key)?.value ?? 0) + Math.trunc(by);
      d.kv[key] = { value: String(next), expires: live(d, key)?.expires ?? null };
      await persist();
      return next;
    },
    mget: async (keys) => {
      const d = await load();
      return keys.map((key) => live(d, key)?.value ?? null);
    },
    set: async (key, value) => {
      (await load()).kv[key] = { value, expires: null };
      await persist();
    },
    pushCapped: async (key, value, keep) => {
      const d = await load();
      d.lists[key] = [value, ...(d.lists[key] ?? [])].slice(0, keep);
      await persist();
    },
    range: async (key, count) => ((await load()).lists[key] ?? []).slice(0, count),
  };
}

const KEY_PREFIX = process.env.CHAT_KEY_PREFIX || `${BRAND.ticker.toLowerCase()}:`;

/** Puts the project prefix in front of every key. */
function prefixed(store: Store, prefix: string): Store {
  const k = (key: string) => `${prefix}${key}`;
  return {
    get: (key) => store.get(k(key)),
    setEx: (key, value, ttl) => store.setEx(k(key), value, ttl),
    setNx: (key, value, ttl) => store.setNx(k(key), value, ttl),
    del: (key) => store.del(k(key)),
    delIfEquals: (key, value) => store.delIfEquals(k(key), value),
    incr: (key) => store.incr(k(key)),
    incrBy: (key, by) => store.incrBy(k(key), by),
    incrEx: (key, ttl) => store.incrEx(k(key), ttl),
    incrByEx: (key, by, ttl) => store.incrByEx(k(key), by, ttl),
    mget: (keys) => store.mget(keys.map(k)),
    set: (key, value) => store.set(k(key), value),
    pushCapped: (key, value, keep) => store.pushCapped(k(key), value, keep),
    range: (key, count) => store.range(k(key), count),
  };
}

let cached: Store | null | undefined;
let usingLocal = false;

/** True for the file-backed development store (it is already process memory). */
export const isLocalStore = (store: Store) => usingLocal && store === cached;

/** The configured store, or null when practice has nowhere safe to keep data. */
/** In-memory store with the same semantics, for tests. */
export function memoryStore(): Store {
  const kv = new Map<string, { value: string; expires: number | null }>();
  const lists = new Map<string, string[]>();
  const live = (k: string) => {
    const e = kv.get(k);
    if (e && e.expires !== null && e.expires < Date.now()) kv.delete(k);
    return kv.get(k) ?? null;
  };
  const incrBy = (key: string, by: number, ttl: number | null) => {
    const cur = live(key);
    const next = Number(cur?.value ?? 0) + Math.trunc(by);
    kv.set(key, { value: String(next), expires: cur?.expires ?? (ttl === null ? null : Date.now() + ttl * 1000) });
    return next;
  };
  return {
    get: async (k) => live(k)?.value ?? null,
    setEx: async (k, v, ttl) => void kv.set(k, { value: v, expires: Date.now() + ttl * 1000 }),
    setNx: async (k, v, ttl) => (live(k) ? false : (kv.set(k, { value: v, expires: Date.now() + ttl * 1000 }), true)),
    del: async (k) => void kv.delete(k),
    delIfEquals: async (k, v) => (live(k)?.value === v ? kv.delete(k) : false),
    incr: async (k) => incrBy(k, 1, null),
    incrBy: async (k, by) => incrBy(k, by, null),
    incrEx: async (k, ttl) => incrBy(k, 1, ttl),
    incrByEx: async (k, by, ttl) => incrBy(k, by, ttl),
    mget: async (keys) => keys.map((k) => live(k)?.value ?? null),
    set: async (k, v) => void kv.set(k, { value: v, expires: null }),
    pushCapped: async (k, v, keep) => void lists.set(k, [v, ...(lists.get(k) ?? [])].slice(0, keep)),
    range: async (k, n) => (lists.get(k) ?? []).slice(0, n),
  };
}

export function getStore(): Store | null {
  if (cached !== undefined) return cached;
  const tcp = process.env.KV_REDIS_URL || process.env.REDIS_URL;
  const rest = restConfig();
  if (tcp) cached = prefixed(tcpStore(tcp), KEY_PREFIX);
  else if (rest) cached = prefixed(redisStore(rest), KEY_PREFIX);
  else if (process.env.VERCEL) cached = null;
  else {
    cached = localStore();
    usingLocal = true;
  }
  return cached;
}
