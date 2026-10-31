export function XGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.8 2.5h3.1l-6.8 7.8 8 10.6h-6.3l-4.9-6.4-5.6 6.4H2.2l7.3-8.3L1.8 2.5h6.4l4.4 5.9 5.2-5.9Zm-1.1 16.5h1.7L7.4 4.3H5.6L16.7 19Z" />
    </svg>
  );
}

/** Only https, ipfs:// (through a public gateway) and our own /api/art/ paths are shown. */
export function safeArt(src?: string | null) {
  // ipfs:// links and the retired ipfs.io / dweb.link path gateways go through a gateway that still serves files.
  const ipfs = src?.match(/^ipfs:\/\/([A-Za-z0-9]{40,100})$/)?.[1] ?? src?.match(/^https:\/\/(?:ipfs\.io|dweb\.link)\/ipfs\/([A-Za-z0-9]{40,100})$/)?.[1];
  return ipfs ? `https://gateway.pinata.cloud/ipfs/${ipfs}` : src && /^https:\/\//.test(src) ? src : src && /^\/api\/art\//.test(src) ? src : null;
}

const initials = (name: string) => (name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";

/** Square coin art, or a forest tile with the ticker's first letters. */
export function CoinArt({ src, name, size = 40, className = "" }: { src?: string | null; name: string; size?: number; className?: string }) {
  const safe = safeArt(src);
  if (safe) {
    // Plain <img>: next/image leaves small remote icons blank on some gateways.
    return <img src={safe} alt={`${name} coin art`} width={size} height={size} loading="lazy" className={`shrink-0 rounded-[3px] border border-rule bg-cream object-cover ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-[3px] bg-forest font-pixel text-lime ${className}`} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

/** Round avatar for minds; size comes from the class (size-8, size-10…). */
export function Avatar({ src, name, className = "size-10" }: { src?: string | null; name: string; className?: string }) {
  const safe = safeArt(src);
  if (safe) return <img src={safe} alt="" loading="lazy" className={`shrink-0 rounded-full object-cover ${className}`} />;
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-forest font-pixel text-[12px] text-lime ${className}`}>
      {initials(name)}
    </span>
  );
}

/** Empty state card. */
export function Empty({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`rounded-[4px] border border-rule bg-card px-5 py-10 text-center text-[15px] text-forest-2 ${className}`}>{children}</p>;
}
