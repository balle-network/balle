import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData } from "viem";
import { ponsV2LaunchAndBuyAbi } from "../abi/ponsV2LaunchAndBuy.ts";
import { ponsV2LaunchFactoryAbi } from "../abi/ponsV2LaunchFactory.ts";
import { PONS } from "../config/brand.ts";
import { buildLaunchCall, inputProblems, openingShare, parseLaunched, type LaunchContext, type LaunchInput } from "./launch.ts";

const ctx: LaunchContext = {
  launchFee: 500_000_000_000_000n,
  canLaunch: true,
  forwarder: PONS.launchAndBuy as `0x${string}`,
  forwarderVerified: true,
  maxCreatorTaxBps: 1000,
  snipeTaxStartBps: 9900,
  snipeTaxSeconds: 3,
  config: { supply: 10n ** 27n, curveFeeBps: 100n, phantomQuote: 168n * 10n ** 16n, graduationThreshold: 42n * 10n ** 17n, enabled: true },
  pair: { phantomQuote: 168n * 10n ** 16n, graduationThreshold: 42n * 10n ** 17n, decimals: 18 },
  pairApproved: true,
  expectedEconomics: `0x${"ab".repeat(32)}`,
  readAt: 0,
};
const ME = "0x1111111111111111111111111111111111111111";
const base: LaunchInput = {
  name: "Night Folder",
  symbol: "FOLD",
  logo: "",
  description: "Folds socks.",
  socials: {},
  creator: ME,
  creatorTaxBps: 0,
  buyback: false,
  pairToken: "0x0000000000000000000000000000000000000000",
  exemptions: [],
  buy: 0n,
  salt: `0x${"01".repeat(32)}`,
};

test("opening share follows the curve (0.001 ETH = about 0.059%)", () => {
  const s = openingShare(10n ** 15n, ctx.pair.phantomQuote, 100n);
  assert.ok(Math.abs(s * 100 - 0.0589) < 0.0005, String(s));
  assert.equal(openingShare(0n, ctx.pair.phantomQuote, 100n), 0);
});

test("no opening buy: the wallet calls the Pons factory, paying exactly the fee, as the creator", () => {
  const call = buildLaunchCall(base, ctx);
  assert.equal(call.to.toLowerCase(), PONS.factory.toLowerCase());
  assert.equal(call.value, ctx.launchFee);
  const d = decodeFunctionData({ abi: ponsV2LaunchFactoryAbi, data: call.data });
  assert.equal(d.functionName, "launchToken");
  const p = d.args![0] as { creatorFeeRecipient: string; expectedEconomics: string; symbol: string };
  assert.equal(p.creatorFeeRecipient.toLowerCase(), ME);
  assert.equal(p.expectedEconomics, ctx.expectedEconomics);
  assert.equal(p.symbol, "FOLD");
});

test("opening buy: Pons' own launch-and-buy forwarder, fee + buy, recipient is the wallet, floor required", () => {
  assert.throws(() => buildLaunchCall({ ...base, buy: 10n ** 16n }, ctx), /fresh quote/);
  const call = buildLaunchCall({ ...base, buy: 10n ** 16n, minTokensOut: 123n }, ctx);
  assert.equal(call.to.toLowerCase(), PONS.launchAndBuy.toLowerCase());
  assert.equal(call.value, ctx.launchFee + 10n ** 16n);
  const d = decodeFunctionData({ abi: ponsV2LaunchAndBuyAbi, data: call.data });
  assert.equal(d.functionName, "launchAndBuy");
  assert.equal(String(d.args![5]).toLowerCase(), ME);
  assert.equal(d.args![4], 123n);
});

test("problems are named by field", () => {
  assert.equal(inputProblems({ ...base, creatorTaxBps: 2000 }, ctx)[0].field, "fees");
  assert.equal(inputProblems({ ...base, buy: 1n, pairToken: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" }, ctx)[0].field, "buy");
  assert.equal(inputProblems({ ...base, buy: 1n }, { ...ctx, forwarderVerified: false })[0].field, "buy");
  assert.equal(inputProblems(base, { ...ctx, expectedEconomics: `0x${"00".repeat(32)}` })[0].field, "pair");
  assert.deepEqual(inputProblems(base, ctx), []);
});

test("TokenLaunched is only read from the Pons factory", () => {
  const fake = { address: "0x2222222222222222222222222222222222222222", topics: [], data: "0x" };
  assert.equal(parseLaunched([fake]), null);
});
