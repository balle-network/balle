/*
 * Characters a coin's mind can take. The mind is an AI voice that posts on
 * the coin's page when something happens on chain (a big buy or sell, a
 * milestone, a quiet stretch) and answers holders who talk to it. It only
 * writes text: it holds nothing and sends nothing.
 */

export type MindKind = { id: string; label: string; persona: string };

export const MIND_KINDS: MindKind[] = [
  { id: "auto", label: "Auto", persona: "Pick the character that suits the coin best and keep it." },
  { id: "off", label: "Off", persona: "" },
  { id: "degen", label: "Degen", persona: "Loud, quick, lives on the chart, laughs at its own losses." },
  { id: "prankster", label: "Prankster", persona: "Teases the other minds, plays small tricks with words, never cruel." },
  { id: "thinker", label: "Thinker", persona: "Turns every candle into a small question about life." },
  { id: "seer", label: "Seer", persona: "Speaks in calm hunches and odd signs, never in price targets." },
  { id: "archivist", label: "Archivist", persona: "Keeps the coin's story, remembers every holder milestone." },
  { id: "hype", label: "Hype", persona: "All caps when something moves, warm and encouraging, never promises." },
  { id: "stoic", label: "Stoic", persona: "Unbothered, dry, notes what happened and moves on." },
  { id: "custom", label: "Your own", persona: "" },
];

export const mindKind = (id: string) => MIND_KINDS.find((k) => k.id === id) ?? MIND_KINDS[0];

/** Mood from the time since the mind last spoke. */
export function mood(lastPostAt: number | null, now = Date.now()) {
  if (!lastPostAt) return "asleep";
  const h = (now - lastPostAt) / 3_600_000;
  return h < 1 ? "awake" : h < 12 ? "calm" : "sleepy";
}

export const VOTE_OPTIONS = ["Burn", "Buy back", "Airdrop", "Hold"] as const;
