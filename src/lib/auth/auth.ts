import "server-only";
import { BRAND } from "@/config/brand";

/**
 * Domain named in every message a wallet signs here. It is never taken from
 * the request on trust: a look-alike site could otherwise obtain a message in
 * its own name, have a visitor sign it there, and replay the signature here.
 * Only the project's own domain is accepted; localhost only when the operator
 * opts in for a local run (ALLOW_LOCALHOST_SIGNIN=1) or under `next dev`.
 */
export function localhostAllowed() {
  return process.env.ALLOW_LOCALHOST_SIGNIN === "1" || process.env.NODE_ENV === "development";
}

export function signInDomain(requestHost: string | null) {
  const host = (requestHost ?? "").toLowerCase();
  if (host === BRAND.domain || host === `www.${BRAND.domain}`) return host;
  if (localhostAllowed() && /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return host;
  return BRAND.domain;
}
