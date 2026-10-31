"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/config/brand";
import { Mark } from "@/components/Mark";
import { useAuth } from "@/components/auth/AuthProvider";
import { NavWallet } from "@/components/wallet/WalletButton";

export const NAV = [
  { href: "/app", label: "New coin" },
  { href: "/launches", label: "Launches" },
  { href: "/race", label: "Race" },
  { href: "/minds", label: "Minds" },
  { href: "/vote", label: "Votes" },
];

const active = (path: string, href: string) => (href === "/app" ? path === "/app" || /^\/app\/(?!coins)/.test(path) : path.startsWith(href));

export function SiteHeader() {
  const path = usePathname() ?? "/";
  const { signedIn, signOut } = useAuth();
  const links = signedIn ? [...NAV, { href: "/app/coins", label: "My coins" }] : NAV;
  const items = links.map((n) => (
    <Link key={n.href} href={n.href} className="hdr-link" aria-current={active(path, n.href) ? "page" : undefined}>
      {n.label}
    </Link>
  ));
  const out = signedIn ? (
    <button type="button" onClick={signOut} className="hdr-signout hdr-link">
      Sign out
    </button>
  ) : null;
  return (
    <>
      <header className="hdr">
        <Link href="/" aria-label={`${BRAND.name} home`} className="hdr-brand">
          <Mark className="hdr-mark" />
          <span>balle</span>
        </Link>
        <nav aria-label="Main navigation" className="hdr-nav">
          {items}
          {out}
          <div className="hdr-wallet">
            <NavWallet />
          </div>
        </nav>
      </header>
      <nav aria-label="Main navigation" className="hdr-phone">
        {items}
        {out}
      </nav>
    </>
  );
}
