import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

const ROUTES = ["/", "/launches", "/race", "/minds", "/vote", "/token"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((path) => ({ url: `${BRAND.url}${path === "/" ? "" : path}`, lastModified: now, changeFrequency: path === "/" ? "weekly" : "daily", priority: path === "/" ? 1 : 0.6 }));
}
