import { VintedClient } from '../client/session.js';
import type { SearchParams, SearchResult } from '../client/types.js';
import { opSearch } from './search.js';

export interface NewItemsResult extends SearchResult {
  /** Highest item ID seen; pass it as `afterId` on the next poll. */
  latestId?: number;
  /** True when every inspected item was newer than `afterId`: more may have arrived than `perPage` covers. */
  truncated?: boolean;
}

/**
 * Newest-first listings, optionally only those with an ID above `afterId`.
 * Vinted item IDs grow with listing time and the catalog exposes no timestamps,
 * so an ID cursor is the reliable way to detect new arrivals between polls.
 */
export async function opGetNewItems(
  client: VintedClient,
  p: Omit<SearchParams, 'sortBy'> & { afterId?: number },
): Promise<NewItemsResult> {
  const { afterId, ...search } = p;
  const r = await opSearch(client, { ...search, sortBy: 'newest_first', perPage: search.perPage ?? 50, noCache: true });
  const items = afterId === undefined ? r.items : r.items.filter((i) => i.id > afterId);
  const latestId = r.items.reduce<number | undefined>((max, i) => (max === undefined || i.id > max ? i.id : max), undefined);
  const truncated = afterId !== undefined && r.items.length > 0 && items.length === r.items.length;
  return { totalCount: items.length, page: r.page, items, latestId, ...(truncated ? { truncated } : {}) };
}
