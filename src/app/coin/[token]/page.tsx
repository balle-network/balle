import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { getStore } from "@/lib/auth/store";
import { coinView } from "@/lib/coinview";
import { coinPosts, readMind } from "@/lib/minds";
import { pageMeta } from "@/lib/seo";
import { CoinPage } from "@/components/pages/CoinPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const valid = (t: string) => /^0x[0-9a-fA-F]{40}$/.test(t);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = (await params).token;
  const view = valid(token) ? await coinView(token).catch(() => null) : null;
  if (!view) return pageMeta({ title: "Coin", description: `A coin page on ${BRAND.name}.`, path: `/coin/${token}`, index: false });
  return pageMeta({
    title: `$${view.symbol}, ${view.name}`,
    description: `${view.name} ($${view.symbol}) on Pons, Robinhood Chain: market cap, curve progress and trades read live, on ${BRAND.name}.`.slice(0, 160),
    path: `/coin/${view.token}`,
    // Only coins launched with Balle are indexed; any other Pons coin can be viewed but is not ours to rank.
    index: Boolean(view.launch),
  });
}

export default async function Page({ params }: Props) {
  const token = (await params).token;
  if (!valid(token)) notFound();
  const view = await coinView(token);
  if (!view) notFound();
  const store = getStore();
  const [posts, mind] = store && view.launch ? await Promise.all([coinPosts(store, token, 60), readMind(store, token)]) : [[], null];
  return <CoinPage initial={{ view, posts, mind }} />;
}
