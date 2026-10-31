import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { docxText } from "./docx.ts";

function zip(name: string, content: string) {
  const data = deflateRawSync(Buffer.from(content));
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = local.length + n.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + n.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, n, data, central, n, eocd]);
}

test("reads paragraph text out of word/document.xml", () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>A pigeon &amp; a sock</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(docxText(zip("word/document.xml", xml)), "A pigeon & a sock\nSecond line");
});

test("anything else is refused", () => {
  assert.equal(docxText(Buffer.from("not a zip at all")), null);
  assert.equal(docxText(zip("other.xml", "<x/>")), null);
});
