import {
  CONDITION_ID, DOMAIN, SORT_VALUE,
  type Country, type Item, type ItemDetail, type SearchParams, type SearchResult, type Seller, type CategoryHit,
} from './types.js';
import { VintedClient } from './session.js';

function buildSearchPath(p: SearchParams): string {
  const qs = new URLSearchParams();
  qs.set('search_text', p.query);
  qs.set('page', String(p.page ?? 1));
  qs.set('per_page', String(Math.min(p.perPage ?? 20, 100)));
  qs.set('order', SORT_VALUE[p.sortBy ?? 'relevance']);
  if (p.priceMin !== undefined) qs.set('price_from', String(p.priceMin));
  if (p.priceMax !== undefined) qs.set('price_to', String(p.priceMax));
  if (p.categoryId) qs.set('catalog_ids', String(p.categoryId));
  if (p.brandIds?.length) qs.set('brand_ids', p.brandIds.join(','));
  if (p.sizeIds?.length) qs.set('size_ids', p.sizeIds.join(','));
  if (p.colorIds?.length) qs.set('color_ids', p.colorIds.join(','));
  if (p.condition?.length) {
    qs.set('status_ids', p.condition.map((c) => CONDITION_ID[c]).join(','));
  }
  if (p.dateFrom) qs.set('date_from', new Date(p.dateFrom).toISOString());
  if (p.dateTo) qs.set('date_to', new Date(p.dateTo).toISOString());
  return `/api/v2/catalog/items?${qs.toString()}`;
}

export async function searchItems(client: VintedClient, p: SearchParams): Promise<SearchResult> {
  const country = p.country ?? 'fr';
  const data = await client.apiGet<{
    items: any[];
    pagination?: { total_entries?: number };
  }>(country, buildSearchPath(p));

  const items: Item[] = (data.items ?? []).map((i) => ({
    id: Number(i.id),
    title: String(i.title ?? ''),
    price: String(i.price?.amount ?? i.price ?? ''),
    currency: String(i.price?.currency_code ?? i.currency ?? ''),
    brand: i.brand_title ?? i.brand,
    size: i.size_title ?? i.size,
    condition: i.status,
    url: i.url ?? `https://${DOMAIN[country]}/items/${i.id}`,
    favouriteCount: i.favourite_count,
    photoUrl: i.photo?.url ?? i.photos?.[0]?.url,
    seller: {
      id: Number(i.user?.id ?? 0),
      username: String(i.user?.login ?? i.user?.username ?? ''),
    },
  }));

  return {
    totalCount: data.pagination?.total_entries ?? items.length,
    page: p.page ?? 1,
    items,
  };
}

export async function getItem(
  client: VintedClient,
  itemId: number,
  country: Country = 'fr',
): Promise<ItemDetail> {
  try {
    const data = await client.apiGet<{ item: any }>(country, `/api/v2/items/${itemId}/details`);
    const i = data.item ?? data;
    return {
      id: Number(i.id),
      title: String(i.title ?? ''),
      price: String(i.price?.amount ?? i.price ?? ''),
      currency: String(i.price?.currency_code ?? i.currency ?? ''),
      brand: i.brand_dto?.title ?? i.brand,
      size: i.size_title ?? i.size,
      condition: i.status,
      description: i.description,
      photos: (i.photos ?? []).map((p: any) => p.full_size_url ?? p.url).filter(Boolean),
      createdAt: i.created_at_ts ?? i.created_at,
      url: i.url ?? `https://${DOMAIN[country]}/items/${itemId}`,
      favouriteCount: i.favourite_count,
      seller: {
        id: Number(i.user?.id ?? 0),
        username: String(i.user?.login ?? i.user?.username ?? ''),
      },
      raw: i,
    };
  } catch (err) {
    return getItemFromHtml(client, itemId, country, err);
  }
}

