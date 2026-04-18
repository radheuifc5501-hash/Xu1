import { CHAIN_META, Chain } from './chainService';

export interface PriceInfo {
  usd: number;
  change24h: number; // percent, e.g. -2.35
}

// CoinGecko /simple/price is free and does not require an API key, but it
// is rate-limited to roughly 10-30 requests/minute per IP. We only ever
// issue one batched call here for all chains, so this is fine for a
// pull-to-refresh usage pattern.
export async function getPrices(chains: Chain[]): Promise<Record<Chain, PriceInfo>> {
  const ids = chains.map((c) => CHAIN_META[c].coingeckoId).join(',');
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${encodeURIComponent(ids)}` +
    `&vs_currencies=usd&include_24hr_change=true`;
  const out: Record<string, PriceInfo> = {};
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    for (const chain of chains) {
      const cg = CHAIN_META[chain].coingeckoId;
      out[chain] = {
        usd: Number(json[cg]?.usd ?? 0),
        change24h: Number(json[cg]?.usd_24h_change ?? 0),
      };
    }
  } catch {
    for (const chain of chains) out[chain] = { usd: 0, change24h: 0 };
  }
  return out as Record<Chain, PriceInfo>;
}
