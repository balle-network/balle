import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, extractPage, isPrivateAddress, isTweetUrl, safeGet } from "./link.ts";

test("private, loopback, link-local and mapped addresses are refused", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["1.1.1.1", "104.16.0.1", "172.32.0.1", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
  assert.equal(isPrivateAddress("not-an-ip"), true);
});

test("URL shape rules", () => {
  assert.equal(typeof checkUrl("http://example.com/"), "string");
  assert.equal(typeof checkUrl("https://user:pw@example.com/"), "string");
  assert.equal(typeof checkUrl("https://example.com:8443/"), "string");
  assert.equal(typeof checkUrl("https://127.0.0.1/"), "string");
  assert.equal(typeof checkUrl("https://[::1]/"), "string");
  assert.equal(typeof checkUrl("https://localhost/"), "string");
  assert.equal(typeof checkUrl("https://printer.local/"), "string");
  assert.equal(typeof checkUrl("file:///etc/passwd"), "string");
  assert.ok(checkUrl("https://example.com/a?b=1") instanceof URL);
});

test("a public-looking name that resolves to loopback is not fetched", { skip: process.env.OFFLINE === "1" }, async () => {
  // 127.0.0.1.nip.io resolves to 127.0.0.1 through public DNS.
  const r = await safeGet("https://127.0.0.1.nip.io/");
  assert.equal(typeof r, "string");
  assert.match(String(r), /cannot be read/);
});

test("tweet links are recognised", () => {
  assert.equal(isTweetUrl("https://x.com/someone/status/1234567890"), true);
  assert.equal(isTweetUrl("https://twitter.com/someone/status/1234567890"), true);
  assert.equal(isTweetUrl("https://x.com/someone"), false);
});

test("page text extraction drops scripts", () => {
  const p = extractPage('<html><title>Hi &amp; bye</title><script>alert(1)</script><p>This is a long enough paragraph about a pigeon.</p></html>');
  assert.equal(p.title, "Hi & bye");
  assert.match(p.text, /pigeon/);
  assert.doesNotMatch(p.text, /alert/);
});
