import "server-only";

/*
 * Coin art goes to IPFS through Pinata before launch, because the Pons
 * `logo` field only holds a URL (at most 512 bytes). The JWT stays on the
 * server (PINATA_JWT); only re-encoded WebP art the site produced itself is
 * pinned. Without the key the art stays a draft and the launch panel says
 * uploads are not configured yet.
 */

const PIN_FILE = "https://api.pinata.cloud/pinning/pinFileToIPFS";
// ipfs.io now answers path requests with a service-worker notice, so the public Pinata gateway is the default.
const DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

export const pinataConfigured = () => Boolean(process.env.PINATA_JWT?.trim());

export function gateway() {
  const g = process.env.IPFS_GATEWAY?.trim() || DEFAULT_GATEWAY;
  return /^https:\/\/[^\s]+$/.test(g) ? (g.endsWith("/") ? g : `${g}/`) : DEFAULT_GATEWAY;
}

const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/;

export async function pinWebp(webp: Buffer, name: string): Promise<{ cid: string; url: string } | { error: string }> {
  if (!pinataConfigured()) return { error: "Art uploads are not configured on this site yet." };
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(webp)], { type: "image/webp" }), `${name}.webp`);
  form.append("pinataMetadata", JSON.stringify({ name: `balle-${name}` }));
  try {
    const res = await fetch(PIN_FILE, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.PINATA_JWT?.trim()}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { error: res.status === 401 || res.status === 403 ? "The upload key was refused." : `Upload failed (${res.status}).` };
    const body = (await res.json()) as { IpfsHash?: string };
    if (!body.IpfsHash || !CID.test(body.IpfsHash)) return { error: "The upload service gave no file id." };
    return { cid: body.IpfsHash, url: `${gateway()}${body.IpfsHash}` };
  } catch {
    return { error: "The upload service did not answer." };
  }
}
