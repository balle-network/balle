"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";

/*
 * Wallet sign-in for the app. Connecting a wallet only shares an address;
 * signing in proves it is yours with one free signature, and the server
 * keeps a session cookie. The session counts only while the connected
 * wallet is the one that signed in.
 */

type Me = {
  wallet: string | null;
  configured: { store: boolean; ai: boolean; uploads: boolean };
  allowance: { messages: number; art: number };
  left?: { messages: number; art: number };
};

type AuthState = {
  me: Me | null;
  /** Signed in AND the connected wallet is that wallet. */
  signedIn: boolean;
  signing: boolean;
  error: string | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, signMessage } = useWallet();
  const [me, setMe] = useState<Me | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (res.ok) setMe((await res.json()) as Me);
    } catch {
      // Offline: keep the last known state.
    }
  }, []);

  useEffect(() => {
    let stop = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Me | null) => !stop && j && setMe(j))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return false;
    setSigning(true);
    setError(null);
    try {
      const c = await fetch("/api/auth/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
      const challenge = (await c.json()) as { message?: string; nonce?: string; error?: string };
      if (!c.ok || !challenge.message || !challenge.nonce) throw new Error(challenge.error ?? "Sign-in is not available right now.");
      const signature = await signMessage(challenge.message);
      const v = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, nonce: challenge.nonce, signature }) });
      const verified = (await v.json()) as { wallet?: string; error?: string };
      if (!v.ok) throw new Error(verified.error ?? "Sign-in failed.");
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      return false;
    } finally {
      setSigning(false);
    }
  }, [address, signMessage, refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await refresh();
  }, [refresh]);

  const signedIn = Boolean(me?.wallet && address && me.wallet === address.toLowerCase());
  const value = useMemo(() => ({ me, signedIn, signing, error, signIn, signOut, refresh }), [me, signedIn, signing, error, signIn, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
