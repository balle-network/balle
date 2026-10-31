import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  toHex,
  zeroAddress,
  type Hex,
} from "viem";
import { ponsV2BondingCurveAbi } from "@/abi/ponsV2BondingCurve";
import { ponsV2LaunchAndBuyAbi } from "@/abi/ponsV2LaunchAndBuy";
import { ponsV2LaunchDeployerErrorsAbi } from "@/abi/ponsV2LaunchDeployerErrors";
import { ponsV2LaunchFactoryAbi } from "@/abi/ponsV2LaunchFactory";
import { PONS } from "@/config/brand";

/*
 * Launching on Pons V2 from the visitor's own wallet.
 *
 * Without an opening buy the wallet calls PonsV2LaunchFactory.launchToken
 * directly. With one, it calls the factory's official forwarder
 * (PonsV2LaunchAndBuy.launchAndBuy), which launches and buys in the same
 * transaction. Either way the factory records the wallet as the deployer,
 * and the creator fee recipient defaults to that wallet too. Balle builds the
 * call, simulates it with eth_call, and hands it to the wallet; it never
 * signs, never holds funds and is not in the call path.
 *
 * Every function here takes a JSON-RPC reader, so the same code runs in the
 * browser (through the site's relay or the public RPC) and in tests.
 */

export type Reader = <T>(method: string, params: unknown[]) => Promise<T>;

export const METADATA_LIMITS = { name: 64, symbol: 16, logo: 512, description: 2048, social: 256 } as const;
export const MAX_EXEMPTIONS = 32;

export type Socials = { twitter: string; telegram: string; discord: string; website: string; farcaster: string };

export type TokenParams = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: Socials;
  creatorFeeRecipient: `0x${string}`;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  expectedEconomics: Hex;
  salt: Hex;
};

export type LaunchContext = {
  launchFee: bigint;
  canLaunch: boolean;
  forwarder: `0x${string}`;
  forwarderVerified: boolean;
  maxCreatorTaxBps: number;
  snipeTaxStartBps: number;
  snipeTaxSeconds: number;
  config: { supply: bigint; curveFeeBps: bigint; phantomQuote: bigint; graduationThreshold: bigint; enabled: boolean };
  pair: { phantomQuote: bigint; graduationThreshold: bigint; decimals: number };
  pairApproved: boolean;
  expectedEconomics: Hex;
  readAt: number;
};

const bytes = (s: string) => new TextEncoder().encode(s).length;

async function read<T>(reader: Reader, to: string, abi: readonly unknown[], functionName: string, args: unknown[] = [], from?: string): Promise<T> {
  const data = (encodeFunctionData as (x: unknown) => Hex)({ abi, functionName, args });
  const raw = await reader<Hex>("eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"]);
  return (decodeFunctionResult as (x: unknown) => unknown)({ abi, functionName, data: raw }) as T;
}

const F = PONS.factory;
const fa = ponsV2LaunchFactoryAbi as readonly unknown[];

