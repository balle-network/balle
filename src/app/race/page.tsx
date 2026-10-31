import { BRAND } from "@/config/brand";
import { Race } from "@/components/pages/Race";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Weekly race",
  description: `The ${BRAND.name} weekly race ranks every coin launched here that week by the ETH traded on its Pons curve, counted from chain.`,
  path: "/race",
});

export default function RacePage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-[clamp(16px,2vw,28px)] pt-[clamp(24px,4vw,40px)] pb-20 text-forest">
      <Race />
    </main>
  );
}
