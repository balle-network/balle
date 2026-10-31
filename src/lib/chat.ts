import "server-only";
import type { Store } from "@/lib/auth/store";
import { newId, saveArt, type Draft, type Message } from "@/lib/drafts";
import { toCoinArt } from "@/lib/images";
import { draftTurn, pickInstruction } from "@/lib/llm/draft";
import { llmConfigured } from "@/lib/llm/openrouter";
import { offlineSuggestion } from "@/lib/offline-draft";
import { cooldown, take } from "@/lib/quota";
import { toMaterial, type Upload } from "@/lib/api";

/*
 * One chat turn on a draft, shared by "start a coin" and "ask for changes".
 * Order matters for cost control: cooldown, then the wallet's daily
 * allowance, then the paid call (which charges the site ceiling itself).
 * The person's message is kept even when the model is unavailable.
 */

export type TurnOutcome = { ok: true } | { error: string; status: number };

export async function runTurn(store: Store, d: Draft, wallet: string, upload: Upload): Promise<TurnOutcome> {
  const pickId = upload.fields.pick ?? "";
  const picked = pickId ? d.messages.flatMap((m) => m.directions ?? []).find((x) => x.id === pickId) : null;
  if (pickId && !picked) return { error: "That option is no longer in this chat.", status: 404 };
  const said = picked ? pickInstruction(picked) : upload.text.trim().slice(0, 1500);
  if (!said && !upload.image && !upload.file) return { error: "Write something, paste a link or add an image.", status: 400 };

  // Two seconds between two messages on one draft, failed ones included.
  if (!(await cooldown(store, `draft:${d.id}`, 2))) return { error: "One moment, the last message is still settling.", status: 429 };

  const prepared = await toMaterial(upload);
  if ("error" in prepared) return { error: prepared.error, status: 400 };
  const mine: Message = {
    id: newId(6),
    role: "you",
    at: Date.now(),
    text: picked ? `Use "${picked.name}" ($${picked.ticker})` : said || "(attachment)",
    ...(prepared.attachments.length ? { attachments: prepared.attachments } : {}),
  };
  d.messages.push(mine);

  if (upload.image) {
    try {
      const art = await toCoinArt(upload.image);
      const id = newId(12);
      await saveArt(store, id, art);
      d.art.options.push({ id, source: "upload", at: Date.now() });
      d.art.chosen ??= id;
    } catch {
      // The image already failed to read above if it was broken.
    }
  }
  if (picked) {
    d.coin.name = picked.name;
    d.coin.ticker = picked.ticker;
  }

  if (!llmConfigured()) {
    // No AI key on this site: start the coin from the person's own words with a fixed rule, so the draft is launchable.
    const s = said && !picked ? offlineSuggestion(said) : null;
    const filled = s && !d.coin.name && s.name && s.ticker;
    if (filled) {
      d.coin.name = s.name;
      d.coin.ticker = s.ticker;
      if (!d.coin.description && s.description) d.coin.description = s.description;
    }
    d.messages.push({
      id: newId(6),
      role: "ai",
      at: Date.now(),
      note: "info",
      text: filled
        ? `AI drafting is off on this site for now, so I started from your own words: "${s.name}" ($${s.ticker}). Change anything with Edit, add your own art, then launch.`
        : "AI drafting is off on this site for now. Fill in the name, ticker and description with Edit, add your own art, and launch: everything else works as usual.",
    });
    return { ok: true };
  }
  if (!(await take(store, "messages", wallet))) {
    d.messages.push({ id: newId(6), role: "ai", at: Date.now(), note: "info", text: "That was today's last free message. Edit by hand, or come back tomorrow (UTC)." });
    return { ok: true };
  }

  const result = await draftTurn(store, d, said, prepared.material);
  if (!result.ok) {
    d.messages.push({ id: newId(6), role: "ai", at: Date.now(), note: "error", text: result.reason });
    return { ok: true };
  }
  const t = result.value;
  Object.assign(d.coin, t.changes);
  if (picked) {
    d.coin.name = picked.name;
    d.coin.ticker = picked.ticker;
  }
  if (t.reading && !d.memory.reading) d.memory.reading = t.reading;
  if (t.memory.voice) d.memory.voice = t.memory.voice;
  if (t.memory.facts) d.memory.facts = [...d.memory.facts, ...t.memory.facts].slice(-8);
  const reply: Message = { id: newId(6), role: "ai", at: Date.now(), text: t.reply };
  if (t.reading) reply.reading = t.reading;
  if (t.directions.length) reply.directions = t.directions;
  d.messages.push(reply);
  if (t.rejected.length) {
    d.messages.push({ id: newId(6), role: "ai", at: Date.now(), note: "info", text: `Not applied: ${t.rejected.join("; ")}` });
  }
  if (t.artBrief) {
    d.messages.push({ id: newId(6), role: "ai", at: Date.now(), note: "info", text: `Art brief ready: "${t.artBrief}" Press Make art options in the panel to draw it.` });
    d.memory.facts = [...d.memory.facts.filter((f) => !f.startsWith("Art brief: ")), `Art brief: ${t.artBrief}`].slice(-8);
  }
  return { ok: true };
}
