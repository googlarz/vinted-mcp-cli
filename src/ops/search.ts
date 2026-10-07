import { VintedClient } from '../client/session.js';
import { searchItems } from '../client/endpoints.js';
import { CATALOG_PAGE_SIZE } from '../client/catalog-html.js';
import type { SearchParams, SearchResult } from '../client/types.js';

export async function opSearch(client: VintedClient, p: SearchParams): Promise<SearchResult> {
  if (!p.query?.trim()) throw new Error('query is required');
  return searchItems(client, p);
}

export async function opSearchAll(
  client: VintedClient,
  p: SearchParams & { maxItems?: number; maxPages?: number },
): Promise<SearchResult> {
  if (!p.query?.trim()) throw new Error('query is required');
  // Always take whole pages: perPage only truncates, which would silently skip items here.
  const perPage = CATALOG_PAGE_SIZE;
  const maxItems = clamp(p.maxItems ?? 1000, 1, 1000);
  const maxPages = clamp(p.maxPages ?? 25, 1, 25);
  const PREFETCH = 3; // pages to keep in-flight concurrently

  const seen = new Set<number>();
  const items: SearchResult['items'] = [];
  const startPage = p.page ?? 1;
  let nextPage = startPage;
  let totalCount = 0;

  // Sliding window of in-flight page requests
  const pending: Array<Promise<SearchResult>> = [];

  const enqueue = () => {
    while (pending.length < PREFETCH && nextPage - startPage < maxPages && items.length < maxItems) {
      const req = searchItems(client, { ...p, perPage, page: nextPage++ });
      req.catch(() => {}); // a prefetched page we never await must not become an unhandled rejection
      pending.push(req);
    }
  };

  enqueue();

  while (pending.length > 0) {
    const r = await pending.shift()!;
    if (r.totalCount > totalCount) totalCount = r.totalCount;
    if (!r.items.length) {
      pending.length = 0; // drain: no point fetching further pages
      break;
    }

    let added = 0;
    for (const it of r.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
      added++;
      if (items.length >= maxItems) break;
    }
    if (items.length >= maxItems || added === 0) {
      pending.length = 0; // hit limit or end of stream — discard remaining in-flight
      break;
    }

    enqueue(); // top up the window
  }

  return { totalCount: totalCount || items.length, page: startPage, items };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Number.isFinite(n) ? n : hi, lo), hi);
}
