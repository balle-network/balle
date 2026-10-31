import { NewCoin } from "@/components/app/NewCoin";
import { SignInGate } from "@/components/app/SignInGate";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "New coin",
  description: `Start a coin on ${BRAND.name}: connect a wallet and sign once, describe the idea or paste a post, and the AI drafts it.`,
  path: "/app",
  index: false,
});

export default function AppPage() {
  return (
    <SignInGate>
      <NewCoin />
    </SignInGate>
  );
}
