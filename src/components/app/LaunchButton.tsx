"use client";

import { useState } from "react";
import { zeroAddress } from "viem";
import { CHAIN, explorerTx } from "@/config/brand";
import type { PublicDraft } from "@/lib/drafts";
import { buildLaunchCall, inputProblems, randomSalt, readLaunchContext, simulateLaunch, type LaunchContext, type LaunchInput } from "@/lib/launch";
import { parseUnits, waitForReceipt } from "@/lib/pons";
import { rpc } from "@/lib/rpc";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";

const reader = <T,>(method: string, params: unknown[]) => rpc<T>(method, params);
// A launch used 3.55 million gas (3.69 million with an opening buy) on a fork of Robinhood Chain.
const GAS_LIMIT_GUESS = 4_000_000n;
const BUY_SLIPPAGE_BPS = 300n;
const BIG = "mt-3 w-full rounded-[3px] bg-ink py-3.5 text-[15px] font-semibold text-white transition-opacity active:scale-[0.99] disabled:opacity-35";

type Step = "idle" | "art" | "check" | "sign" | "mine" | "record";
const ORDER: Step[] = ["art", "check", "sign", "mine", "record"];
const LABEL: Record<Step, string> = {
  idle: "Launch coin",
  art: "Saving art to IPFS…",
  check: "Checking with Pons…",
  sign: "Confirm in your wallet…",
  mine: "Waiting for the block…",
  record: "Listing it on Balle…",
};

/**
 * The one transaction: read Pons' current terms, build the call, simulate it
 * from the wallet, then hand it to the wallet. Nothing is sent until the
 * simulation passes; the server lists the coin only after checking the
 * receipt itself.
 */