async function getItemFromHtml(
  client: VintedClient,
  itemId: number,
  country: Country,
  apiErr: unknown,
): Promise<ItemDetail> {
  const url = `https://${DOMAIN[country]}/items/${itemId}`;
  const { status, body } = await client.fetchHtml(url);
  if (status >= 400) {
    const apiMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    throw new Error(`Item ${itemId}: API failed (${apiMsg}); HTML fallback returned ${status}.`);
  }
  const ldMatch = body.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (!ldMatch) throw new Error(`Item ${itemId}: no JSON-LD on page`);
  const ld = JSON.parse(ldMatch[1]);

  // Scrape seller id + username from member links in HTML
  let sellerUsername = '';
  let sellerId = 0;
  const sellerMatch = body.match(/\/member\/(\d+)-([^"'/?&#\s]+)/);
  if (sellerMatch) {
    sellerId = Number(sellerMatch[1]);
    sellerUsername = sellerMatch[2];
  }

  return {
    id: itemId,
    title: String(ld.name ?? ''),
    price: String(ld.offers?.price ?? ''),
    currency: String(ld.offers?.priceCurrency ?? ''),
    brand: ld.brand?.name,
    condition: ld.offers?.itemCondition?.replace(/.*\//, '').replace(/Condition$/, ''),
    description: ld.description,
    photos: ld.image ? (Array.isArray(ld.image) ? ld.image : [ld.image]) : [],
    url: ld.offers?.url ?? url,
    seller: { id: sellerId, username: sellerUsername },
    raw: { source: 'html-jsonld', ld },
  };
}

export async function getSeller(
  client: VintedClient,
  sellerId: number,
  country: Country = 'fr',
): Promise<Seller> {
  const data = await client.apiGet<{ user: any }>(country, `/api/v2/users/${sellerId}`);
  const u = data.user ?? data;
  return {
    id: Number(u.id),
    username: String(u.login ?? u.username ?? ''),
    itemCount: u.item_count,
    feedbackReputation: u.feedback_reputation,
    feedbackCount: u.feedback_count,
    countryCode: u.country_code,
    profileUrl: `https://${DOMAIN[country]}/member/${u.id}`,
    raw: u,
  };
}

export interface FeedbackEntry {
  id: number;
  createdAt: string;
  feedback: string;
  rating: number;          // 1–5 stars
  feedbackRate: number;    // 1=negative 2=neutral 3=positive
  itemId: number | null;
  fromUsername: string;
  fromUserId: number;
  isSystem: boolean;
}

export interface FeedbackResult {
  totalCount: number;
  page: number;
  totalPages: number;
  entries: FeedbackEntry[];
}

export async function getSellerFeedback(
  client: VintedClient,
  userId: number,
  country: Country = 'fr',
  perPage = 20,
  page = 1,
): Promise<FeedbackResult> {
  const qs = new URLSearchParams({
    user_id: String(userId),
    per_page: String(Math.min(perPage, 100)),
    page: String(page),
  });
  const data = await client.apiGet<{
    user_feedbacks?: any[];
    pagination?: { total_entries?: number; total_pages?: number; current_page?: number };
  }>(country, `/api/v2/feedbacks?${qs.toString()}`);

  const entries: FeedbackEntry[] = (data.user_feedbacks ?? []).map((f) => ({
    id: Number(f.id),
    createdAt: String(f.created_at_ts ?? f.created_at ?? ''),
    feedback: String(f.feedback ?? ''),
    rating: Number(f.rating ?? 0),
    feedbackRate: Number(f.feedback_rate ?? 0),
    itemId: f.item_id != null ? Number(f.item_id) : null,
    fromUsername: String(f.user?.login ?? f.comment?.user?.login ?? ''),
    fromUserId: Number(f.feedback_user_id ?? 0),
    isSystem: Boolean(f.system_feedback),
  }));

  return {
    totalCount: data.pagination?.total_entries ?? entries.length,
    page: data.pagination?.current_page ?? page,
    totalPages: data.pagination?.total_pages ?? 1,
    entries,
  };
}

export async function getSellerItems(
  client: VintedClient,
  sellerId: number,
  country: Country = 'fr',
  perPage = 20,
  page = 1,
): Promise<SearchResult> {
  const qs = new URLSearchParams();
  qs.set('seller_id', String(sellerId));
  qs.set('per_page', String(Math.min(perPage, 100)));
  qs.set('page', String(page));
  qs.set('order', 'newest_first');
  const data = await client.apiGet<{ items: any[]; pagination?: { total_entries?: number } }>(
    country,
    `/api/v2/catalog/items?${qs.toString()}`,
  );
  const items: Item[] = (data.items ?? []).map((i) => ({
    id: Number(i.id),
    title: String(i.title ?? ''),
    price: String(i.price?.amount ?? i.price ?? ''),
    currency: String(i.price?.currency_code ?? i.currency ?? ''),
    brand: i.brand_title ?? i.brand,
    size: i.size_title ?? i.size,
    condition: i.status,
    url: i.url ?? `https://${DOMAIN[country]}/items/${i.id}`,
    favouriteCount: i.favourite_count,
    photoUrl: i.photo?.url ?? i.photos?.[0]?.url,
    seller: { id: sellerId, username: String(i.user?.login ?? '') },
  }));
  return { totalCount: data.pagination?.total_entries ?? items.length, page, items };
}

const STATIC_TTL_MS = 60 * 60 * 1000; // 1 hour — categories rarely change

export async function getCategories(
  client: VintedClient,
  country: Country = 'fr',
): Promise<CategoryHit[]> {
  const data = await client.apiGet<{ dtos?: { catalogs?: any[] } }>(
    country,
    `/api/v2/catalog/initializers`,
    STATIC_TTL_MS,
  );
  const raw = data.dtos?.catalogs ?? [];
  return flattenCategories(raw);
}

function flattenCategories(nodes: any[], parentId?: number): CategoryHit[] {
  const result: CategoryHit[] = [];
  for (const n of nodes) {
    result.push({
      id: Number(n.id),
      title: String(n.title ?? n.name ?? ''),
      parentId,
      itemCount: n.item_count,
    });
    if (Array.isArray(n.catalogs) && n.catalogs.length) {
      result.push(...flattenCategories(n.catalogs, Number(n.id)));
    }
  }
  return result;
}

export interface BrandHit {
  id: number;
  title: string;
  slug: string;
  itemCount?: number;
  favouriteCount?: number;
}

export async function searchBrands(
  client: VintedClient,
  keyword: string,
  country: Country = 'fr',
): Promise<BrandHit[]> {
  if (!keyword.trim()) return [];
  const data = await client.apiGet<{ brands?: any[] }>(
    country,
    `/api/v2/brands?keyword=${encodeURIComponent(keyword)}`,
  );
  return (data.brands ?? []).map((b) => ({
    id: Number(b.id),
    title: String(b.title ?? ''),
    slug: String(b.slug ?? ''),
    itemCount: b.item_count,
    favouriteCount: b.favourite_count,
  }));
}

export interface ColorHit {
  id: number;
  title: string;
  hex: string;
  code: string;
  order: number;
}

export async function getColors(
  client: VintedClient,
  country: Country = 'fr',
): Promise<ColorHit[]> {
  const data = await client.apiGet<{ colors?: any[] }>(country, `/api/v2/colors`, STATIC_TTL_MS);
  return (data.colors ?? []).map((c) => ({
    id: Number(c.id),
    title: String(c.title ?? ''),
    hex: String(c.hex ?? ''),
    code: String(c.code ?? ''),
    order: Number(c.order ?? 0),
  }));
}

export interface SizeEntry {
  id: number;
  title: string;
}

export interface SizeGroup {
  id: number;
  caption: string;
  description: string;
  sizes: SizeEntry[];
}

export async function getSizeGroups(
  client: VintedClient,
  country: Country = 'fr',
): Promise<SizeGroup[]> {
  const data = await client.apiGet<{ size_groups?: any[] }>(
    country,
    `/api/v2/size_groups`,
    STATIC_TTL_MS,
  );
  return (data.size_groups ?? []).map((g) => ({
    id: Number(g.id),
    caption: String(g.caption ?? ''),
    description: String(g.description ?? ''),
    sizes: (g.sizes ?? []).map((s: any) => ({ id: Number(s.id), title: String(s.title ?? '') })),
  }));
}

export interface ItemSlim { price: number; currency: string; }

export async function searchSlim(
  client: VintedClient,
  query: string,
  country: Country,
  perPage = 20,
  extra?: Pick<SearchParams, 'brandIds' | 'categoryId' | 'sizeIds' | 'colorIds' | 'condition'>,
): Promise<ItemSlim[]> {
  const r = await searchItems(client, { query, country, perPage, sortBy: 'relevance', ...extra });
  return r.items
    .map((i) => ({ price: Number(i.price), currency: i.currency }))
    .filter((x) => Number.isFinite(x.price) && x.price > 0);
}
