import { VintedClient } from '../client/session.js';
import { getColors } from '../client/endpoints.js';
import type { Country } from '../client/types.js';
import type { ColorHit } from '../client/endpoints.js';

export async function opGetColors(
  client: VintedClient,
  args: { country?: Country },
): Promise<ColorHit[]> {
  return getColors(client, args.country ?? 'fr');
}

export interface ResolveColorIdsResult {
  ids: number[];
  resolved: { name: string; id: number; title: string }[];
  unresolved: string[];
}

export async function resolveColorIds(
  client: VintedClient,
  names: string[],
  country: Country = 'fr',
): Promise<ResolveColorIdsResult> {
  const colors = await getColors(client, country);
  const resolved: { name: string; id: number; title: string }[] = [];

  for (const name of names) {
    const norm = name.trim().toLowerCase();
    const match = colors.find(
      (c) => c.title.toLowerCase() === norm || c.code.toLowerCase() === norm,
    );
    if (match) resolved.push({ name, id: match.id, title: match.title });
  }

  const resolvedNorms = new Set(resolved.map((r) => r.name.trim().toLowerCase()));
  const unresolved = names.filter((n) => !resolvedNorms.has(n.trim().toLowerCase()));

  return { ids: resolved.map((r) => r.id), resolved, unresolved };
}
