import type { CSSProperties } from "react";

/**
 * The Balle mark: the owner's final logo (31 Oct 2026), a stepped B. public/brand/mark.webp
 * (built by scripts/apply-owner-assets.mjs) is drawn as a CSS mask filled with currentColor,
 * so the mark follows the text colour of wherever it sits, like the SVG it replaced.
 */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={`brand-mark ${className}`} style={{ "--mark-size": `${size}px` } as CSSProperties} />;
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <Mark size={size + 6} />
      <span className="font-semibold tracking-[-0.045em]" style={{ fontSize: size }}>
        balle
      </span>
    </span>
  );
}
