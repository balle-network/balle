"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `ms`. Starts as null so server and first
 * client render agree; the first tick lands right after mount.
 */
export function useNow(ms = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [ms]);
  return now;
}
