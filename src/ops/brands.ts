import { VintedClient } from '../client/session.js';
import { searchBrands, type BrandHit } from '../client/endpoints.js';
import type { Country } from '../client/types.js';

export async function opBrands(
  client: VintedClient,
  input: { query: string; country?: Country; limit?: number },
): Promise<BrandHit[]> {
  if (!input.query?.trim()) throw new Error('query is required');
  const r = await searchBrands(client, input.query, input.country ?? 'fr');
  return r.slice(0, input.limit ?? 10);
}

const cache = new Map<string, number>();

export async function resolveBrandIds(
  client: VintedClient,
  names: string[],
  country: Country = 'fr',
): Promise<{ ids: number[]; resolved: { name: string; id: number; title: string }[]; unresolved: string[] }> {
  const wanted = names.map((n) => n.trim()).filter(Boolean);
  const lookups = await Promise.all(
    wanted.map(async (name) => {
      const key = `${country}:${name.toLowerCase()}`;
      let id = cache.get(key);
      let title = name;
      if (id === undefined) {
        const hits = await searchBrands(client, name, country);
        const exact = hits.find((h) => h.title.toLowerCase() === name.toLowerCase());
        const pick = exact ?? hits[0];
        if (pick) {
          id = pick.id;
          title = pick.title;
          cache.set(key, id);
        }
      }
      return { name, id, title };
    }),
  );

  const ids: number[] = [];
  const resolved: { name: string; id: number; title: string }[] = [];
  const unresolved: string[] = [];
  for (const { name, id, title } of lookups) {
    if (id !== undefined) {
      ids.push(id);
      resolved.push({ name, id, title });
    } else {
      unresolved.push(name);
    }
  }
  return { ids, resolved, unresolved };
}
