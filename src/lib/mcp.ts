import { toHex, zeroAddress } from "viem";
import { BRAND, CHAIN, PONS, isAddress } from "@/config/brand";
import { buildLaunchCall, inputProblems, randomSalt, readLaunchContext, simulateLaunch, type LaunchInput, type Reader } from "@/lib/launch";
import { parseUnits } from "@/lib/pons";
import { fieldProblems } from "@/lib/safety";
import { safeLink, safeLogo } from "@/lib/safe-url";

/*
 * Balle's MCP server (Model Context Protocol, Streamable HTTP, stateless):
 * JSON-RPC 2.0 over POST /api/mcp, one JSON answer per request, no sessions.
 *
 * Tools:
 *   list_launches       coins launched through Balle, newest first, live curve state
 *   get_launch          one of them by token address
 *   build_launch_draft  an UNSIGNED Pons launch transaction (create + optional opening buy in one
 *                       transaction), simulated with eth_call when a creator wallet is given.
 * Nothing here signs, holds keys or sends a transaction: the person's own wallet does that.
 *
 * The handler takes its data sources as arguments so tests can run it without a chain or a store.
 */

export const MCP_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type McpDeps = {
  list: (offset: number, limit: number) => Promise<unknown | null>;
  get: (token: string) => Promise<unknown | null>;
  reader: Reader;
  /** Extra budget check for the tool that reads the chain hardest; false = refuse. */
  allowBuild: () => Promise<boolean>;
};

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Answer = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const TOOLS = [
  {
    name: "list_launches",
    title: "List Balle launches",
    description: `Coins launched through ${BRAND.name} on Pons (${CHAIN.name}, chain ${CHAIN.id}), newest first. Each item has name, symbol, creator, curve address and live curve state (progress to graduation, graduated or not, market cap in ETH) read from chain.`,
    inputSchema: {
      type: "object",
      properties: {
        offset: { type: "integer", minimum: 0, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_launch",
    title: "Get one Balle launch",
    description: `One coin launched through ${BRAND.name}, by token address, with its Pons record and curve state read live from ${CHAIN.name}.`,
    inputSchema: {
      type: "object",
      properties: { token: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "Token contract address" } },
      required: ["token"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "build_launch_draft",
    title: "Build an unsigned Pons launch transaction",
    description: `Checks a coin idea against Pons' current launch terms and returns the exact UNSIGNED transaction (to, data, value) a wallet would sign on ${CHAIN.name}. With an opening buy it uses Pons' official launch-and-buy contract, so create and buy happen in one transaction. When creator is given, the transaction is simulated from that wallet with eth_call first. This tool never signs or sends anything. Coins launched from a raw transaction are not listed on ${BRAND.name}; to be listed, finish the launch at ${BRAND.url}/app.`,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 32 },
        symbol: { type: "string", minLength: 2, maxLength: 10 },
        description: { type: "string", maxLength: 240 },
        logo: { type: "string", description: "https:// or ipfs:// image link (optional)" },
        creator: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "Wallet that will sign; it becomes the Pons deployer and fee recipient" },
        buyEth: { type: "string", pattern: "^\\d{0,3}(\\.\\d{0,18})?$", description: "Opening buy in ETH, 0 to 5 (optional)" },
        x: { type: "string", description: "https://x.com/… link (optional)" },
        telegram: { type: "string", description: "https://t.me/… link (optional)" },
        website: { type: "string", description: "https:// link (optional)" },
      },
      required: ["name", "symbol"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
] as const;

const text = (data: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data, isError });
const toolError = (message: string) => text({ error: message }, true);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const MAX_BUY_ETH = 5;

export async function buildLaunchDraft(args: Record<string, unknown>, reader: Reader) {
  const name = str(args.name).trim();
  const symbol = str(args.symbol).trim().toUpperCase();
  const problems: string[] = [...fieldProblems("name", name, true), ...fieldProblems("ticker", symbol, true)];
  const description = str(args.description).trim();
  if (description) problems.push(...fieldProblems("description", description, true));
  const logo = args.logo === undefined ? "" : safeLogo(args.logo);
  if (args.logo !== undefined && !logo) problems.push("The logo must be an https:// or ipfs:// link.");
  const links = { twitter: safeLink(args.x), telegram: safeLink(args.telegram), website: safeLink(args.website) };
  for (const [k, raw] of [["x", args.x], ["telegram", args.telegram], ["website", args.website]] as const) {
    if (raw !== undefined && raw !== "" && !safeLink(raw)) problems.push(`The ${k} link must be a plain https:// address.`);
  }
  const creator = str(args.creator);
  if (creator && !isAddress(creator)) problems.push("creator must be 0x followed by 40 hex characters.");
  const buyText = str(args.buyEth) || "0";
  const buy = parseUnits(buyText);
  if (buy === null || Number(buyText) > MAX_BUY_ETH) problems.push(`buyEth must be a number from 0 to ${MAX_BUY_ETH}.`);

  const ctx = await readLaunchContext(reader, creator && isAddress(creator) ? creator : null, zeroAddress);
  const input: LaunchInput = {
    name,
    symbol,
    logo,
    description,
    socials: links,
    creator: creator && isAddress(creator) ? creator : zeroAddress,
    creatorTaxBps: 0,
    buyback: false,
    pairToken: zeroAddress,
    exemptions: [],
    buy: buy ?? 0n,
    salt: randomSalt(),
  };
  for (const p of inputProblems(input, ctx)) if (p.field !== "wallet" || creator) problems.push(p.message);
  const terms = {
    launchFeeEth: Number(ctx.launchFee) / 1e18,
    curveFeeBps: Number(ctx.config.curveFeeBps),
    graduationThresholdEth: Number(ctx.config.graduationThreshold) / 1e18,
    launchAndBuyContract: ctx.forwarder,
    factory: PONS.factory,
  };
  if (problems.length) return { ok: false, problems: [...new Set(problems)], terms };

  let simulation: { ran: boolean; ok?: boolean; predictedToken?: string; tokensOut?: string; reason?: string } = { ran: false };
  if ((buy ?? 0n) > 0n) {
    if (!creator) return { ok: false, problems: ["An opening buy needs a creator wallet, so the buy can be quoted by simulation."], terms };
    const probe = await simulateLaunch(reader, buildLaunchCall({ ...input, minTokensOut: 1n }, ctx), creator);
    if (!probe.ok || !probe.tokensOut) return { ok: false, problems: [probe.ok ? "Pons quoted no tokens for that opening buy." : probe.reason], terms };
    // Same 3% floor as the site's launch button.
    input.minTokensOut = (probe.tokensOut * 9_700n) / 10_000n;
  }
  const call = buildLaunchCall(input, ctx);
  if (creator) {
    const sim = await simulateLaunch(reader, call, creator);
    simulation = sim.ok
      ? { ran: true, ok: true, predictedToken: sim.token, tokensOut: sim.tokensOut === null ? undefined : sim.tokensOut.toString() }
      : { ran: true, ok: false, reason: sim.reason };
  }
  return {
    ok: simulation.ran ? simulation.ok === true : true,
    unsignedTransaction: { chainId: CHAIN.id, to: call.to, data: call.data, value: toHex(call.value), valueEth: Number(call.value) / 1e18 },
    via: call.via === "launchAndBuy" ? "launchAndBuy (create + opening buy in one transaction)" : "factory.launchToken",
    minTokensOut: input.minTokensOut?.toString() ?? null,
    simulation,
    terms,
    notes: [
      creator ? "Simulated from the creator wallet; a real send can still fail if Pons terms or the wallet balance change." : "Not simulated: give creator to simulate from that wallet.",
      "Unsigned. Sign it only in your own wallet, on Robinhood Chain (chain 4663).",
      `Coins launched from this raw transaction are not listed on ${BRAND.name}. To be listed, launch at ${BRAND.url}/app.`,
      "Memecoins are risky and most go to zero. Balle does not vet coins.",
    ],
  };
}

/** Handles one JSON-RPC message (or a notification, which gets no answer). */
export async function handleMcp(msg: Rpc, deps: McpDeps): Promise<Answer | null> {
  const id = msg.id ?? null;
  const reply = (result: unknown): Answer => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, message: string): Answer => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return error(-32600, "Invalid request.");
  // Notifications (no id) are accepted silently.
  if (msg.id === undefined) return null;
  const p = (msg.params ?? {}) as Record<string, unknown>;
  switch (msg.method) {
    case "initialize": {
      const asked = str(p.protocolVersion);
      return reply({
        protocolVersion: (MCP_PROTOCOLS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "balle", title: `${BRAND.name} launches`, version: "1.0.0" },
        instructions: `Read coins launched through ${BRAND.name} on ${CHAIN.name} and build unsigned Pons launch transactions. This server never signs or sends transactions.`,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = str(p.name);
      const args = (p.arguments && typeof p.arguments === "object" ? p.arguments : {}) as Record<string, unknown>;
      try {
        if (name === "list_launches") {
          const page = await deps.list(Number(args.offset ?? 0), Number(args.limit ?? 20));
          return reply(page ? text(page) : toolError("The launch registry is not configured on this site yet."));
        }
        if (name === "get_launch") {
          const token = str(args.token);
          if (!isAddress(token)) return reply(toolError("token must be 0x followed by 40 hex characters."));
          const launch = await deps.get(token);
          return reply(launch ? text(launch) : toolError("This token was not launched through Balle."));
        }
        if (name === "build_launch_draft") {
          if (!(await deps.allowBuild())) return reply(toolError("Too many launch drafts from this network. Try again in a minute."));
          const out = await buildLaunchDraft(args, deps.reader);
          return reply(text(out, !out.ok));
        }
        return error(-32602, `Unknown tool: ${name}`);
      } catch {
        return reply(toolError("Robinhood Chain could not be read right now. Try again in a moment."));
      }
    }
    default:
      return error(-32601, `Method not found: ${msg.method}`);
  }
}
