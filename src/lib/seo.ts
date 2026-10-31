import type { Metadata } from "next";
import { BRAND, CHAIN, hasX } from "@/config/brand";

/** Social card generated from src/app/opengraph-image.jpg (1200 x 630). */
export const OG_IMAGE = {
  url: "/opengraph-image.jpg",
  width: 1200,
  height: 630,
  alt: `${BRAND.name}: ${BRAND.slogan} An AI coin creator on ${CHAIN.name}.`,
};

export const HOME_TITLE = `${BRAND.name} | ${BRAND.slogan}`;
export const HOME_DESCRIPTION = `${BRAND.name} is an AI coin creator on ${CHAIN.name}. Paste a meme, tweet or idea; AI names it, draws it and writes the post; your wallet launches it on Pons.`;

/**
 * Per-route metadata: one short title ("Race | Balle"), one description
 * naming the brand once, a canonical path and matching Open Graph / X cards.
 * `index: false` keeps app and account views out of search results.
 */
export function pageMeta({ title, description, path, index = true }: { title: string; description: string; path: string; index?: boolean }): Metadata {
  const full = `${title} | ${BRAND.name}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", url: path, siteName: BRAND.name, title: full, description, locale: "en_US", images: [OG_IMAGE] },
    twitter: {
      card: "summary_large_image",
      ...(hasX ? { site: BRAND.xHandle, creator: BRAND.xHandle } : {}),
      title: full,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

/** Serialises JSON-LD safely for a <script> tag (no closing-tag injection). */
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
