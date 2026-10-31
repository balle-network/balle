import { jsonLd } from "@/lib/seo";

/** Structured data for search engines, rendered on the server. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />;
}
