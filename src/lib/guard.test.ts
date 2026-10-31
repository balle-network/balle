import { test } from "node:test";
import assert from "node:assert/strict";
import { allowPerIp } from "./guard.ts";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/auth/verify", { method: "POST", headers });

test("sign-in limits: callers without a trusted address share one ceiling, never unlimited", async () => {
  delete process.env.VERCEL;
  delete process.env.TRUST_PROXY_HEADERS;
  let allowed = 0;
  for (let i = 0; i < 30; i++) if (await allowPerIp(req({ "x-forwarded-for": `9.9.9.${i}` }), "t-unknown", 1000, 600, 20)) allowed++;
  assert.equal(allowed, 20, "spoofed forwarding headers do not buy separate budgets");
});

test("sign-in limits: a known address has its own budget and cannot spend another's", async () => {
  process.env.TRUST_PROXY_HEADERS = "1";
  let a = 0;
  for (let i = 0; i < 8; i++) if (await allowPerIp(req({ "x-forwarded-for": "1.2.3.4" }), "t-known", 5, 600)) a++;
  assert.equal(a, 5);
  assert.equal(await allowPerIp(req({ "x-forwarded-for": "5.6.7.8" }), "t-known", 5, 600), true);
  delete process.env.TRUST_PROXY_HEADERS;
});
