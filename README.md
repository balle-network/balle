# Balle

Balle is an AI coin creator on Robinhood Chain for people who have an idea, a joke or a post and want it to become a coin without doing every small job by hand: a name that is not someone else's brand, a ticker, art, a short story, an opening post and a launch transaction they can trust. You paste the idea, Balle drafts the coin with you in a chat, and your own wallet launches it on Pons. Balle never holds a key, never signs and never touches funds: it builds the Pons call, simulates it from your wallet, and lets your wallet send it.

Any Idea. Live Coin. Instant Launch. Paste an idea, a meme or a post. AI drafts the coin; your own wallet launches it on Pons.

## Read this before anything else

This repository is the working code behind https://balle.network.

- **What runs today.** Sign-in with an EVM wallet (one free `personal_sign` over an EIP-4361 message; nothing goes on chain), the studio (paste text, a link, an image, a PDF or a Word file; pick a direction; edit name, ticker, art, links, opening buy and fee wallet), My coins, the one-transaction launch on Pons, coin pages for any Pons coin, the Launches board (New / Trending / Graduated), the weekly race, minds, holder votes, a public read-only API (`/api/launches`) and a read-only MCP server (`/api/mcp`).
- **AI needs a key.** Drafting, art and minds call OpenRouter and only run when `OPENROUTER_API_KEY` is set. Without it the site says AI drafting is off, starts the draft from your own words with a fixed rule, asks you to upload your own image, and launching works the same. On 31 Oct 2026 the live site reported `ai: false`.
- **No contract of its own.** Balle deploys nothing. A launch without an opening buy calls the Pons factory `PonsV2LaunchFactory.launchToken` (`0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`); a launch with one calls Pons' own forwarder `PonsV2LaunchAndBuy.launchAndBuy` (`0xe33E9E479dF8802cb0866d5d05258bEc4cF62948`), which creates the coin and makes the buy in the same transaction with a floor of 97% of the simulated amount. Either way Pons records your wallet as the deployer and the creator fee recipient. A coin is listed only after the server reads the receipt and finds `TokenLaunched` from the Pons factory with your signed-in wallet as deployer.
- **What reads live data.** Coin pages, the board, the race, dev activity and the API's `curveState` read Robinhood Chain directly: the Pons launch record, curve reserves, the graduation threshold and the curve's trade logs. Graduated coins are priced through the Uniswap v4 quoter. ETH / USD comes from OKX public market data. On 31 Oct 2026 `/api/launches` listed 0 coins launched through Balle.
- **Planned, not built, and not claimed.** "Fees to holders" and "Mind treasury" are shown switched off: they would need a custodial contract, and none exists. The race names a leader but promises no prize; votes are advice to the creator and move no funds. Balle does not vet coins, most memecoins go to zero, and nothing here is a safety guarantee for any coin, a promise of value for $BALLE, or financial advice.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (home, studio, My coins, launches, race, minds, vote, coin page, token) and API routes (sign-in, drafts, chat, art, launch listing, coins, board, race, minds, votes, chain facts, public launches, MCP, read-only RPC relay). |
| `src/components/` | Interface components: header and footer, wallet dialog (EIP-6963, WalletConnect, wallet catalog), studio panel, launch button, coin pages. |
| `src/config/` | `brand.ts`: name, ticker, token address, links, chain, Pons addresses. Every brand value is read from here. |
| `src/lib/` | Launch rules and call building (`launch.ts`), receipt check before listing (`registry.ts`), public launch shapes (`launches-api.ts`), MCP tools (`mcp.ts`), chain reads (`chain/`), sign-in (`auth/`), AI client (`llm/`), safety rules, safe links, rate limits, and their unit tests. |
| `scripts/` | `sim-launch` (simulates both launch transactions on mainnet), `fork-check` (real sends on a local anvil fork), `scan-pairs`, the brand image builder and the test loader. |
| `public/` | Brand images, the race stage image and wallet logos. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
npm run lint
```

Launch transactions, without sending anything:

```
npm run sim-launch
```

It builds the plain launch and the launch with an opening buy, simulates both with `eth_call` against Robinhood Chain mainnet (with a balance override), and checks that an empty wallet is refused in plain words. Real sends need a local fork:

```
anvil --fork-url <archive RPC> --chain-id 4663 --port 8547
npm run fork-check -- http://127.0.0.1:8547
```

### What was checked for this snapshot

- 31 Oct 2026 (UTC), Node.js 25.8.2, npm 11.11.1: `npm run typecheck` exit 0; `npm test` 59 pass / 0 fail; `npm run lint` clean; `npm run build` succeeded with 17 static pages; `npm run sim-launch` against the publicnode endpoint at block 102,392,802: plain launch simulated (launch fee 0.0005 ETH), launch with a 0.005 ETH buy quoted 2,937,772 tokens and simulated, empty wallet refused.
- Live checks the same day: `GET https://balle.network/api/launches` answered `v: 1` with 0 items, `POST /api/mcp` `tools/list` returned the three tools, `/api/me` reported store and uploads configured and AI off.
- Not run for this snapshot: `fork-check` (it needs an archive RPC; it passed 17 of 17 on 8 Oct 2026 against an anvil fork) and the browser tests with an injected test wallet (they passed on 30 Oct 2026 and are not part of this repository).

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:4970. Everything works with no configuration: drafts are kept in `.local-data.json`, reads use the public Robinhood Chain endpoints. Without `OPENROUTER_API_KEY` (starts with `sk-or-v1-`) AI drafting, art and minds say they are off; without `PINATA_JWT` coins launch without art; without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the WalletConnect row says "Not configured on this site yet". To sign in on localhost, set `ALLOW_LOCALHOST_SIGNIN=1` (local runs only).

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| Balle | none: Balle deploys no contract | — |
| PonsV2LaunchFactory (Pons, not part of this repository) | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e) |
| PonsV2LaunchAndBuy (Pons' official forwarder) | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` | [Blockscout](https://robinhoodchain.blockscout.com/address/0xe33E9E479dF8802cb0866d5d05258bEc4cF62948) |

The factory's `launchTokenFor` accepts calls from its registered forwarder only (`factory.launchForwarder()` returned the address above when read on chain), so any router Balle deployed would become the deployer of your coin. That is why the wallet calls Pons directly. Other Pons and Uniswap addresses the code reads (meme hook, v4 quoter, universal router, Permit2) are in `src/config/brand.ts`.

## Verify a deployment

There is no Balle bytecode to compare. To check a launch instead, open the launch transaction on Blockscout and confirm that it was sent from your wallet to one of the two Pons addresses above and emitted `TokenLaunched` from the factory; the coin page links the transaction. To check that this code builds correct calls against the current Pons terms, run:

```
npm run sim-launch
```

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- **Robinhood Chain RPC** (the official endpoint, with https://robinhood-rpc.publicnode.com as fallback, or your own through `ROBINHOOD_RPC_URL`): Pons launch records, launch fee and economics, curve reserves and trade logs, token metadata, balances, the Uniswap v4 quoter, receipts. Token names, links and logos read from chain are treated as untrusted: only `https://` links (and `https://` or `ipfs://` logos) are shown or served. Public endpoints may refuse old log ranges, so trade books can be shorter on a local run.
- **Public launch API** (`GET /api/launches?offset&limit`, up to 50; `GET /api/launches/<token>`, 404 when not launched through Balle): JSON with `v: 1`, CORS open, rate limited per network and site-wide. `curveState` is read at request time (shared for 15 seconds per coin) and is `null` when the chain did not answer.
- **MCP** (`POST /api/mcp`, Streamable HTTP, stateless, batches of up to 10 messages): `list_launches`, `get_launch`, and `build_launch_draft`, which returns an unsigned transaction plus a simulation from `creator` when given. Nothing is ever signed or sent by the server; a coin launched from a raw MCP draft is not listed on Balle.
- **OKX public market data** (ETH-USDT ticker, no key): only to show chain amounts in dollars, cached 15 seconds. When it does not answer, the last value read is kept, or no dollar value is shown; every amount itself is read from the chain.
- **OpenRouter** (optional): drafting, art and minds, bounded by model price ceilings, site-wide hourly ceilings and per-wallet daily allowances.
- **Pinata** (optional): pins coin art to IPFS before launch; logos are read through `gateway.pinata.cloud` unless `IPFS_GATEWAY` is set.
- **Link reading**: pasted links are fetched over https only, with DNS pinning and private-address blocking; uploads are size-capped and re-encoded. Pasted material is treated as data, never as instructions.

## Token

$BALLE is the community token of Balle on Robinhood Chain. Contract address: announced on https://balle.network/token at launch; only trust the address shown there and posted by https://x.com/ballenetwork. The site itself does not need the token. It has no promised value. Any utility for $BALLE is planned, not live.

## Deploy your own

1. Import the repository into a Next.js host (framework preset Next.js, root `./`, Node.js 20 or newer).
2. Environment variables (names and formats only). A serverless host needs a store; everything else is optional:

| Variable | What it is for | Format |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Drafts, sessions, listings, votes and limits (required on serverless hosts) | https URL, token string |
| `OPENROUTER_API_KEY` | AI drafting, art and minds | starts with `sk-or-v1-` |
| `OPENROUTER_MODEL`, `OPENROUTER_IMAGE_MODEL` | Override the default models | OpenRouter model id |
| `LLM_CALLS_PER_HOUR`, `ART_CALLS_PER_HOUR`, `MIND_POSTS_PER_HOUR`, `TALK_CALLS_PER_HOUR` | Site-wide hourly ceilings on paid calls (defaults 120 / 30 / 12 / 40) | integer |
| `PINATA_JWT` | Pin coin art to IPFS before launch | JWT with `pinFileToIPFS` |
| `IPFS_GATEWAY` | Gateway used to read IPFS logos | `https://…/ipfs/` |
| `ROBINHOOD_RPC_URL` | Server reads from a private Robinhood Chain endpoint | https URL |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser endpoint (visible to everyone) | https URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect option in the wallet dialog | 32 hex characters |

`ALLOW_LOCALHOST_SIGNIN` is for local runs only; do not set it on a public host.

3. Point the domain at the host and put it in `src/config/brand.ts`. After the deploy, `/` answers 200, `/api/chain` returns JSON with a block number, `/api/me` shows which features are configured, and `/api/launches` returns `v: 1`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The API routes (sign-in, drafts, listing, the read-only RPC relay, the public launch API and MCP, and their limits), link reading, uploads and the launch transactions the site builds are in scope; wallets, RPC providers, explorers, OpenRouter, Pinata and the Pons contracts are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Wallet logos in `public/wallets/` belong to their projects and are used only to identify the wallet. The Host Grotesk, Martian Mono and Pixelify Sans typefaces are loaded through `next/font` under the SIL Open Font License. npm dependencies keep their own licenses. The Balle name, logo and artwork belong to the project and are not licensed for reuse as a brand.
