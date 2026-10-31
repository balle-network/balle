import "server-only";
import { BRAND } from "@/config/brand";
import type { Store } from "@/lib/auth/store";

/*
 * Every paid model call on the site goes through this file.
 *
 * Spending is bounded in code, not by trust:
 *   - a price ceiling per model, read from OpenRouter's public catalog at
 *     run time (text: <= $1 in / $4 out per 1M tokens; images: <= $0.00006
 *     per output image token). A catalog that cannot be read refuses the call;
 *   - a site-wide hourly ceiling per kind (LLM_CALLS_PER_HOUR,
 *     ART_CALLS_PER_HOUR). Every call is charged BEFORE it is sent, retries
 *     included, and whether or not it succeeds;
 *   - max_tokens and a timeout on every request.
 * Per-wallet allowances and cooldowns sit on top of this in the callers.
 * Without OPENROUTER_API_KEY nothing is sent and callers report "not
 * configured yet".
 */

const endpoint = () => `${(process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "")}`;
export const TEXT_MODEL_DEFAULT = "openai/gpt-4.1-mini";
export const IMAGE_MODEL_DEFAULT = "google/gemini-2.5-flash-image";

export const llmConfigured = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());
export const textModel = () => process.env.OPENROUTER_MODEL?.trim() || TEXT_MODEL_DEFAULT;
export const imageModel = () => process.env.OPENROUTER_IMAGE_MODEL?.trim() || IMAGE_MODEL_DEFAULT;

const intEnv = (name: string, fallback: number, max: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};
export const textCallsPerHour = () => intEnv("LLM_CALLS_PER_HOUR", 120, 5000);
export const artCallsPerHour = () => intEnv("ART_CALLS_PER_HOUR", 30, 1000);

/** Price ceilings, USD. */
export const MAX_INPUT_USD_PER_M = 1;
export const MAX_OUTPUT_USD_PER_M = 4;
export const MAX_IMAGE_TOKEN_USD = 0.00006;

type CatalogModel = { id: string; input: number; output: number; image: number | null; inImage: boolean; inFile: boolean; outImage: boolean; json: boolean };
let catalog: { at: number; models: Map<string, CatalogModel> } | null = null;

async function loadCatalog(): Promise<Map<string, CatalogModel> | null> {
  if (catalog && Date.now() - catalog.at < 3_600_000) return catalog.models;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as {
      data?: {
        id?: string;
        pricing?: { prompt?: string; completion?: string; image_output?: string };
        architecture?: { input_modalities?: string[]; output_modalities?: string[] };
        supported_parameters?: string[];
      }[];
    };
    const map = new Map<string, CatalogModel>();
    for (const m of body.data ?? []) {
      if (typeof m.id !== "string") continue;
      const input = Number(m.pricing?.prompt);
      const output = Number(m.pricing?.completion);
      if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;
      const image = m.pricing?.image_output === undefined ? null : Number(m.pricing.image_output);
      map.set(m.id, {
        id: m.id,
        input: input * 1e6,
        output: output * 1e6,
        image: image !== null && Number.isFinite(image) ? image : null,
        inImage: (m.architecture?.input_modalities ?? []).includes("image"),
        inFile: (m.architecture?.input_modalities ?? []).includes("file"),
        outImage: (m.architecture?.output_modalities ?? []).includes("image"),
        json: (m.supported_parameters ?? []).includes("response_format"),
      });
    }
    if (map.size === 0) throw new Error("empty");
    catalog = { at: Date.now(), models: map };
    return map;
  } catch {
    // A stale list is better than none, but only up to a day old.
    return catalog && Date.now() - catalog.at < 86_400_000 ? catalog.models : null;
  }
}

export type PriceCheck = { ok: true; model: CatalogModel } | { ok: false; reason: string };

/** Checks a model against the ceiling for its kind. Fails closed. */
export async function checkModel(id: string, kind: "text" | "image"): Promise<PriceCheck> {
  const models = await loadCatalog();
  if (!models) return { ok: false, reason: "The model price list could not be read, so nothing was sent." };
  const m = models.get(id);
  if (!m) return { ok: false, reason: `Model ${id} is not in the catalog.` };
  if (m.input > MAX_INPUT_USD_PER_M || m.output > MAX_OUTPUT_USD_PER_M) return { ok: false, reason: `Model ${id} is above the price ceiling.` };
  if (kind === "image") {
    if (!m.outImage) return { ok: false, reason: `Model ${id} does not make images.` };
    if (m.image === null || m.image > MAX_IMAGE_TOKEN_USD) return { ok: false, reason: `Model ${id} is above the image price ceiling.` };
  }
  return { ok: true, model: m };
}

