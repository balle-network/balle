import type { Metadata, Viewport } from "next";
import { Host_Grotesk, Martian_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import { BRAND, CHAIN, hasGithub, hasX } from "@/config/brand";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { HOME_DESCRIPTION, HOME_TITLE, OG_IMAGE } from "@/lib/seo";

const grotesk = Host_Grotesk({ subsets: ["latin"], variable: "--font-host-grotesk", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });
const pixel = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixelify", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: HOME_TITLE, template: `%s | ${BRAND.name}` },
  description: HOME_DESCRIPTION,
  applicationName: BRAND.name,
  category: "technology",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: { type: "website", url: "/", siteName: BRAND.name, locale: "en_US", title: HOME_TITLE, description: HOME_DESCRIPTION, images: [OG_IMAGE] },
  twitter: {
    card: "summary_large_image",
    ...(hasX ? { site: BRAND.xHandle, creator: BRAND.xHandle } : {}),
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = { themeColor: "#073e32", viewportFit: "cover" };

const SAME_AS = ([hasX ? BRAND.x : null, hasGithub ? BRAND.github : null] as (string | null)[]).filter((v): v is string => Boolean(v));

const ORG = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BRAND.url}/#org`,
      name: BRAND.name,
      url: BRAND.url,
      logo: { "@type": "ImageObject", url: `${BRAND.url}/icon.png`, width: 512, height: 512 },
      ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
    },
    { "@type": "WebSite", "@id": `${BRAND.url}/#site`, name: BRAND.name, url: BRAND.url, description: HOME_DESCRIPTION, inLanguage: "en", publisher: { "@id": `${BRAND.url}/#org` } },
    {
      "@type": "WebApplication",
      "@id": `${BRAND.url}/#app`,
      name: BRAND.name,
      url: `${BRAND.url}/app`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web browser",
      description: `${BRAND.category} on ${CHAIN.name}: turn an idea, meme, link or tweet into a coin drafted by AI and launched on Pons with your wallet as the deployer.`,
      publisher: { "@id": `${BRAND.url}/#org` },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable} ${pixel.variable}`}>
      <body className="overflow-x-hidden">
        <JsonLd data={ORG} />
        <WalletProvider>
          <WalletModalProvider>
            <AuthProvider>
              <div className="frame">
                <a href="#content" className="skip">
                  Skip to content
                </a>
                <div className="sheet">
                  <SiteHeader />
                  <div id="content" className="flex min-w-0 flex-1 flex-col">
                    {children}
                  </div>
                </div>
              </div>
            </AuthProvider>
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