/** Everything a launch depends on, read fresh. The economics digest is pinned into the transaction. */
export async function readLaunchContext(reader: Reader, account: string | null, pairToken: string = zeroAddress): Promise<LaunchContext> {
  const [launchFee, can, forwarder, maxTax, snipeBps, snipeSec, config, approved, economics, digest] = await Promise.all([
    read<bigint>(reader, F, fa, "launchFee"),
    account ? read<boolean>(reader, F, fa, "canLaunch", [account]) : read<boolean>(reader, F, fa, "launchEnabled"),
    read<string>(reader, F, fa, "launchForwarder"),
    read<number | bigint>(reader, F, fa, "maxCreatorTaxBps"),
    read<number | bigint>(reader, F, fa, "snipeTaxStartBps"),
    read<number | bigint>(reader, F, fa, "snipeTaxSeconds"),
    read<{ supply: bigint; curveFeeBps: bigint; phantomQuote: bigint; graduationThreshold: bigint; enabled: boolean }>(reader, F, fa, "getLaunchConfig", [PONS.launchConfigId]),
    pairToken === zeroAddress ? Promise.resolve(true) : read<boolean>(reader, F, fa, "approvedPairTokens", [pairToken]),
    read<readonly [bigint, bigint, number]>(reader, F, fa, "pairTokenEconomics", [pairToken]),
    read<Hex>(reader, F, fa, "previewLaunchEconomics", [PONS.launchConfigId, pairToken]),
  ]);
  const pair =
    pairToken === zeroAddress || economics[0] === 0n
      ? { phantomQuote: config.phantomQuote, graduationThreshold: config.graduationThreshold, decimals: 18 }
      : { phantomQuote: economics[0], graduationThreshold: economics[1], decimals: Number(economics[2]) };
  return {
    launchFee,
    canLaunch: can,
    forwarder: getAddress(forwarder),
    forwarderVerified: forwarder.toLowerCase() === PONS.launchAndBuy.toLowerCase(),
    maxCreatorTaxBps: Number(maxTax),
    snipeTaxStartBps: Number(snipeBps),
    snipeTaxSeconds: Number(snipeSec),
    config,
    pair,
    pairApproved: approved,
    expectedEconomics: digest,
    readAt: Date.now(),
  };
}

/**
 * Share of supply an opening buy of `quoteIn` gets on a fresh curve: the
 * curve is constant-product against a virtual (phantom) quote reserve, and
 * the curve fee comes off the input. The launch simulation gives the exact
 * figure before signing; this is the estimate shown while choosing.
 */
export function openingShare(quoteIn: bigint, phantomQuote: bigint, curveFeeBps: bigint) {
  if (quoteIn <= 0n || phantomQuote <= 0n) return 0;
  const net = (quoteIn * (10_000n - curveFeeBps)) / 10_000n;
  return Number((net * 1_000_000n) / (phantomQuote + net)) / 1_000_000;
}

export function randomSalt(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export type LaunchInput = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: Partial<Socials>;
  creator: string;
  feeRecipient?: string;
  creatorTaxBps: number;
  buyback: boolean;
  pairToken: string;
  exemptions: string[];
  /** Opening buy in the pair's base units; 0n = no buy. */
  buy: bigint;
  /** Floor for the opening buy, from a simulation; required when buy > 0n. */
  minTokensOut?: bigint;
  salt: Hex;
};

/** Problems that would make the factory revert, named by field. Empty = fine. */
export function inputProblems(input: LaunchInput, ctx: LaunchContext): { field: string; message: string }[] {
  const out: { field: string; message: string }[] = [];
  const s = { twitter: "", telegram: "", discord: "", website: "", farcaster: "", ...input.socials };
  if (!input.name.trim()) out.push({ field: "name", message: "The coin needs a name." });
  if (!input.symbol.trim()) out.push({ field: "ticker", message: "The coin needs a ticker." });
  if (bytes(input.name) > METADATA_LIMITS.name) out.push({ field: "name", message: `Name is over ${METADATA_LIMITS.name} bytes.` });
  if (bytes(input.symbol) > METADATA_LIMITS.symbol) out.push({ field: "ticker", message: `Ticker is over ${METADATA_LIMITS.symbol} bytes.` });
  if (bytes(input.logo) > METADATA_LIMITS.logo) out.push({ field: "art", message: "Art link is too long." });
  if (bytes(input.description) > METADATA_LIMITS.description) out.push({ field: "description", message: "Description is too long." });
  for (const [k, v] of Object.entries(s)) if (bytes(v) > METADATA_LIMITS.social) out.push({ field: "links", message: `${k} link is too long.` });
  if (!isAddress(input.creator)) out.push({ field: "wallet", message: "Connect a wallet first." });
  if (input.feeRecipient && !isAddress(input.feeRecipient)) out.push({ field: "fees", message: "The fee wallet is not a valid address." });
  if (!Number.isInteger(input.creatorTaxBps) || input.creatorTaxBps < 0 || input.creatorTaxBps > ctx.maxCreatorTaxBps) {
    out.push({ field: "fees", message: `Creator tax must be between 0% and ${ctx.maxCreatorTaxBps / 100}%.` });
  }
  if (input.exemptions.length > (input.buy > 0n ? MAX_EXEMPTIONS - 1 : MAX_EXEMPTIONS)) out.push({ field: "fees", message: "Too many wallets skip the snipe tax." });
  if (input.exemptions.some((a) => !isAddress(a))) out.push({ field: "fees", message: "One of the snipe-tax wallets is not a valid address." });
  if (!ctx.canLaunch) out.push({ field: "wallet", message: "Pons is not accepting launches from this wallet right now." });
  if (!ctx.config.enabled) out.push({ field: "pair", message: "The Pons launch settings are switched off right now." });
  if (!ctx.pairApproved) out.push({ field: "pair", message: "Pons does not accept this pair right now." });
  if (input.buy > 0n && input.pairToken !== zeroAddress) out.push({ field: "buy", message: "An opening buy is only offered for coins that trade against ETH." });
  if (input.buy > 0n && !ctx.forwarderVerified) out.push({ field: "buy", message: "Pons changed its launch-and-buy contract; launch without an opening buy for now." });
  if (/^0x0{64}$/i.test(ctx.expectedEconomics)) out.push({ field: "pair", message: "Pons returned no launch terms to pin." });
  return out;
}

