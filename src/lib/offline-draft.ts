import { fieldProblems, NAME_MAX } from "@/lib/safety";

/*
 * A starting point when AI drafting is not configured: a name, a ticker and a
 * description taken from the person's own words by a fixed rule (no model,
 * no network). Every field still passes the same checks as an AI draft, and
 * anything that would not is left empty for the person to fill in.
 */

const STOP = new Set(
  "a an the and or but of to in on at for with from by about as is are was were be been it its this that these those my your our their his her i me we you they coin token meme idea just so very really what when who why how into over under".split(" "),
);

const words = (text: string) =>
  text
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

export type OfflineSuggestion = { name: string; ticker: string; description: string };

export function offlineSuggestion(text: string): OfflineSuggestion {
  const all = words(text);
  const key = all.filter((w) => !STOP.has(w.toLowerCase()) && /[A-Za-z]/.test(w));
  let name = "";
  for (const w of key.slice(0, 3)) {
    const next = name ? `${name} ${title(w)}` : title(w);
    if (next.length > NAME_MAX) break;
    name = next;
  }
  if (name.length < 2 || fieldProblems("name", name).length) name = "";

  let ticker = "";
  if (name) {
    const parts = name.split(" ");
    const letters = parts.length === 1 ? parts[0] : parts.map((p) => p[0]).join("") + parts[parts.length - 1].slice(1);
    ticker = letters.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5);
    if (!/^[A-Z]/.test(ticker)) ticker = "";
    if (ticker.length < 3) ticker = (ticker + parts.join("").toUpperCase().replace(/[^A-Z0-9]/g, "")).slice(0, 3);
    if (fieldProblems("ticker", ticker).length) ticker = "";
  }

  const flat = text.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
  let description = flat.length > 240 ? `${flat.slice(0, 237).replace(/\s+\S*$/, "")}...` : flat;
  if (description && fieldProblems("description", description, true).length) description = "";
  return { name, ticker, description };
}
