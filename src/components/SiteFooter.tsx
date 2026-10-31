import Link from "next/link";
import { BRAND, hasGithub, hasX } from "@/config/brand";
import { Mark } from "@/components/Mark";

/** The quiet sign-off at the end of coin and token pages. */
export function MadeWith({ className = "mt-10" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[12px] text-forest-3 ${className}`}>
      <Link href="/" className="inline-flex items-center gap-2 transition-colors hover:text-forest">
        <Mark size={16} className="size-4 text-forest" />
        Built on {BRAND.name}
      </Link>
      {hasX ? (
        <a href={BRAND.x} target="_blank" rel="noreferrer" className="transition-colors hover:text-forest">
          {BRAND.xHandle} on X ↗
        </a>
      ) : null}
      {hasGithub ? (
        <a href={BRAND.github} target="_blank" rel="noreferrer" className="transition-colors hover:text-forest">
          Source on GitHub ↗
        </a>
      ) : null}
    </p>
  );
}
