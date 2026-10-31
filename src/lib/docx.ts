import "server-only";
import { inflateRawSync } from "node:zlib";

/*
 * Plain text out of a Word .docx without a library: a .docx is a zip, and
 * the text sits in word/document.xml. Only that one entry is read, with a
 * hard cap on its inflated size (zip bombs stop at the cap).
 */

const MAX_XML = 3_000_000;

export function docxText(file: Buffer): string | null {
  // End of central directory: signature 0x06054b50 within the last 64 KB.
  const from = Math.max(0, file.length - 65_557);
  let eocd = -1;
  for (let i = file.length - 22; i >= from; i--) {
    if (file.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = file.readUInt16LE(eocd + 10);
  let at = file.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && at + 46 <= file.length; n++) {
    if (file.readUInt32LE(at) !== 0x02014b50) return null;
    const method = file.readUInt16LE(at + 10);
    const compressed = file.readUInt32LE(at + 20);
    const size = file.readUInt32LE(at + 24);
    const nameLen = file.readUInt16LE(at + 28);
    const extraLen = file.readUInt16LE(at + 30);
    const commentLen = file.readUInt16LE(at + 32);
    const local = file.readUInt32LE(at + 42);
    const name = file.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    at += 46 + nameLen + extraLen + commentLen;
    if (name !== "word/document.xml") continue;
    if (size > MAX_XML || local + 30 > file.length || file.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
    const data = file.subarray(start, start + compressed);
    let xml: Buffer;
    try {
      xml = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_XML }) : Buffer.alloc(0);
    } catch {
      return null;
    }
    return xml
      .toString("utf8")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim();
  }
  return null;
}
