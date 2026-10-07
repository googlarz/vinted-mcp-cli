import { getSizeGroups } from '../client/endpoints.js';
import type { VintedClient } from '../client/session.js';
import type { Country } from '../client/types.js';

export interface ResolveSizeIdsResult {
  ids: number[];
  resolved: { label: string; id: number; group: string }[];
  unresolved: string[];
}

export async function resolveSizeIds(
  client: VintedClient,
  labels: string[],
  country: Country = 'fr',
): Promise<ResolveSizeIdsResult> {
  const groups = await getSizeGroups(client, country);
  const resolved: { label: string; id: number; group: string }[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const norm = label.trim().toLowerCase();
    for (const group of groups) {
      for (const size of group.sizes) {
        if (size.title.toLowerCase() === norm) {
          const key = `${norm}:${size.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            resolved.push({ label, id: size.id, group: group.caption });
          }
        }
      }
    }
  }

  const resolvedNorms = new Set(resolved.map((r) => r.label.trim().toLowerCase()));
  const unresolved = labels.filter((l) => !resolvedNorms.has(l.trim().toLowerCase()));

  return { ids: resolved.map((r) => r.id), resolved, unresolved };
}
