import "server-only";
import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";
import { ponsV2LaunchFactoryAbi } from "@/abi/ponsV2LaunchFactory";
import { PONS } from "@/config/brand";
import { ticker } from "@/lib/feeds/okx";
import { rpc } from "@/lib/feeds/rpc";

/*
 * Live chain facts for the status strip and the cost line: the latest block,
 * the gas price, ETH/USD, and Pons' current launch fee and snipe-tax window.
 * Cached for 10 seconds; a failed read returns nulls, never invented numbers.
 */

export type Facts = {
  block: number | null;
  gasGwei: number | null;
  ethUsd: number | null;
  launchFeeEth: number | null;
  snipeTaxStartPct: number | null;
  snipeTaxSeconds: number | null;
  maxCreatorTaxPct: number | null;
  readAt: number;
};

let cache: { at: number; facts: Promise<Facts> } | null = null;

async function factory<T>(name: string): Promise<T | null> {
  try {
    const data = encodeFunctionData({ abi: ponsV2LaunchFactoryAbi, functionName: name as never });
    const raw = await rpc<Hex>("eth_call", [{ to: PONS.factory, data }, "latest"]);
    return decodeFunctionResult({ abi: ponsV2LaunchFactoryAbi, functionName: name as never, data: raw }) as T;
  } catch {
    return null;
  }
}

async function load(): Promise<Facts> {
  const [block, gas, eth, fee, snipeBps, snipeSec, maxTax] = await Promise.all([
    rpc<string>("eth_blockNumber", []).catch(() => null),
    rpc<string>("eth_gasPrice", []).catch(() => null),
    ticker("ETH-USDT"),
    factory<bigint>("launchFee"),
    factory<number>("snipeTaxStartBps"),
    factory<number | bigint>("snipeTaxSeconds"),
    factory<number>("maxCreatorTaxBps"),
  ]);
  return {
    block: block ? Number(BigInt(block)) : null,
    gasGwei: gas ? Number(BigInt(gas)) / 1e9 : null,
    ethUsd: eth?.last ?? null,
    launchFeeEth: fee === null ? null : Number(fee) / 1e18,
    snipeTaxStartPct: snipeBps === null ? null : Number(snipeBps) / 100,
    snipeTaxSeconds: snipeSec === null ? null : Number(snipeSec),
    maxCreatorTaxPct: maxTax === null ? null : Number(maxTax) / 100,
    readAt: Date.now(),
  };
}

export function chainFacts(): Promise<Facts> {
  if (cache && Date.now() - cache.at < 10_000) return cache.facts;
  const facts = load();
  cache = { at: Date.now(), facts };
  return facts;
}
