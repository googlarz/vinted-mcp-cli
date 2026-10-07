import type { VintedClient } from './client/session.js';
import { COUNTRIES, type Country } from './client/types.js';
import { opSearch, opSearchAll } from './ops/search.js';
import { opGetItem } from './ops/get-item.js';
import { opGetSeller } from './ops/get-seller.js';
import { opCompare } from './ops/compare.js';
import { opTrending } from './ops/trending.js';
import { opBrands, resolveBrandIds } from './ops/brands.js';
import { opCategories } from './ops/categories.js';
import { opSellerItems } from './ops/seller-items.js';
import { opGetSellerFeedback } from './ops/get-seller-feedback.js';
import { opGetColors, resolveColorIds } from './ops/get-colors.js';
import { opGetSizeGroups } from './ops/get-size-groups.js';
import { resolveSizeIds } from './ops/sizes.js';
import { opGetNewItems } from './ops/get-new-items.js';

type Args = Record<string, any>;

function checkCountry(value: unknown, field: string): void {
  if (value !== undefined && !COUNTRIES.includes(value as Country)) {
    throw new Error(`Invalid ${field} "${String(value)}". Valid: ${COUNTRIES.join(', ')}`);
  }
}

function list(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : [];
  return raw.map((s) => s.trim()).filter(Boolean);
}

/** Turn brand/size/color names into IDs. An unresolvable filter is an error: running unfiltered would mislead. */
async function resolveFilters(c: VintedClient, args: Args, country: Country): Promise<string[]> {
  const warnings: string[] = [];
  const apply = async (
    key: 'brand' | 'size' | 'color',
    idsKey: 'brandIds' | 'sizeIds' | 'colorIds',
    resolve: (names: string[]) => Promise<{ ids: number[]; unresolved: string[] }>,
    hint: string,
  ) => {
    const names = list(args[key]);
    delete args[key];
    if (args[idsKey] || !names.length) return;
    const r = await resolve(names);
    if (!r.ids.length) throw new Error(`Could not resolve ${key}(s): ${r.unresolved.join(', ')}. ${hint}`);
    args[idsKey] = r.ids;
    if (r.unresolved.length) warnings.push(`unresolved ${key}(s): ${r.unresolved.join(', ')}`);
  };
  await apply('brand', 'brandIds', (n) => resolveBrandIds(c, n, country), 'Use search_brands to look up IDs.');
  await apply('size', 'sizeIds', (n) => resolveSizeIds(c, n, country), 'Use get_size_groups to see valid labels.');
  await apply('color', 'colorIds', (n) => resolveColorIds(c, n, country), 'Use get_colors to see valid names.');
  return warnings;
}

function withWarnings<T>(result: T, warnings: string[]): T | (T & { warnings: string[] }) {
  return warnings.length && result && typeof result === 'object' && !Array.isArray(result)
    ? { ...result, warnings }
    : result;
}

export async function callTool(c: VintedClient, name: string, rawArgs: unknown): Promise<unknown> {
  if (rawArgs !== undefined && (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs))) {
    throw new Error('Tool arguments must be an object');
  }
  const a: Args = { ...(rawArgs as Args | undefined) };
  checkCountry(a.country, 'country');
  if (a.countries !== undefined) {
    if (!Array.isArray(a.countries)) throw new Error('countries must be an array');
    a.countries.forEach((cc: unknown) => checkCountry(cc, 'countries entry'));
  }
  const country: Country = a.country ?? 'fr';
  if (a.afterId !== undefined && !Number.isSafeInteger(a.afterId)) throw new Error('afterId must be an integer');

  switch (name) {
    case 'search_items': {
      const warnings = await resolveFilters(c, a, country);
      return withWarnings(await opSearch(c, a as any), warnings);
    }
    case 'search_all_items': {
      const warnings = await resolveFilters(c, a, country);
      return withWarnings(await opSearchAll(c, { ...a, maxItems: a.maxItems ?? 200 } as any), warnings);
    }
    case 'get_new_items': {
      const warnings = await resolveFilters(c, a, country);
      return withWarnings(await opGetNewItems(c, a as any), warnings);
    }
    case 'compare_prices': {
      const warnings = await resolveFilters(c, a, a.countries?.[0] ?? 'fr');
      return withWarnings(await opCompare(c, a as any), warnings);
    }
    case 'search_brands': return opBrands(c, a as any);
    // Browser mode launches Chromium; only the server operator may enable it (VINTED_BROWSER=1).
    case 'get_item': return opGetItem(c, { ...a, browser: undefined } as any);
    case 'get_seller': return opGetSeller(c, a as any);
    case 'get_seller_items': return opSellerItems(c, a as any);
    case 'get_seller_feedback': return opGetSellerFeedback(c, a as any);
    case 'get_trending': return opTrending(c, a as any);
    case 'get_categories': return opCategories(c, a as any);
    case 'get_colors': return opGetColors(c, a as any);
    case 'get_size_groups': return opGetSizeGroups(c, a as any);
    case 'resolve_color_ids': return resolveColorIds(c, list(a.colors), country);
    case 'resolve_size_ids': return resolveSizeIds(c, list(a.sizes), country);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
