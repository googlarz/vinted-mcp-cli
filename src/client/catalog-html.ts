import { DOMAIN, CONDITION_ID, type Country, type Item, type SearchParams } from './types.js';

// Vinted removed the JSON catalog endpoint (/api/v2/catalog/items → 404). The catalog page is now
// server-rendered with Next.js and embeds the result list in `self.__next_f.push([1,"..."])` chunks.

export const CATALOG_PAGE_SIZE = 96;

export interface CatalogPagination {
  currentPage: number;
  totalPages: number;
  totalEntries: number;
  perPage: number;
}

export interface CatalogPage {
  items: any[];
  pagination: CatalogPagination;
}

const FLIGHT_CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const ITEMS_MARKER = '"items":{"items":[';

export function buildCatalogPath(p: SearchParams): string {
  const qs = new URLSearchParams();
  if (p.query) qs.set('search_text', p.query);
  qs.set('page', String(p.page ?? 1));
  qs.set('order', p.sortBy ?? 'relevance');
  if (p.priceMin !== undefined) qs.set('price_from', String(p.priceMin));
  if (p.priceMax !== undefined) qs.set('price_to', String(p.priceMax));
  if (p.categoryId) qs.append('catalog[]', String(p.categoryId));
  for (const id of p.brandIds ?? []) qs.append('brand_ids[]', String(id));
  for (const id of p.sizeIds ?? []) qs.append('size_ids[]', String(id));
  for (const id of p.colorIds ?? []) qs.append('color_ids[]', String(id));
  for (const c of p.condition ?? []) qs.append('status_ids[]', String(CONDITION_ID[c]));
  return `/catalog?${qs.toString()}`;
}

export function parseCatalogHtml(html: string): CatalogPage {
  let flight = '';
  for (const m of html.matchAll(FLIGHT_CHUNK)) {
    try {
      flight += JSON.parse(m[1]) as string;
    } catch {
      // a malformed chunk cannot contain the list we are after; skip it
    }
  }

  const at = flight.indexOf(ITEMS_MARKER);
  if (at < 0) {
    throw new Error(
      'Vinted catalog page has no embedded item list. The page layout may have changed, or the request was blocked ' +
      '(try --proxy / VINTED_PROXY_URL).',
    );
  }

  const start = at + ITEMS_MARKER.length - 1;
  const end = matchingBracket(flight, start);
  if (end < 0) throw new Error('Vinted catalog page: item list is truncated.');
  const items = JSON.parse(flight.slice(start, end + 1)) as any[];

  let raw: Record<string, unknown> = {};
  const pgAt = flight.indexOf('"pagination":{', end);
  if (pgAt >= 0 && pgAt - end < 4000) {
    const open = pgAt + '"pagination":'.length;
    const close = matchingBracket(flight, open);
    if (close > 0) raw = JSON.parse(flight.slice(open, close + 1)) as Record<string, unknown>;
  }
  return {
    items,
    pagination: {
      currentPage: Number(raw.current_page ?? 1),
      totalPages: Number(raw.total_pages ?? 1),
      totalEntries: Number(raw.total_entries ?? items.length),
      perPage: Number(raw.per_page ?? CATALOG_PAGE_SIZE),
    },
  };
}

function matchingBracket(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// The RSC encoding writes JS `undefined` as the literal string "$undefined".
const defined = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '$undefined' && v !== '' ? v : undefined;

export function mapCatalogItem(entry: any, country: Country): Item {
  const p = entry.productItem ?? entry;
  const box = p.itemBox ?? {};
  const second = defined(box.secondLine);
  let size: string | undefined;
  let condition: string | undefined;
  if (second) {
    const parts = second.split(' · ');
    if (parts.length > 1) {
      size = parts[0];
      condition = parts.slice(1).join(' · ');
    } else {
      condition = parts[0];
    }
  }
  const path = String(p.url ?? `/items/${p.id ?? entry.id}`);
  return {
    id: Number(p.id ?? entry.id),
    title: String(p.title ?? ''),
    price: String(p.price?.amount ?? ''),
    currency: String(p.price?.currencyCode ?? ''),
    brand: defined(box.firstLine),
    size,
    condition,
    url: /^https?:/.test(path) ? path : `https://${DOMAIN[country]}${path.split('?')[0]}`,
    favouriteCount: typeof p.favouriteCount === 'number' ? p.favouriteCount : undefined,
    photoUrl: defined(p.photos?.[0]?.url) ?? defined(p.thumbnailUrl),
    seller: { id: Number(p.user?.id ?? 0), username: '' },
  };
}
