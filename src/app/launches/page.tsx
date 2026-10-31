import { BRAND } from "@/config/brand";
import { Launches } from "@/components/pages/Launches";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Launches",
  description: `Every coin launched with ${BRAND.name} on Pons, with market cap, volume and curve progress read live from Robinhood Chain.`,
  path: "/launches",
});

export default function LaunchesPage() {
  return (
    <main className="px-[clamp(16px,2vw,28px)] pt-[clamp(16px,2vw,28px)] pb-20 text-forest">
      <h1 className="sr-only">Launches</h1>
      <Launches />
    </main>
  );
}
