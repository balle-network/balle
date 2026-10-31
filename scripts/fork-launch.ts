// Launches two coins on a local fork of Robinhood Chain with the site's own launch code, then
// checks with Pons' own records that the wallet (not Balle, not any contract of ours) is the deployer.
//
//   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663 --port 8547
//   npm run fork-check -- http://127.0.0.1:8547
//
// Nothing here touches mainnet: the fork is local and the test wallet is a fresh random address
// funded with anvil_setBalance.
import { decodeFunctionResult, encodeFunctionData, getAddress, type Hex } from "viem";
import { ponsV2LaunchFactoryAbi } from "../src/abi/ponsV2LaunchFactory.ts";
import { PONS } from "../src/config/brand.ts";
import { buildLaunchCall, parseLaunched, randomSalt, readLaunchContext, simulateLaunch, type LaunchInput, type Reader } from "../src/lib/launch.ts";

const URL_ = process.argv[2] || "http://127.0.0.1:8547";
const rpc: Reader = async <T,>(method: string, params: unknown[]) => {
  const res = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await res.json()) as { result?: T; error?: { message: string; data?: unknown } };
  if (j.error) throw Object.assign(new Error(j.error.message), { data: j.error.data });
  return j.result as T;
};

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(ok ? "OK  " : "FAIL", label);
  if (!ok) failures++;
};

const me = getAddress(`0x${[...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("")}`);
// FORK_UPSTREAM: re-fork at the newest block before each launch, for upstreams that only serve recent state (no archive).
const UPSTREAM = process.env.FORK_UPSTREAM;
async function fresh() {
  if (UPSTREAM) await rpc("anvil_reset", [{ forking: { jsonRpcUrl: UPSTREAM } }]);
  await rpc("anvil_setBalance", [me, "0x8AC7230489E80000"]); // 10 ETH on the fork
  await rpc("anvil_impersonateAccount", [me]);
}
await fresh();
console.log("fork", URL_, "block", Number(BigInt(await rpc<string>("eth_blockNumber", []))), "wallet", me);

async function launch(label: string, buy: bigint) {
  await fresh();
  const ctx = await readLaunchContext(rpc, me, "0x0000000000000000000000000000000000000000");
  check(ctx.forwarderVerified, `${label}: factory forwarder is the verified LaunchAndBuy`);
  const input: LaunchInput = {
    name: `Fork Check ${label}`,
    symbol: buy > 0n ? "FKBUY" : "FKONE",
    logo: "",
    description: "Launched on a local fork by the Balle launch check.",
    socials: { website: "https://balle.network" },
    creator: me,
    creatorTaxBps: 100,
    buyback: false,
    pairToken: "0x0000000000000000000000000000000000000000",
    exemptions: [],
    buy,
    salt: randomSalt(),
  };
  if (buy > 0n) {
    const probe = await simulateLaunch(rpc, buildLaunchCall({ ...input, minTokensOut: 1n }, ctx), me);
    check(probe.ok && (probe.tokensOut ?? 0n) > 0n, `${label}: launch-and-buy simulation quotes tokens`);
    if (!probe.ok || !probe.tokensOut) return;
    input.minTokensOut = (probe.tokensOut * 9700n) / 10000n;
  }
  const call = buildLaunchCall(input, ctx);
  const sim = await simulateLaunch(rpc, call, me);
  check(sim.ok, `${label}: simulation passes (${sim.ok ? "token " + sim.token : sim.reason})`);
  const hash = await rpc<string>("eth_sendTransaction", [{ from: me, to: call.to, data: call.data, value: `0x${call.value.toString(16)}`, gas: "0x7A1200" }]);
  let receipt: { status: string; gasUsed: string; logs: { address: string; topics: string[]; data: string }[] } | null = null;
  for (let i = 0; i < 40 && !receipt; i++) {
    receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 250));
  }
  check(receipt?.status === "0x1", `${label}: transaction succeeded`);
  if (!receipt) return;
  console.log(`     gas used: ${Number(BigInt(receipt.gasUsed)).toLocaleString("en-US")} (${call.via})`);
  const ev = parseLaunched(receipt.logs);
  check(Boolean(ev), `${label}: TokenLaunched emitted by the Pons factory`);
  if (!ev) return;
  check(ev.deployer === me, `${label}: event deployer is the wallet`);
  const data = encodeFunctionData({ abi: ponsV2LaunchFactoryAbi, functionName: "getLaunchedToken", args: [ev.token] });
  const raw = await rpc<Hex>("eth_call", [{ to: PONS.factory, data }, "latest"]);
  const rec = decodeFunctionResult({ abi: ponsV2LaunchFactoryAbi, functionName: "getLaunchedToken", data: raw }) as { deployer: string; creatorFeeRecipient: string; creatorTaxBps: number; exists: boolean };
  check(rec.exists && getAddress(rec.deployer) === me, `${label}: Pons records the wallet as deployer`);
  check(getAddress(rec.creatorFeeRecipient) === me, `${label}: creator fees go to the wallet`);
  check(Number(rec.creatorTaxBps) === 100, `${label}: creator tax is what was asked (1%)`);
  if (buy > 0n) {
    const bal = await rpc<string>("eth_call", [{ to: ev.token, data: `0x70a08231${me.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"]);
    check(BigInt(bal) >= (input.minTokensOut ?? 1n), `${label}: the opening buy landed in the wallet (${(Number(BigInt(bal) / 10n ** 18n)).toLocaleString("en-US")} tokens)`);
  }
}

await launch("plain", 0n);
await launch("with buy", 5n * 10n ** 15n);
console.log(failures ? `\n${failures} check(s) failed` : "\nall fork checks passed");
process.exit(failures ? 1 : 0);
