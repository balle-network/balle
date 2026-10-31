import { BRAND } from "@/config/brand";
import { Votes } from "@/components/pages/Votes";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Votes",
  description: `Holders of coins launched with ${BRAND.name} tell the creator what to do with the creator fees: burn them, buy the coin back, hand them out, or keep them.`,
  path: "/vote",
});

export default function VotePage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-[clamp(16px,2vw,28px)] pt-[clamp(24px,4vw,40px)] pb-20">
      <div className="text-forest">
        <h1 className="text-[34px] leading-none font-extrabold tracking-[-0.035em] md:text-[56px]">Votes</h1>
        <p className="mt-3 max-w-[560px] text-[15px] text-forest-2">
          Creators ask the people holding their coin where the fee share should go: burn it, buy back, airdrop it, or keep it. Holders answer with their balance.
        </p>
        <Votes />
      </div>
    </main>
  );
}