/** Charges one call to the site-wide hourly ceiling. False = the hour is used up. */
export async function chargeHour(store: Store, kind: "text" | "art") {
  const hour = Math.floor(Date.now() / 3_600_000);
  const max = kind === "text" ? textCallsPerHour() : artCallsPerHour();
  return (await store.incrEx(`llm:${kind}:${hour}`, 3700)) <= max;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

async function post(body: unknown, timeoutMs: number) {
  const res = await fetch(`${endpoint()}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim()}`,
      "content-type": "application/json",
      "http-referer": BRAND.url,
      "x-title": BRAND.name,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  // Responses are small JSON; anything far larger is not something we asked for.
  if (text.length > 12_000_000) throw new Error("model answer too large");
  const json = JSON.parse(text) as {
    choices?: { message?: { content?: string; images?: { image_url?: { url?: string } }[] } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ? `model: ${json.error.message.slice(0, 120)}` : `model ${res.status}`);
  return json;
}

export type CallResult<T> = { ok: true; value: T; model: string } | { ok: false; reason: string; status: number };

/**
 * One JSON-mode text call, with at most one retry (charged separately).
 * `parse` turns the raw answer into a value or null (null = retry once).
 */
export async function textCall<T>(
  store: Store,
  messages: ChatMessage[],
  parse: (raw: string) => T | null,
  maxTokens = 900,
  /** An extra ceiling charged for every attempt, e.g. one per route. */
  alsoCharge?: () => Promise<boolean>,
): Promise<CallResult<T>> {
  if (!llmConfigured()) return { ok: false, reason: "AI drafting is not configured on this site yet.", status: 503 };
  const model = textModel();
  const priced = await checkModel(model, "text");
  if (!priced.ok) return { ok: false, reason: priced.reason, status: 503 };
  const needsPdf = messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "file"));
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await chargeHour(store, "text"))) return { ok: false, reason: "The site has used this hour's AI budget. Try again later.", status: 429 };
    if (alsoCharge && !(await alsoCharge())) return { ok: false, reason: "This hour's budget for this is used up. Try again later.", status: 429 };
    try {
      const body = await post(
        {
          model,
          messages,
          ...(priced.model.json ? { response_format: { type: "json_object" } } : {}),
          temperature: 0.8,
          max_tokens: maxTokens,
          // PDFs are read with the free text parser, never a paid OCR engine.
          ...(needsPdf ? { plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }] } : {}),
        },
        45_000,
      );
      const value = parse(body.choices?.[0]?.message?.content ?? "");
      if (value !== null) return { ok: true, value, model };
    } catch {
      // Counted already; fall through to the single retry.
    }
  }
  return { ok: false, reason: "The model did not answer in a usable way. Try again.", status: 502 };
}

/** One image call; returns data: URLs of the images the model produced. Never retried. */
export async function imageCall(store: Store, prompt: string, reference?: string): Promise<CallResult<string[]>> {
  if (!llmConfigured()) return { ok: false, reason: "AI art is not configured on this site yet.", status: 503 };
  const model = imageModel();
  const priced = await checkModel(model, "image");
  if (!priced.ok) return { ok: false, reason: priced.reason, status: 503 };
  if (!(await chargeHour(store, "art"))) return { ok: false, reason: "The site has used this hour's art budget. Try again later.", status: 429 };
  try {
    const content: ContentPart[] = [{ type: "text", text: prompt }];
    if (reference && priced.model.inImage) content.push({ type: "image_url", image_url: { url: reference } });
    const body = await post({ model, messages: [{ role: "user", content }], modalities: ["image", "text"], max_tokens: 1500 }, 90_000);
    const urls = (body.choices?.[0]?.message?.images ?? [])
      .map((i) => i.image_url?.url ?? "")
      .filter((u) => /^data:image\/(png|jpeg|webp);base64,/.test(u))
      .slice(0, 2);
    if (urls.length === 0) return { ok: false, reason: "The art model returned no image. Try another description.", status: 502 };
    return { ok: true, value: urls, model };
  } catch {
    return { ok: false, reason: "The art model did not answer. Try again in a moment.", status: 502 };
  }
}

/** Pulls the first JSON object out of a model answer. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(body.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
