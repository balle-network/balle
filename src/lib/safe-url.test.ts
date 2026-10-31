import { test } from "node:test";
import assert from "node:assert/strict";
import { safeLink, safeLinks, safeLogo } from "./safe-url.ts";

test("links: only plain https survives", () => {
  assert.equal(safeLink("https://x.com/ballenetwork"), "https://x.com/ballenetwork");
  assert.equal(safeLink("  https://t.me/balle  "), "https://t.me/balle");
  for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>", "http://example.com", "https://a.com/\"onmouseover=1", "https://a.com/<script>", "https://a.com/'x", "https://a b.com", "//evil.com", "", 42, null]) {
    assert.equal(safeLink(bad), "", String(bad));
  }
  assert.equal(safeLink(`https://a.com/${"x".repeat(300)}`), "", "too long");
});

test("logos: https and ipfs kept, everything else dropped", () => {
  assert.equal(safeLogo("ipfs://bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy"), "ipfs://bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy");
  assert.equal(safeLogo("https://gateway.pinata.cloud/ipfs/abc"), "https://gateway.pinata.cloud/ipfs/abc");
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "http://a.com/x.png", "ipfs://a\"b", "https://a.com/<x>"]) assert.equal(safeLogo(bad), "", bad);
});

test("link sets are checked field by field", () => {
  assert.deepEqual(safeLinks({ x: "javascript:alert(1)", telegram: "https://t.me/a", website: "data:,x" }), { x: "", telegram: "https://t.me/a", website: "" });
  assert.deepEqual(safeLinks(null), { x: "", telegram: "", website: "" });
});
