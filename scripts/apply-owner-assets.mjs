// Builds every Balle site image from the owner's final logo files (31 Oct 2026).
// Run from internal/:  node scripts/apply-owner-assets.mjs [assetDir]
// assetDir defaults to brand-source/ (kept outside git) holding BALLE_BANNER.jpg, BALLE_JPG.jpg and BALLE_PNG.png.
// public/brand/mark.webp is used as a CSS mask (src/components/Mark.tsx), so only its alpha matters:
// the mark takes the text colour of wherever it sits (forest on cream, cream on forest).
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(join(process.cwd(), "package.json"));
const sharp = require("sharp");
const dir = resolve(process.argv[2] ?? "brand-source");
const A = (f) => join(dir, f);
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const FOREST = { r: 6, g: 70, b: 56, alpha: 1 }; // background of the owner's JPG and banner

/** Trimmed cream B centred on a square canvas; `pad` = share of the side left empty on each edge. */
async function square(size, pad, bg = CLEAR) {
  const inner = Math.round(size * (1 - 2 * pad));
  const trimmed = await sharp(A("BALLE_PNG.png")).trim().png().toBuffer();
  const m = await sharp(trimmed).resize(inner, inner, { fit: "contain", background: CLEAR }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: m, gravity: "centre" }]);
}

mkdirSync("public/brand", { recursive: true });
await (await square(256, 0.02)).webp({ lossless: true }).toFile("public/brand/mark.webp");
// Square avatar: cream B on forest, like the owner's JPG.
await (await square(512, 0.2, FOREST)).webp({ quality: 92 }).toFile("public/brand/mark-512.webp");
await sharp(A("BALLE_BANNER.jpg")).webp({ quality: 90 }).toFile("public/brand/banner.webp");

// App icons: cream B on forest; tighter margin at favicon sizes so the B stays legible.
const icon = (s) => square(s, s < 64 ? 0.08 : 0.2, FOREST);
await (await icon(512)).png().toFile("src/app/icon.png");
await (await icon(180)).png().toFile("src/app/apple-icon.png");
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(async (s) => (await icon(s)).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * pngs.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(pngs.length, 4);
let off = head.length;
pngs.forEach((p, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(sizes[i], e);
  head.writeUInt8(sizes[i], e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(p.length, e + 8);
  head.writeUInt32LE(off, e + 12);
  off += p.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([head, ...pngs]));

// Share card 1200x630: the banner lockup (B + "Balle") centred on forest.
const lockup = await sharp(await sharp(A("BALLE_BANNER.jpg")).trim({ background: FOREST, threshold: 30 }).png().toBuffer())
  .resize({ width: 760, height: 300, fit: "inside" })
  .png()
  .toBuffer();
const card = await sharp({ create: { width: 1200, height: 630, channels: 3, background: FOREST } })
  .composite([{ input: lockup, gravity: "centre" }])
  .jpeg({ quality: 88 })
  .toBuffer();
writeFileSync("src/app/opengraph-image.jpg", card);
writeFileSync("src/app/twitter-image.jpg", card);
console.log("balle assets done");
