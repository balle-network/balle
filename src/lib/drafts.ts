import "server-only";
import { randomBytes } from "node:crypto";
import type { Store } from "@/lib/auth/store";
import { withLock } from "@/lib/lock";

/*
 * A draft is one coin being shaped in the chat: the conversation, the
 * fields it settled on, art options and launch settings. Drafts belong to the
 * signed-in wallet that started them and expire 30 days after the last
 * change. Each wallet keeps an index of its newest 40 drafts.
 */

export const DRAFT_TTL = 30 * 86400;
const MAX_MESSAGES = 80;
const MAX_ART = 8;

export type Direction = { id: string; tone: string; name: string; ticker: string; line: string };
export type Attachment = { kind: "image" | "file" | "link"; label: string };
export type Message = {
  id: string;
  role: "you" | "ai";
  at: number;
  text: string;
  reading?: string;
  directions?: Direction[];
  attachments?: Attachment[];
  note?: "error" | "info";
};
export type ArtOption = { id: string; source: "ai" | "upload"; at: number };
export type Settings = {
  /** "eth" or a pair token address. */
  pair: string;
  /** Opening buy in ETH, as typed ("0" = none). */
  buy: string;
  creatorTaxBps: number;
  buyback: boolean;
  feeWallet: string;
  exemptions: string[];
  mind: string;
  mindCustom: string;
  links: { x: string; telegram: string; website: string };
};
export type Coin = { name: string; ticker: string; tagline: string; description: string; post: string };
export type Memory = { reading: string; voice: string; facts: string[] };

export type Draft = {
  id: string;
  wallet: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  coin: Coin;
  memory: Memory;
  art: { options: ArtOption[]; chosen: string | null; pinned: { artId: string; cid: string; url: string } | null };
  settings: Settings;
  launched: { token: string; curve: string; tx: string; at: number } | null;
};

export const DEFAULT_SETTINGS: Settings = {
  pair: "eth",
  buy: "0",
  creatorTaxBps: 0,
  buyback: false,
  feeWallet: "",
  exemptions: [],
  mind: "auto",
  mindCustom: "",
  links: { x: "", telegram: "", website: "" },
};

export const newId = (bytes = 9) => randomBytes(bytes).toString("base64url");
export const isDraftId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{12}$/.test(v);

export function blankDraft(wallet: string): Draft {
  const now = Date.now();
  return {
    id: newId(9),
    wallet,
    createdAt: now,
    updatedAt: now,
    messages: [],
    coin: { name: "", ticker: "", tagline: "", description: "", post: "" },
    memory: { reading: "", voice: "", facts: [] },
    art: { options: [], chosen: null, pinned: null },
    settings: { ...DEFAULT_SETTINGS, links: { ...DEFAULT_SETTINGS.links } },
    launched: null,
  };
}

export async function readDraft(store: Store, id: string): Promise<Draft | null> {
  if (!isDraftId(id)) return null;
  const raw = await store.get(`draft:${id}`);
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw) as Draft);
  } catch {
    return null;
  }
}

/** Drafts written during the site's Solana period carry other launch settings: keep what still applies. */
function normalize(d: Draft): Draft {
  const s = (d.settings ?? {}) as Partial<Settings> & Record<string, unknown>;
  const evm = (v: unknown) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
  if (s.pair === "sol" || s.holderReward !== undefined) {
    d.settings = {
      ...DEFAULT_SETTINGS,
      mind: typeof s.mind === "string" ? s.mind : DEFAULT_SETTINGS.mind,
      mindCustom: typeof s.mindCustom === "string" ? s.mindCustom : "",
      links: { ...DEFAULT_SETTINGS.links, ...(s.links ?? {}) },
      feeWallet: evm(s.feeWallet) ? (s.feeWallet as string) : "",
    };
  } else {
    d.settings = { ...DEFAULT_SETTINGS, ...s, links: { ...DEFAULT_SETTINGS.links, ...(s.links ?? {}) } } as Settings;
  }
  return d;
}

export async function saveDraft(store: Store, d: Draft) {
  d.updatedAt = Date.now();
  if (d.messages.length > MAX_MESSAGES) d.messages = d.messages.slice(-MAX_MESSAGES);
  if (d.art.options.length > MAX_ART) d.art.options = d.art.options.slice(-MAX_ART);
  await store.setEx(`draft:${d.id}`, JSON.stringify(d), DRAFT_TTL);
}

export async function indexDraft(store: Store, wallet: string, id: string) {
  await store.pushCapped(`drafts:${wallet}`, id, 40);
}

export async function listDrafts(store: Store, wallet: string): Promise<Draft[]> {
  const ids = [...new Set(await store.range(`drafts:${wallet}`, 40))];
  const raw = await store.mget(ids.map((id) => `draft:${id}`));
  const out: Draft[] = [];
  for (const r of raw) {
    if (!r) continue;
    try {
      const d = normalize(JSON.parse(r) as Draft);
      if (d.wallet === wallet) out.push(d);
    } catch {
      // Skip a damaged record.
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Short exclusive hold on a draft while one request changes it. */
export function withDraftLock<T>(store: Store, id: string, fn: () => Promise<T>): Promise<T | "busy"> {
  return withLock(store, `draft:lock:${id}`, 120, fn);
}

/** What the browser is shown: everything but the owner's wallet is plain draft data. */
export function publicDraft(d: Draft) {
  return {
    id: d.id,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    messages: d.messages,
    coin: d.coin,
    memory: d.memory,
    art: d.art,
    settings: d.settings,
    launched: d.launched,
  };
}
export type PublicDraft = ReturnType<typeof publicDraft>;

/* Art bytes live apart from the draft, expiring with it. */
export async function saveArt(store: Store, id: string, webp: Buffer) {
  await store.setEx(`art:${id}`, webp.toString("base64"), DRAFT_TTL);
}
export async function readArt(store: Store, id: string): Promise<Buffer | null> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const raw = await store.get(`art:${id}`);
  return raw ? Buffer.from(raw, "base64") : null;
}
