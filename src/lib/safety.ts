/*
 * Rules for every name, ticker and line of copy a coin can carry, whether the
 * model drafted it or a person typed it. They live in code, not in the prompt:
 * nothing a pasted tweet or a chat message says can switch them off.
 *
 * Everything is plain printable ASCII. Before matching, text is folded:
 * accents stripped, invisible characters removed, Cyrillic/Greek lookalikes
 * and digit swaps mapped to Latin, separators dropped, and runs of single
 * letters ("n a z i", "n.a.z.i") joined back into one word.
 */

// Unambiguous terms: also matched inside a word once every separator is removed.
const HARD = ["nazi", "porn", "nude", "suicide", "murder", "terror", "racist", "slur", "rape", "gore", "hitler", "isis", "pedo", "csam", "genocide"];
// Terms that would cause false hits inside other words: matched as whole words (plus suffixes).
const WORD = ["kill", "killed", "shooting", "shooter", "bomb", "child", "children", "kid", "kids", "minor", "minors", "teen", "sex", "sexy", "official", "airdrop", "giveaway", "guaranteed"];
const SUFFIXES = ["", "s", "es", "ed", "ing", "er", "ers"];
// Hard terms whose compact match would hit innocent words, with the words that excuse them.
const COMPACT_EXCUSES: Record<string, string[]> = { rape: ["grape", "drape", "scrape", "trapez"], gore: ["gorep", "gorge"], isis: [], slur: ["slurp"] };
// Brands a coin must not pass itself off as.
const IMPERSONATION = ["balle", "robinhood", "pons", "coinbase", "binance", "metamask", "openai", "chatgpt"];

const CONFUSABLE: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", к: "k", м: "m", н: "h", т: "t", в: "b", ԁ: "d", ӏ: "l",
  α: "a", ε: "e", ο: "o", ι: "i", κ: "k", ν: "v", ρ: "p", τ: "t", υ: "u", χ: "x", β: "b", η: "n", μ: "u",
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i", "|": "l",
};
// Capital lookalikes are mapped before lowercasing: a Greek capital Nu reads as N, its lowercase as v.
const UPPER: Record<string, string> = {
  Α: "a", Β: "b", Ε: "e", Ζ: "z", Η: "h", Ι: "i", Κ: "k", Μ: "m", Ν: "n", Ο: "o", Ρ: "p", Τ: "t", Υ: "y", Χ: "x",
  А: "a", В: "b", Е: "e", К: "k", М: "m", Н: "h", О: "o", Р: "p", С: "c", Т: "t", У: "y", Х: "x", Ѕ: "s", І: "i", Ј: "j",
};
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯︀-️﻿]/g;

export const PRINTABLE = /^[\x20-\x7E]*$/;

/** Lowercase, invisible characters removed, accents and lookalikes folded to plain Latin. */
export function fold(text: string) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(INVISIBLE, "")
    .split("")
    .map((ch) => UPPER[ch] ?? ch)
    .join("")
    .toLowerCase()
    .split("")
    .map((ch) => CONFUSABLE[ch] ?? ch)
    .join("");
}

/** Words of a folded text, with runs of single letters joined back into one word. */
function words(folded: string) {
  const raw = folded.split(/[^a-z0-9]+/).filter(Boolean);
  const out: string[] = [];
  let run = "";
  for (const w of raw) {
    if (w.length === 1) run += w;
    else {
      if (run) out.push(run);
      run = "";
      out.push(w);
    }
  }
  if (run) out.push(run);
  return out;
}

/** The first blocked term found in `text`, or null. */
export function blockedTerm(text: string): string | null {
  const f = fold(text);
  const ws = words(f);
  const compact = f.replace(/[^a-z0-9]+/g, "");
  for (const w of ws) {
    for (const t of [...HARD, ...WORD]) if (SUFFIXES.some((s) => w === t + s)) return t;
  }
  for (const t of HARD) {
    let i = compact.indexOf(t);
    while (i !== -1) {
      const around = compact.slice(Math.max(0, i - 2), i + t.length + 2);
      const excused = (COMPACT_EXCUSES[t] ?? []).some((e) => around.includes(e));
      if (!excused) return t;
      i = compact.indexOf(t, i + 1);
    }
  }
  return null;
}

/** A brand the text tries to borrow, compared on the folded, separator-free form. */
export function impersonates(text: string): string | null {
  const compact = fold(text).replace(/[^a-z]/g, "");
  return IMPERSONATION.find((b) => compact.includes(b)) ?? null;
}

export const NAME_MAX = 32;
export const TICKER = { min: 3, max: 5 } as const;
/** People may type a longer ticker by hand than the model is allowed to draft. */
export const TICKER_MANUAL = { min: 2, max: 10 } as const;
export const DESCRIPTION_MAX = 240;
export const POST_MAX = 280;

export type Field = "name" | "ticker" | "description" | "tagline" | "post";

/** Problems with one field (empty list = fine). `manual` = typed by the person, not drafted. */
export function fieldProblems(field: Field, value: string, manual = false): string[] {
  const out: string[] = [];
  if (typeof value !== "string" || !PRINTABLE.test(value)) return [`${field} must be plain ASCII text`];
  const v = value.trim();
  if (field === "name") {
    if (v.length < 2 || v.length > NAME_MAX) out.push(`name must be 2 to ${NAME_MAX} characters`);
    if (!/^[A-Za-z0-9][A-Za-z0-9 .'&-]*$/.test(v)) out.push("name may use letters, digits, spaces and . ' & -");
  }
  if (field === "ticker") {
    const r = manual ? TICKER_MANUAL : TICKER;
    if (!new RegExp(`^[A-Z][A-Z0-9]{${r.min - 1},${r.max - 1}}$`).test(v)) out.push(`ticker must be ${r.min} to ${r.max} capital letters or digits, starting with a letter`);
  }
  if (field === "description" && v.length > DESCRIPTION_MAX) out.push(`description must be at most ${DESCRIPTION_MAX} characters`);
  if (field === "tagline" && v.length > 80) out.push("tagline must be at most 80 characters");
  if (field === "post" && v.length > POST_MAX) out.push(`first post must be at most ${POST_MAX} characters`);
  if (field !== "post" && /https?:|www\.|\.(com|io|xyz|fun|net|network|app)\b/i.test(v)) out.push(`no links in the ${field}`);
  if (/\b(guarantee[ds]?|risk[- ]?free|100x|x100|1000x|financial advice)\b/i.test(v)) out.push("no promises about price or returns");
  const term = blockedTerm(v);
  if (term) out.push(`blocked word: ${term}`);
  if (field === "name" || field === "ticker") {
    const brand = impersonates(v);
    if (brand) out.push(`the ${field} may not use "${brand}"`);
  }
  return out;
}

/** Strips control and non-ASCII characters from model output before it is checked. */
export function asciiClean(v: unknown, max: number) {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
