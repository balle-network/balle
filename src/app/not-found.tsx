import Link from "next/link";
import { Mark } from "@/components/Mark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-90px)] w-full max-w-[640px] flex-col items-start justify-center gap-5 px-5 py-16 text-forest">
      <Mark size={48} className="size-12" />
      <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-0.03em] md:text-[52px]">This page bounced off.</h1>
      <p className="max-w-[36ch] text-[17px] leading-relaxed text-ash">Nothing lives at this address.</p>
      <Link href="/" className="rounded-[3px] bg-forest px-5 py-3 text-[15px] font-semibold text-cream">
        Back home
      </Link>
    </main>
  );
}
