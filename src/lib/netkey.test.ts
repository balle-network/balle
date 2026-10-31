import { test } from "node:test";
import assert from "node:assert/strict";
import { networkAggregate, networkKey } from "./netkey.ts";

test("IPv4 keys: address and /24", () => {
  assert.equal(networkKey("203.0.113.9"), "203.0.113.9");
  assert.equal(networkAggregate("203.0.113.9"), "203.0.113.0/24");
  assert.equal(networkKey("::ffff:203.0.113.9"), "203.0.113.9");
});

test("IPv6 keys: /64 and /48", () => {
  assert.equal(networkKey("2001:db8:abcd:12::1"), "2001:db8:abcd:12::/64");
  assert.equal(networkKey("2001:0db8:abcd:0012:ffff::9"), "2001:db8:abcd:12::/64");
  assert.equal(networkAggregate("2001:db8:abcd:12::1"), "2001:db8:abcd::/48");
  assert.equal(networkAggregate("2001:db8:abcd:ff00::1"), "2001:db8:abcd::/48");
});

test("2,000 /64s inside one /48 share a single aggregate", () => {
  const aggs = new Set<string>();
  const keys = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const ip = `2001:db8:abcd:${i.toString(16)}::1`;
    keys.add(networkKey(ip));
    aggs.add(networkAggregate(ip));
  }
  assert.equal(keys.size, 2000);
  assert.equal(aggs.size, 1);
});
