import { MyCoins } from "@/components/app/MyCoins";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "My coins", description: `Your drafts and launches on ${BRAND.name}.`, path: "/app/coins", index: false });

export default function MyCoinsPage() {
  return <MyCoins />;
}
