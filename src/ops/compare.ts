import { VintedClient } from '../client/session.js';
import { searchSlim } from '../client/endpoints.js';
import { COUNTRIES, type Country, type Condition } from '../client/types.js';

export interface CountryStats {
  country: Country;
  itemCount: number;
  currency: string;
  avgPrice: number;
  medianPrice: number;
  stdDev: number;
  minPrice: number;
  maxPrice: number;
}

export interface CompareResult {
  query: string;
  countries: CountryStats[];
  bestBuyCountry: Country | null;
  bestSellCountry: Country | null;
  arbitrageSpreadPct: number;
  failed?: { country: Country; error: string }[];
}

function stdDev(xs: number[], avg: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((sum, x) => sum + (x - avg) ** 2, 0) / xs.length;
  return round(Math.sqrt(variance));
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function opCompare(
  client: VintedClient,
  input: {
    query: string;
    countries?: Country[];
    limit?: number;
    concurrency?: number;
    brandIds?: number[];
    categoryId?: number;
    sizeIds?: number[];
    colorIds?: number[];
    condition?: Condition[];
  },
): Promise<CompareResult> {
  if (!input.query?.trim()) throw new Error('query is required');
  const countries = [...new Set(input.countries ?? (['fr', 'de', 'it', 'es', 'nl', 'pl'] as Country[]))];
  for (const c of countries) {
    if (!COUNTRIES.includes(c)) throw new Error(`Unknown country: ${String(c)}`);
  }
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 20) || 20, 1), 96);
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, 6));

  const extra = Object.fromEntries(
    Object.entries({
      brandIds: input.brandIds,
      categoryId: input.categoryId,
      sizeIds: input.sizeIds,
      colorIds: input.colorIds,
      condition: input.condition,
    }).filter(([, v]) => v !== undefined),
  ) as Parameters<typeof searchSlim>[4];

  const failed: { country: Country; error: string }[] = [];
  const fetchOne = async (c: Country): Promise<CountryStats | null> => {
    try {
      const items = await searchSlim(client, input.query, c, limit, extra);
      if (!items.length) return null;
      const prices = items.map((i) => i.price);
      const avg = round(prices.reduce((a, b) => a + b, 0) / prices.length);
      return {
        country: c,
        itemCount: items.length,
        currency: items[0].currency,
        avgPrice: avg,
        medianPrice: round(median(prices)),
        stdDev: stdDev(prices, avg),
        minPrice: round(Math.min(...prices)),
        maxPrice: round(Math.max(...prices)),
      } satisfies CountryStats;
    } catch (e) {
      failed.push({ country: c, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  const results = await runWithConcurrency(countries, concurrency, fetchOne);
  const stats = results.filter((x): x is CountryStats => x !== null);
  if (!stats.length) {
    return {
      query: input.query, countries: [], bestBuyCountry: null, bestSellCountry: null, arbitrageSpreadPct: 0,
      ...(failed.length ? { failed } : {}),
    };
  }

  const byMedian = [...stats].sort((a, b) => a.medianPrice - b.medianPrice);
  const lo = byMedian[0];
  const hi = byMedian[byMedian.length - 1];
  const spread = lo.medianPrice > 0 ? ((hi.medianPrice - lo.medianPrice) / lo.medianPrice) * 100 : 0;

  return {
    query: input.query,
    countries: stats,
    bestBuyCountry: lo.country,
    bestSellCountry: hi.country,
    arbitrageSpreadPct: round(spread),
    ...(failed.length ? { failed } : {}),
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
