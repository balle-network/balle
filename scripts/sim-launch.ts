// Simulates Balle launches against Robinhood Chain mainnet state with eth_call. Nothing is signed or sent:
// the caller is a fresh random address given 10 ETH through an eth_call state override.
//
//   npm run sim-launch                       (public RPC)
//   npm run sim-launch -- https://my-rpc     (another endpoint)
//
// Checks: a plain launch (factory launchToken) and a launch with an opening buy (official launchAndBuy
// forwarder, one transaction) both simulate, and an empty wallet is refused with a plain sentence.
import { getAddress, toHex, zeroAddress } from "viem";
import { buildLaunchCall, describeRevert, randomSalt, readLaunchContext, type LaunchInput, type Reader } from "../src/lib/launch.ts";

const URL_ = process.argv[2] || "https://robinhood-rpc.publicnode.com";
const rand = () => getAddress(`0x${[...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("")}`);

const raw = async <T,>(method: string, params: unknown[]): Promise<T> => {
  const res = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await res.json()) as { result?: T; error?: { message: string; data?: unknown } };
  if (j.error) throw Object.assign(new Error(j.error.message), { data: j.error.data });
  return j.result as T;
};

/** A reader whose eth_call runs with `funded` holding 10 ETH (state override). */
const withBalance = (funded: string | null): Reader => async <T,>(method: string, params: unknown[]) => {
  if (method === "eth_call" && funded) return raw<T>(method, [params[0], params[1] ?? "latest", { [funded]: { balance: toHex(10n ** 19n) } }]);
  return raw<T>(method, params);
};

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(ok ? "OK  " : "FAIL", label);
  if (!ok) failures++;
};

async function run(label: string, buy: bigint, funded: boolean) {
  const me = rand();
  const reader = withBalance(funded ? me : null);
  const ctx = await readLaunchContext(reader, me, zeroAddress);
  const input: LaunchInput = {
    name: "Balle Simulation Check Coin",
    symbol: "BSIMC",
    logo: "https://gateway.pinata.cloud/ipfs/bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy",
    description: "Simulated by the Balle launch check. Never sent.",
    socials: { website: "https://balle.network" },
    creator: me,
    creatorTaxBps: 0,
    buyback: false,
    pairToken: zeroAddress,
    exemptions: [],
    buy,
    salt: randomSalt(),
  };
  const { simulateLaunch } = await import("../src/lib/launch.ts");
  if (buy > 0n) {
    const probe = await simulateLaunch(reader, buildLaunchCall({ ...input, minTokensOut: 1n }, ctx), me);
    if (!funded) {
      check(!probe.ok && /ETH|balance|fund/i.test(probe.reason), `${label}: refused in plain words (${probe.ok ? "passed" : probe.reason})`);
      return;
    }
    check(probe.ok && (probe.tokensOut ?? 0n) > 0n, `${label}: one-transaction launch-and-buy quotes tokens (${probe.ok ? `${Number(probe.tokensOut! / 10n ** 18n).toLocaleString("en-US")} tokens` : probe.reason})`);
    if (!probe.ok || !probe.tokensOut) return;
    input.minTokensOut = (probe.tokensOut * 9700n) / 10000n;
  }
  const call = buildLaunchCall(input, ctx);
  const sim = await simulateLaunch(reader, call, me);
  if (!funded) {
    check(!sim.ok, `${label}: refused (${sim.ok ? "passed" : sim.reason})`);
    return;
  }
  check(sim.ok, `${label}: ${call.via} simulates (${sim.ok ? "token " + sim.token : sim.reason})`);
  console.log(`     launch fee ${Number(ctx.launchFee) / 1e18} ETH, value ${Number(call.value) / 1e18} ETH, to ${call.to}`);
}

console.log("rpc", URL_, "block", Number(BigInt(await raw<string>("eth_blockNumber", []))));
await run("plain", 0n, true);
await run("with buy", 5n * 10n ** 15n, true);
await run("empty wallet + buy", 5n * 10n ** 15n, false);
void describeRevert;
console.log(failures ? `\n${failures} check(s) failed` : "\nall simulations passed (nothing was sent)");
process.exit(failures ? 1 : 0);
