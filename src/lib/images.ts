import "server-only";
import sharp from "sharp";

/*
 * Every image that enters the site is decoded and re-encoded here: uploads
 * (a meme to draft from, custom art) and model output alike. What is kept is
 * a fresh WebP with no metadata, never the bytes that were sent, so a file
 * that only pretends to be an image, or carries EXIF location data or a
 * script, does not survive.
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PIXEL_LIMIT = 40_000_000;

/** PNG, JPEG, WebP or GIF, judged by the first bytes rather than the file name. */
export function sniffImage(buf: Buffer): "png" | "jpeg" | "webp" | "gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  return null;
}

/** Square coin art: center-cropped, `size` px, WebP. */
export async function toCoinArt(buf: Buffer, size = 512): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: PIXEL_LIMIT, animated: false })
    .rotate()
    .resize(size, size, { fit: "cover", position: "attention" })
    .webp({ quality: 86 })
    .toBuffer();
}

/** An image to read (a meme): longest side `max` px, WebP, aspect kept. */
export async function toReadable(buf: Buffer, max = 768): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: PIXEL_LIMIT, animated: false })
    .rotate()
    .resize(max, max, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export const dataUrl = (webp: Buffer) => `data:image/webp;base64,${webp.toString("base64")}`;

/** Decodes a data: URL from the art model; null unless it is a real image. */
export function fromDataUrl(url: string): Buffer | null {
  const m = url.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  return buf.length <= 12 * 1024 * 1024 && sniffImage(buf) ? buf : null;
}
