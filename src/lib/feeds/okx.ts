import "server-only";

/*
 * ETH/USD from OKX public market data (no key). Used only to show chain
 * amounts in dollars; every amount itself is read from Robinhood Chain.
 */

const BASE = "https://www.okx.com/api/v5/market";

export type Ticker = { last: number; open24h: number; change24h: number | null };
const tickers = new Map<string, { at: number; value: Ticker }>();

export async function ticker(inst = "ETH-USDT"): Promise<Ticker | null> {
  const hit = tickers.get(inst);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  for (let n = 0; n < 3; n++) {
    try {
      const res = await fetch(`${BASE}/ticker?instId=${inst}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`OKX ${res.status}`);
      const body = (await res.json()) as { code: string; data?: { last: string; open24h: string }[] };
      const row = body.data?.[0];
      const last = Number(row?.last);
      const open24h = Number(row?.open24h);
      if (body.code !== "0" || !Number.isFinite(last) || last <= 0) throw new Error("OKX error");
      const value = { last, open24h, change24h: open24h > 0 ? ((last - open24h) / open24h) * 100 : null };
      tickers.set(inst, { at: Date.now(), value });
      return value;
    } catch {
      // This network drops the odd connection: retry network errors too.
      await new Promise((r) => setTimeout(r, 200 * (n + 1)));
    }
  }
  return hit?.value ?? null;
}
