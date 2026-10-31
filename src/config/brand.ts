// Single place to change project identity. Everything on the site reads from here.
// To publish the real contract address, replace the value of CA below. The
// navbar copy button, the footer, the token page and every explorer link
// derive from it. Anything that is not a 0x + 40 hex address is treated as
// "not launched yet".

const CA = "0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

export const isAddress = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v);

// Set to true once the domain is attached in Vercel and resolves: production *.vercel.app then redirects to it.
// While false, every *.vercel.app host serves the site and is marked noindex.
export const DOMAIN_LIVE = true;

export const BRAND = {
  name: "Balle",
  ticker: "BALLE",
  symbol: "$BALLE",
  domain: "balle.network",
  url: "https://balle.network",
  slogan: "Any Idea. Live Coin. Instant Launch.",
  tagline: "Paste idea, meme, or tweet. AI drafts coin (name, ticker, art, post). Customize in chat. Launch in seconds.",
  category: "AI coin creator",
  chainName: "Robinhood Chain",
  description:
    "Balle is an AI coin creator on Robinhood Chain. Paste an idea, a meme or a tweet; it writes the name and ticker, draws the art, pens the opening post, and your wallet launches it on Pons.",
  x: "https://x.com/ballenetwork",
  xHandle: "@ballenetwork",
  // Public source repository (MIT).
  github: "https://github.com/balle-network/balle",
  ca: CA,
} as const;

/** True once BRAND.github points at an actual repository. */
export const hasGithub = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(BRAND.github);
/** True once BRAND.x points at an actual profile. */
export const hasX = /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/.test(BRAND.x);

// Public endpoints are the default. An operator can point the site at a
// private RPC with ROBINHOOD_RPC_URL (server) / NEXT_PUBLIC_ROBINHOOD_RPC_URL
// (browser). Both are optional.
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

export const CHAIN = {
  id: 4663,
  hex: "0x1237",
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  decimals: 18,
  publicRpc: PUBLIC_RPC,
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC,
  /** Second public endpoint, used for reads only when the first one fails. */
  fallbackRpc: "https://robinhood-rpc.publicnode.com",
  explorer: "https://robinhoodchain.blockscout.com",
} as const;

/** RPC for server code: the private endpoint when set, else the public one. */
export function serverRpc() {
  return process.env.ROBINHOOD_RPC_URL || process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || PUBLIC_RPC;
}

export const TOKEN = {
  get isLive() {
    return isAddress(BRAND.ca);
  },
  get explorerUrl() {
    return isAddress(BRAND.ca) ? explorerToken(BRAND.ca) : null;
  },
};

/**
 * Pons V2 on Robinhood Chain. Every address was read live on 8 Oct 2026:
 * factory.launchForwarder() returned the LaunchAndBuy address below, and
 * launchTokenFor() on the factory accepts calls from that forwarder only,
 * which is why Balle has no contract of its own between the wallet and Pons
 * (see the project notes).
 */
export const PONS = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  launchAndBuy: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  memeHook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
  v4Quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  universalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  /** Launch config the public Pons form uses (the only one on 8 Oct 2026). */
  launchConfigId: 0n,
  /** Public launch page for a token. */
  page: (token: string) => `https://www.ponsfamily.com/launchpad/${token}`,
} as const;

/**
 * The weekly race. The brief does not set a prize; while `prize` is empty
 * the site ranks coins and names the leader but promises nothing.
 */
export const RACE = {
  prize: "",
  /** Week closes Sunday 23:59:59 UTC. */
  closesUtcDay: 0,
} as const;

export function explorerAddress(address: string) {
  return `${CHAIN.explorer}/address/${address}`;
}
export function explorerToken(address: string) {
  return `${CHAIN.explorer}/token/${address}`;
}
export function explorerTx(hash: string) {
  return `${CHAIN.explorer}/tx/${hash}`;
}
export function shortAddress(address: string, head = 6, tail = 4) {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
