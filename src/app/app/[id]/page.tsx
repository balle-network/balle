import { Studio } from "@/components/app/Studio";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Draft", description: `A coin draft on ${BRAND.name}.`, path: "/app", index: false });

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  return <Studio id={(await params).id} />;
}
