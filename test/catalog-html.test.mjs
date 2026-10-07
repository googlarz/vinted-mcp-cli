import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogHtml, mapCatalogItem, buildCatalogPath } from '../dist/client/catalog-html.js';
import { catalogEntry, catalogHtml } from './helpers/catalog-html.mjs';

test('parseCatalogHtml reads items and pagination across flight chunks', () => {
  const html = catalogHtml(
    [catalogEntry({ id: 1 }), catalogEntry({ id: 2 })],
    { current_page: 3, total_pages: 10, total_entries: 960, per_page: 96 },
  );
  const page = parseCatalogHtml(html);
  assert.deepEqual(page.items.map((i) => i.id), [1, 2]);
  assert.deepEqual(page.pagination, { currentPage: 3, totalPages: 10, totalEntries: 960, perPage: 96 });
});

test('parseCatalogHtml handles titles containing brackets, quotes and braces', () => {
  const html = catalogHtml([catalogEntry({ id: 7, title: 'Jeans [W32] "501" {vintage} \\ end' })]);
  const page = parseCatalogHtml(html);
  assert.equal(page.items[0].productItem.title, 'Jeans [W32] "501" {vintage} \\ end');
});

test('parseCatalogHtml returns an empty page for zero results', () => {
  const page = parseCatalogHtml(catalogHtml([], { total_entries: 0 }));
  assert.deepEqual(page.items, []);
  assert.equal(page.pagination.totalEntries, 0);
});

test('parseCatalogHtml fails loudly when the layout changed or the request was blocked', () => {
  assert.throws(() => parseCatalogHtml('<html><body>Access denied</body></html>'), /no embedded item list/);
});

test('mapCatalogItem splits size and condition, and treats $undefined as missing', () => {
  const both = mapCatalogItem(catalogEntry({ id: 1, second: '6-9 mois / 68 cm · Très bon état' }), 'fr');
  assert.equal(both.size, '6-9 mois / 68 cm');
  assert.equal(both.condition, 'Très bon état');

  const noSize = mapCatalogItem(catalogEntry({ id: 2, second: 'Très bon état' }), 'fr');
  assert.equal(noSize.size, undefined);
  assert.equal(noSize.condition, 'Très bon état');

  const noBrand = mapCatalogItem(catalogEntry({ id: 3, brand: '$undefined' }), 'fr');
  assert.equal(noBrand.brand, undefined);
});

test('mapCatalogItem builds an absolute URL on the right domain without tracking params', () => {
  assert.equal(mapCatalogItem(catalogEntry({ id: 5, title: 'Tee' }), 'de').url, 'https://www.vinted.de/items/5-tee');
  assert.equal(mapCatalogItem(catalogEntry({ id: 5, title: 'Tee' }), 'uk').url, 'https://www.vinted.co.uk/items/5-tee');
});

test('buildCatalogPath omits search_text for empty queries and unset filters', () => {
  const path = buildCatalogPath({ query: '' });
  const q = new URLSearchParams(path.split('?')[1]);
  assert.equal(q.has('search_text'), false);
  assert.equal(q.has('brand_ids[]'), false);
  assert.equal(q.get('order'), 'relevance');
  assert.equal(q.get('page'), '1');
});

test('parseCatalogHtml finds pagination when other keys sit between items and pagination', () => {
  const html = catalogHtml([catalogEntry({ id: 1 })], { current_page: 4, total_pages: 10, total_entries: 960 },
    { between: ',"tracking":{"nested":{"a":[1,2,{"b":"}"}]}}' });
  assert.equal(parseCatalogHtml(html).pagination.currentPage, 4);
  assert.equal(parseCatalogHtml(html).pagination.totalEntries, 960);
});

test('parseCatalogHtml copes with a nested object inside pagination', () => {
  const html = catalogHtml([catalogEntry({ id: 1 })], { current_page: 2, total_entries: 50, extra: { deep: { x: 1 } } });
  assert.equal(parseCatalogHtml(html).pagination.currentPage, 2);
  assert.equal(parseCatalogHtml(html).pagination.totalEntries, 50);
});
