/*
 * Links and logos read from chain (or from stored records) are untrusted text.
 * Only plain https links survive, and logos may also be ipfs://. Anything with
 * another scheme (javascript:, data:, http:) or with quotes, angle brackets or
 * whitespace becomes "", so it can never reach an href or src.
 */

const HTTPS = /^https:\/\/[^\s"'<>\\`]+$/;
const IPFS = /^ipfs:\/\/[^\s"'<>\\`]+$/;

/** A social or website link: https only, else "". */
export function safeLink(v: unknown, max = 256): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length <= max && HTTPS.test(s) ? s : "";
}

/** A coin logo: https or ipfs://, else "". */
export function safeLogo(v: unknown, max = 512): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length <= max && (HTTPS.test(s) || IPFS.test(s)) ? s : "";
}

/** The link set Balle shows for a coin, each one checked. */
export function safeLinks(l: { x?: unknown; telegram?: unknown; website?: unknown } | null | undefined) {
  return { x: safeLink(l?.x), telegram: safeLink(l?.telegram), website: safeLink(l?.website) };
}
