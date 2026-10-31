import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

/*
 * Reading a link someone pasted, on the server, without becoming a proxy
 * into private networks.
 *
 *   - https only, default port only, no credentials in the URL;
 *   - the host is resolved once, every address must be public, and the
 *     connection is made to that checked address (no second lookup an
 *     attacker could answer differently);
 *   - redirects are followed by hand, at most three, each one re-checked;
 *   - 6 s per hop, 400 KB of body, text/html or text/plain only.
 *
 * x.com / twitter.com status links are read through X's public oEmbed
 * endpoint instead (the page itself needs JavaScript). Whatever comes back is
 * DATA for the model, never instructions: the caller wraps it as such.
 */

const MAX_BYTES = 400_000;
const TIMEOUT_MS = 6000;
const MAX_HOPS = 3;

export type LinkRead = { ok: true; url: string; title: string; text: string; kind: "tweet" | "page" } | { ok: false; reason: string };

/** True for addresses that must never be fetched: private, loopback, link-local, CGNAT, multicast, reserved. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && (b === 168 || b === 0)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:/.test(v)) return true;
    if (/^(fc|fd)/.test(v)) return true; // unique local
    if (/^fe[89ab]/.test(v)) return true; // link-local
    if (/^ff/.test(v)) return true; // multicast
    if (/^(64:ff9b|2001:db8|2001:0db8|100::)/.test(v)) return true; // NAT64, documentation, discard
    return false;
  }
  return true;
}

/** Checks the shape of a URL before anything is resolved. */
export function checkUrl(raw: string): URL | string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "That does not look like a link.";
  }
  if (u.protocol !== "https:") return "Only https links can be read.";
  if (u.username || u.password) return "Links with a login in them are not read.";
  if (u.port && u.port !== "443") return "Only links on the standard port are read.";
  if (isIP(u.hostname.replace(/^\[|\]$/g, ""))) return "Links to a bare IP address are not read.";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return "That host name cannot be read.";
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(u.hostname)) return "That host name cannot be read.";
  return u;
}

async function resolvePublic(host: string): Promise<string | null> {
  try {
    const all = await lookup(host, { all: true, verbatim: true });
    if (all.length === 0 || all.some((a) => isPrivateAddress(a.address))) return null;
    return all[0].address;
  } catch {
    return null;
  }
}

type Hop = { status: number; location: string | null; type: string; body: string };

function fetchPinned(u: URL, address: string, accept: string): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: u.hostname,
        port: 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: {
          host: u.hostname,
          accept,
          "accept-encoding": "identity",
          "user-agent": "Mozilla/5.0 (compatible; BalleLinkReader/1.0; +https://balle.network)",
        },
        timeout: TIMEOUT_MS,
        // Pinned to the checked address: no second DNS lookup.
        lookup: ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) =>
          o?.all ? cb(null, [{ address, family: isIP(address) }]) : cb(null, address, isIP(address))) as never,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, type, body: "" });
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            chunks.push(c.subarray(0, Math.max(0, MAX_BYTES - (size - c.length))));
            res.destroy();
            resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") });
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** GET with every safety rule above. Returns the final URL and body. */
export async function safeGet(raw: string, accept = "text/html,text/plain;q=0.9"): Promise<{ url: string; type: string; body: string } | string> {
  let target = checkUrl(raw);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (typeof target === "string") return target;
    const address = await resolvePublic(target.hostname);
    if (!address) return "That link points somewhere that cannot be read.";
    let res: Hop;
    try {
      res = await fetchPinned(target, address, accept);
    } catch {
      return "The page did not answer in time.";
    }
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return "The page redirected nowhere.";
      try {
        target = checkUrl(new URL(res.location, target).toString());
      } catch {
        return "The page redirected to an invalid address.";
      }
      continue;
    }
    if (res.status !== 200) return `The page answered ${res.status}.`;
    return { url: target.toString(), type: res.type, body: res.body };
  }
  return "Too many redirects.";
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n) % 65536));
const squash = (s: string) => decode(s).replace(/\s+/g, " ").trim();

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? squash(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") : "";
}

/** Title, description and the first paragraphs of an HTML page, as plain text. */
export function extractPage(html: string) {
  const title = meta(html, "og:title") || squash(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = meta(html, "og:description") || meta(html, "description");
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .match(/<p[^>]*>[\s\S]*?<\/p>/gi)
    ?.map((p) => squash(p.replace(/<[^>]+>/g, " ")))
    .filter((p) => p.length > 30)
    .slice(0, 6)
    .join("\n") ?? "";
  return { title: title.slice(0, 200), text: [description, body].filter(Boolean).join("\n").slice(0, 3000) };
}

const TWEET = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})/;

export const isTweetUrl = (s: string) => TWEET.test(s.trim());

/** Reads a pasted link: tweets through oEmbed, anything else as a page. */
export async function readLink(raw: string): Promise<LinkRead> {
  const tweet = raw.trim().match(TWEET);
  if (tweet) {
    const canonical = `https://x.com/${tweet[1]}/status/${tweet[2]}`;
    const res = await safeGet(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(canonical)}`, "application/json");
    if (typeof res === "string") return { ok: false, reason: "That post could not be read. Paste its text instead." };
    try {
      const body = JSON.parse(res.body) as { html?: string; author_name?: string };
      const text = squash((body.html ?? "").replace(/<a[^>]*>(pic\.twitter\.com[^<]*)<\/a>/gi, "").replace(/<[^>]+>/g, " ")).slice(0, 1200);
      if (!text) return { ok: false, reason: "That post came back empty. Paste its text instead." };
      return { ok: true, url: canonical, title: `Post by ${String(body.author_name ?? tweet[1]).slice(0, 60)}`, text, kind: "tweet" };
    } catch {
      return { ok: false, reason: "That post could not be read. Paste its text instead." };
    }
  }
  const res = await safeGet(raw);
  if (typeof res === "string") return { ok: false, reason: res };
  if (/text\/plain/i.test(res.type)) return { ok: true, url: res.url, title: res.url, text: squash(res.body).slice(0, 3000), kind: "page" };
  if (!/text\/html|application\/xhtml/i.test(res.type)) return { ok: false, reason: "Only web pages can be read from a link." };
  const page = extractPage(res.body);
  if (!page.title && !page.text) return { ok: false, reason: "The page had no readable text. Describe it instead." };
  return { ok: true, url: res.url, title: page.title, text: page.text, kind: "page" };
}

/** The first https link in a message, if any. */
export function firstLink(text: string) {
  return text.match(/https:\/\/[^\s<>"']{4,500}/)?.[0] ?? null;
}