export function LaunchButton({ draft, ctx, onLaunched }: { draft: PublicDraft; ctx: LaunchContext | null; onLaunched: (d: PublicDraft) => void }) {
  const { address, chainId, onRobinhoodChain, switchNetwork, switching, sendTransaction, balance, refreshBalance } = useWallet();
  const { open } = useWalletModal();
  const { me } = useAuth();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  // Set when the coin is on chain but listing it on Balle has not gone through yet: listing can be retried without a new transaction.
  const [unlisted, setUnlisted] = useState<string | null>(null);

  if (!address) {
    return (
      <button type="button" className={BIG} onClick={open}>
        Connect wallet to launch
      </button>
    );
  }
  if (chainId !== null && !onRobinhoodChain) {
    return (
      <button type="button" className={BIG} onClick={switchNetwork} disabled={switching}>
        {switching ? "Confirm in wallet…" : `Switch to ${CHAIN.name}`}
      </button>
    );
  }

  const buy = draft.settings.pair === "eth" ? (parseUnits(draft.settings.buy || "0") ?? 0n) : 0n;
  const fee = ctx?.launchFee ?? 0n;
  const need = fee + buy;
  const have = balance === null ? null : parseUnits(balance);
  const short = have !== null && ctx !== null && have < need + need / 5n;
  const missing = !draft.coin.name || !draft.coin.ticker;

  const run = async () => {
    setError(null);
    setTx(null);
    try {
      let logo = "";
      if (draft.art.chosen && me?.configured.uploads) {
        setStep("art");
        const res = await fetch(`/api/drafts/${draft.id}/pin`, { method: "POST" });
        const j = (await res.json()) as { draft?: PublicDraft; error?: string };
        if (!res.ok || !j.draft?.art.pinned) throw new Error(j.error ?? "The art could not be saved to IPFS.");
        logo = j.draft.art.pinned.url;
      }
      setStep("check");
      const pairToken = draft.settings.pair === "eth" ? zeroAddress : draft.settings.pair;
      const fresh = await readLaunchContext(reader, address, pairToken);
      const s = draft.settings;
      const input: LaunchInput = {
        name: draft.coin.name,
        symbol: draft.coin.ticker,
        logo,
        // The tagline stays on Balle; Pons gets the story (or the tagline when there is no story).
        description: (draft.coin.description || draft.coin.tagline).slice(0, 2000),
        socials: { twitter: s.links.x, telegram: s.links.telegram, website: s.links.website },
        creator: address,
        feeRecipient: s.feeWallet || undefined,
        creatorTaxBps: s.creatorTaxBps,
        buyback: s.buyback,
        pairToken,
        exemptions: s.exemptions,
        buy,
        salt: randomSalt(),
      };
      const problems = inputProblems(input, fresh);
      if (problems.length) throw new Error(problems[0].message);
      if (buy > 0n) {
        // Quote the opening buy by simulating the exact launch with a floor of 1, then keep 97% of it.
        const probe = await simulateLaunch(reader, buildLaunchCall({ ...input, minTokensOut: 1n }, fresh), address);
        if (!probe.ok) throw new Error(probe.reason);
        if (!probe.tokensOut || probe.tokensOut <= 0n) throw new Error("Pons quoted no tokens for that opening buy.");
        input.minTokensOut = (probe.tokensOut * (10_000n - BUY_SLIPPAGE_BPS)) / 10_000n;
      }
      const call = buildLaunchCall(input, fresh);
      const sim = await simulateLaunch(reader, call, address);
      if (!sim.ok) throw new Error(sim.reason);
      setStep("sign");
      const hash = await sendTransaction({ to: call.to, data: call.data, value: call.value });
      setTx(hash);
      setStep("mine");
      await waitForReceipt(hash);
      refreshBalance();
      setUnlisted(hash);
      await list(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The launch did not go through.");
      setStep("idle");
    }
  };

  /** Asks the server to check the confirmed transaction on chain and list the coin. */
  async function list(hash: string) {
    setStep("record");
    setError(null);
    try {
      let recorded: PublicDraft | null = null;
      for (let i = 0; i < 6 && !recorded; i++) {
        const res = await fetch(`/api/drafts/${draft.id}/launched`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash }) });
        const j = (await res.json().catch(() => ({}))) as { draft?: PublicDraft; error?: string };
        if (res.ok && j.draft) recorded = j.draft;
        else if (res.status !== 409 && res.status < 500) throw new Error(j.error ?? "The coin is live on chain, but listing it on Balle failed.");
        else await new Promise((r) => setTimeout(r, 2500));
      }
      if (!recorded) throw new Error("Your coin is live on chain. Listing it on Balle is still waiting for the chain; try again in a minute.");
      setUnlisted(null);
      onLaunched(recorded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Listing did not go through.");
    }
    setStep("idle");
  }

  const at = ORDER.indexOf(step);
  return (
    <div>
      {unlisted && step === "idle" ? (
        <button type="button" className={BIG} onClick={() => list(unlisted)} data-testid="list-again">
          Coin is live: list it on Balle
        </button>
      ) : (
        <button type="button" className={BIG} onClick={run} disabled={step !== "idle" || missing || !ctx || short} data-testid="launch">
          {missing ? "Pick a name and ticker first" : short ? "Add ETH to launch" : LABEL[step]}
        </button>
      )}
      {at >= 0 ? (
        <ol className="mt-2.5 flex justify-center gap-1.5" aria-label={`Step ${at + 1} of ${ORDER.length}: ${LABEL[step]}`}>
          {ORDER.map((s, i) => (
            <li key={s} className={`h-1 w-6 rounded-full ${i <= at ? "bg-ink" : "bg-line"}`} />
          ))}
        </ol>
      ) : null}
      {short ? (
        <p className="mt-2.5 text-center text-[13px] leading-snug" role="note">
          This needs about {(Number(need) / 1e18).toFixed(4)} ETH plus a little gas on {CHAIN.name}, and the wallet holds {balance} ETH. Send ETH on {CHAIN.name} to this wallet first.
        </p>
      ) : (
        <p className="mt-2.5 text-center font-mono text-[11px] leading-relaxed text-ash">Gas is a small extra (about {GAS_LIMIT_GUESS / 1_000_000n} million gas at the current price), shown by your wallet before you confirm.</p>
      )}
      {tx ? (
        <a href={explorerTx(tx)} target="_blank" rel="noreferrer" className="mt-2 block text-center font-mono text-[11px] underline underline-offset-2">
          Transaction on Blockscout
        </a>
      ) : null}
      {error ? (
        <p className="mt-2 text-center text-[13px] text-down" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
