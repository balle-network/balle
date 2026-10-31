import "server-only";
import { NextResponse } from "next/server";
import { getStore, type Store } from "@/lib/auth/store";
import { sessionWallet } from "@/lib/auth/session";
import { docxText } from "@/lib/docx";
import { dataUrl, MAX_IMAGE_BYTES, sniffImage, toCoinArt, toReadable } from "@/lib/images";
import { firstLink, readLink } from "@/lib/link";
import type { Material } from "@/lib/llm/draft";
import { readCappedBytes } from "@/lib/guard";

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
export const ok = (data: unknown, init?: { headers?: Record<string, string> }) =>
  NextResponse.json(data, { headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });

export const notConfigured = () => fail("Saving drafts is not configured on this site yet.", 503);

/** The store and the signed-in wallet, or the response to send instead. */
export async function requireWallet(): Promise<{ store: Store; wallet: string } | { response: NextResponse }> {
  const store = getStore();
  if (!store) return { response: notConfigured() };
  const wallet = await sessionWallet();
  if (!wallet) return { response: fail("Connect a wallet and sign in first.", 401) };
  return { store, wallet };
}

export const MAX_UPLOAD = 6 * 1024 * 1024;
const MAX_DOC = 2 * 1024 * 1024;

export type Upload = { text: string; image: Buffer | null; file: { name: string; type: string; bytes: Buffer } | null; fields: Record<string, string> };

/**
 * Parses a multipart (or JSON) body read with a hard size cap first, so a
 * huge or never-ending upload is cut off before anything is buffered whole.
 */
export async function readUpload(request: Request): Promise<Upload | { response: NextResponse }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD) return { response: fail("That upload is too large (6 MB at most).", 413) };
  const bytes = await readCappedBytes(request, MAX_UPLOAD);
  if (bytes === null) return { response: fail("That upload is too large (6 MB at most).", 413) };
  const type = request.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};
  if (type.startsWith("application/json")) {
    try {
      const j = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) if (typeof v === "string") fields[k] = v.slice(0, 4000);
    } catch {
      return { response: fail("Invalid request body.") };
    }
    return { text: fields.text ?? "", image: null, file: null, fields };
  }
  if (!type.startsWith("multipart/form-data")) return { response: fail("Unsupported request body.", 415) };
  let form: FormData;
  try {
    form = await new Response(new Blob([bytes as BlobPart]), { headers: { "content-type": type } }).formData();
  } catch {
    return { response: fail("Invalid upload.") };
  }
  let image: Buffer | null = null;
  let file: Upload["file"] = null;
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") {
      fields[k] = v.slice(0, 4000);
      continue;
    }
    const buf = Buffer.from(await v.arrayBuffer());
    if (k === "image") {
      if (buf.length > MAX_IMAGE_BYTES) return { response: fail("Images can be 4 MB at most.", 413) };
      if (!sniffImage(buf)) return { response: fail("Images must be PNG, JPEG, WebP or GIF.", 415) };
      image = buf;
    } else if (k === "file") {
      if (buf.length > MAX_DOC) return { response: fail("Documents can be 2 MB at most.", 413) };
      file = { name: v.name.replace(/[^\w.\- ]/g, "").slice(0, 80) || "document", type: v.type, bytes: buf };
    }
  }
  return { text: fields.text ?? "", image, file, fields };
}

/** Turns an upload into model material: link text, document text or PDF, a re-encoded image. */
export async function toMaterial(u: Upload): Promise<{ material: Material; attachments: { kind: "image" | "file" | "link"; label: string }[] } | { error: string }> {
  const material: Material = { text: u.text };
  const attachments: { kind: "image" | "file" | "link"; label: string }[] = [];
  const link = firstLink(u.text);
  if (link) {
    const read = await readLink(link);
    if (read.ok) {
      material.link = { url: read.url, title: read.title, text: read.text, kind: read.kind };
      attachments.push({ kind: "link", label: read.title.slice(0, 80) || read.url.slice(0, 80) });
    } else {
      attachments.push({ kind: "link", label: `Could not read the link: ${read.reason}` });
    }
  }
  if (u.image) {
    try {
      material.image = dataUrl(await toReadable(u.image));
      attachments.push({ kind: "image", label: "Image" });
    } catch {
      return { error: "That image could not be read." };
    }
  }
  if (u.file) {
    const b = u.file.bytes;
    if (b.subarray(0, 5).toString("latin1") === "%PDF-") {
      material.doc = { name: u.file.name, pdf: `data:application/pdf;base64,${b.toString("base64")}` };
    } else if (b[0] === 0x50 && b[1] === 0x4b) {
      const text = docxText(b);
      if (!text) return { error: "That Word file could not be read. Save it as .docx or paste the text." };
      material.doc = { name: u.file.name, text: text.slice(0, 6000) };
    } else {
      return { error: "Documents must be PDF or Word (.docx)." };
    }
    attachments.push({ kind: "file", label: u.file.name });
  }
  return { material, attachments };
}

/** Upload re-encoded as square coin art. */
export const uploadAsArt = (img: Buffer) => toCoinArt(img);
