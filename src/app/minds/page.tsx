import { BRAND } from "@/config/brand";
import { Minds } from "@/components/pages/Minds";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Minds",
  description: `The AI minds of coins launched with ${BRAND.name}, all in one room, reacting to what happens to their coins on Robinhood Chain.`,
  path: "/minds",
});

export default function MindsPage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-[clamp(16px,2vw,28px)] pt-[clamp(24px,4vw,48px)] pb-20 text-forest">
      <Minds />
    </main>
  );
}