export function buildParams(input: LaunchInput, ctx: LaunchContext): TokenParams {
  const s = { twitter: "", telegram: "", discord: "", website: "", farcaster: "", ...input.socials };
  return {
    name: input.name.trim(),
    symbol: input.symbol.trim().toUpperCase(),
    logo: input.logo.trim(),
    description: input.description.trim(),
    socials: { twitter: s.twitter.trim(), telegram: s.telegram.trim(), discord: s.discord.trim(), website: s.website.trim(), farcaster: s.farcaster.trim() },
    creatorFeeRecipient: getAddress(input.feeRecipient || input.creator),
    creatorTaxBps: input.creatorTaxBps,
    buybackEnabled: input.buyback,
    expectedEconomics: ctx.expectedEconomics,
    salt: input.salt,
  };
}

export type LaunchCall = { to: `0x${string}`; data: Hex; value: bigint; via: "factory" | "launchAndBuy" };

/** The exact transaction the wallet is asked to sign. */
export function buildLaunchCall(input: LaunchInput, ctx: LaunchContext): LaunchCall {
  const params = buildParams(input, ctx);
  const exemptions = input.exemptions.map((a) => getAddress(a));
  if (input.buy > 0n) {
    if (input.minTokensOut === undefined || input.minTokensOut <= 0n) throw new Error("An opening buy needs a fresh quote first.");
    return {
      to: ctx.forwarder,
      data: encodeFunctionData({
        abi: ponsV2LaunchAndBuyAbi,
        functionName: "launchAndBuy",
        args: [params, PONS.launchConfigId, getAddress(input.pairToken), input.buy, input.minTokensOut, getAddress(input.creator), exemptions],
      }),
      value: ctx.launchFee + input.buy,
      via: "launchAndBuy",
    };
  }
  const data = exemptions.length
    ? encodeFunctionData({ abi: ponsV2LaunchFactoryAbi, functionName: "launchToken", args: [params, PONS.launchConfigId, getAddress(input.pairToken), exemptions] })
    : encodeFunctionData({ abi: ponsV2LaunchFactoryAbi, functionName: "launchToken", args: [params, PONS.launchConfigId, getAddress(input.pairToken)] });
  return { to: getAddress(F), data, value: ctx.launchFee, via: "factory" };
}

const ERROR_ABIS = [ponsV2LaunchFactoryAbi, ponsV2LaunchAndBuyAbi, ponsV2LaunchDeployerErrorsAbi, ponsV2BondingCurveAbi] as const;

