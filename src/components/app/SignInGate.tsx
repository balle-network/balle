"use client";

import { Mark } from "@/components/Mark";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { shortAddress } from "@/config/brand";

const BTN = "rounded-[3px] bg-forest px-5 py-3 text-[15px] font-semibold text-cream transition-transform active:scale-[0.97] disabled:opacity-60";

/** Shown instead of the app until the connected wallet has signed in. */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const { address, disconnect } = useWallet();
  const { open } = useWalletModal();
  const { me, signedIn, signing, signIn, error } = useAuth();
  if (signedIn) return <>{children}</>;
  const storeMissing = me && !me.configured.store;
  return (
    <main className="mx-auto flex min-h-[calc(100svh-90px)] w-full max-w-[640px] flex-col items-start justify-center gap-5 px-5 py-16 text-forest">
      <Mark className="size-12" size={48} />
      <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em] md:text-[52px]">Prove the wallet, then start.</h1>
      <p className="max-w-[36ch] text-[17px] leading-relaxed text-ash">
        One free signature shows this address is yours. Nothing goes on chain and nothing is spent.
      </p>
      {!address ? (
        <button type="button" onClick={open} className={BTN} data-testid="gate-connect">
          Connect wallet
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => signIn()} disabled={signing || Boolean(storeMissing)} className={BTN} data-testid="gate-sign">
            {signing ? "Check your wallet…" : `Sign in as ${shortAddress(address, 6, 4)}`}
          </button>
          <button type="button" onClick={disconnect} className="font-mono text-[11px] text-ash underline underline-offset-4 hover:text-forest">
            Use another wallet
          </button>
        </div>
      )}
      {storeMissing ? <p className="text-[14px] text-ash">Saving drafts is not configured on this site yet, so sign-in is closed for now.</p> : null}
      {error ? <p className="text-[14px] text-down">{error}</p> : null}
    </main>
  );
}