const ERROR_TEXT: Record<string, string> = {
  NotWhitelisted: "Pons is not accepting launches from this wallet right now.",
  InvalidTokenParams: "The name or ticker is empty or invalid.",
  CreatorTaxTooHigh: "The creator tax is above what Pons allows.",
  PairTokenNotApproved: "Pons does not accept this pair right now.",
  LaunchFeeNotPaid: "The launch fee changed. Refresh the cost and try again.",
  LaunchEconomicsMismatch: "Pons changed its launch terms a moment ago. Refresh and sign again.",
  MetadataTooLong: "One of the fields is longer than Pons allows.",
  ExemptionListTooLong: "Too many wallets skip the snipe tax.",
  NativeValueMismatch: "The ETH amount did not match. Refresh the cost and try again.",
  Create2FailedDeployment: "This exact coin was already launched from this wallet. Try again for a new address.",
};

/** Turns revert data into a sentence that names the problem. */
export function describeRevert(data: unknown): string {
  const hex = typeof data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(data) ? (data as Hex) : null;
  if (hex) {
    for (const abi of ERROR_ABIS) {
      try {
        const decoded = decodeErrorResult({ abi: abi as never, data: hex });
        return ERROR_TEXT[decoded.errorName] ?? `Pons refused the launch (${decoded.errorName}).`;
      } catch {
        // Try the next ABI.
      }
    }
  }
  return "Pons refused the launch in simulation. Check the fields and your ETH balance.";
}

export type Launched = { token: `0x${string}`; curve: `0x${string}`; deployer: `0x${string}`; pairToken: `0x${string}` };

/** Reads TokenLaunched from a receipt's logs, emitted by the Pons factory only. */
export function parseLaunched(logs: { address: string; topics: string[]; data: string }[]): Launched | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== F.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ponsV2LaunchFactoryAbi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "TokenLaunched") {
        const a = ev.args as { token: `0x${string}`; curve: `0x${string}`; deployer: `0x${string}`; pairToken: `0x${string}` };
        return { token: getAddress(a.token), curve: getAddress(a.curve), deployer: getAddress(a.deployer), pairToken: getAddress(a.pairToken) };
      }
    } catch {
      // Not this event.
    }
  }
  return null;
}

/** Simulates the call from the wallet; returns the predicted token (and tokens out) or the revert reason. */
export async function simulateLaunch(reader: Reader, call: LaunchCall, from: string): Promise<{ ok: true; token: string; tokensOut: bigint | null } | { ok: false; reason: string }> {
  try {
    const raw = await reader<Hex>("eth_call", [{ from, to: call.to, data: call.data, value: toHex(call.value) }, "latest"]);
    if (call.via === "launchAndBuy") {
      const [token, , out] = decodeFunctionResult({ abi: ponsV2LaunchAndBuyAbi, functionName: "launchAndBuy", data: raw }) as readonly [string, string, bigint];
      return { ok: true, token, tokensOut: out };
    }
    const [token] = decodeFunctionResult({ abi: ponsV2LaunchFactoryAbi, functionName: "launchToken", data: raw }) as readonly [string, string];
    return { ok: true, token, tokensOut: null };
  } catch (error) {
    const data = (error as { data?: unknown })?.data;
    const msg = error instanceof Error ? error.message : "";
    const fromMsg = msg.match(/0x[0-9a-fA-F]{8,}/)?.[0];
    // The node refuses before Pons runs at all when the wallet cannot cover value + gas.
    if (/insufficient (funds|balance)/i.test(msg)) return { ok: false, reason: "This wallet does not hold enough ETH for the launch fee, the opening buy and gas. Add ETH on Robinhood Chain and try again." };
    if (!data && !fromMsg && !/revert/i.test(msg)) return { ok: false, reason: "The launch could not be checked: Robinhood Chain did not answer. Nothing was sent; try again in a moment." };
    return { ok: false, reason: describeRevert(data ?? fromMsg) };
  }
}
