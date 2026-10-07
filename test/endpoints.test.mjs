import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  searchItems, getItem, getSeller, searchSlim, getSellerItems,
} from '../dist/client/endpoints.js';
import { catalogEntry, catalogHtml, CatalogClient } from './helpers/catalog-html.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(resolve(here, 'fixtures', n), 'utf8'));

class FakeClient {
  constructor(byPath) { this.byPath = byPath; this.calls = []; }
  async apiGet(country, path) {
    this.calls.push({ country, path });
    for (const [pattern, payload] of Object.entries(this.byPath)) {
      if (path.startsWith(pattern)) return payload;
    }
    throw new Error(`unmocked: ${path}`);
  }
}

test('searchItems maps catalog entries + builds web catalog query', async () => {
  const c = new CatalogClient(() => catalogHtml(
    [catalogEntry({ id: 1001, title: 'Nike Air Max 90', price: '45.00', brand: 'Nike', second: '42 · Bon état', userId: 5001, favourites: 7 }),
     catalogEntry({ id: 1002, title: 'Nike Tee', price: '12.50' })],
    { total_entries: 960, total_pages: 10 },
  ));
  const r = await searchItems(c, {
    query: 'nike', country: 'fr', priceMin: 10, priceMax: 100, brandIds: [53, 14], sizeIds: [207],
    colorIds: [1], categoryId: 1231, condition: ['good'], sortBy: 'price_low_to_high', page: 2,
  });
  assert.equal(r.totalCount, 960);
  assert.equal(r.items.length, 2);
  const [a] = r.items;
  assert.equal(a.id, 1001);
  assert.equal(a.price, '45.00');
  assert.equal(a.currency, 'EUR');
  assert.equal(a.brand, 'Nike');
  assert.equal(a.size, '42');
  assert.equal(a.condition, 'Bon état');
  assert.equal(a.favouriteCount, 7);
  assert.equal(a.seller.id, 5001);
  assert.equal(a.url, 'https://www.vinted.fr/items/1001-nike-air-max-90');
  assert.match(a.photoUrl, /f800/);

  const q = new URLSearchParams(c.calls[0].path.split('?')[1]);
  assert.equal(c.calls[0].path.split('?')[0], '/catalog');
  assert.equal(q.get('search_text'), 'nike');
  assert.equal(q.get('price_from'), '10');
  assert.equal(q.get('price_to'), '100');
  assert.equal(q.get('order'), 'price_low_to_high');
  assert.equal(q.get('page'), '2');
  assert.deepEqual(q.getAll('brand_ids[]'), ['53', '14']);
  assert.deepEqual(q.getAll('size_ids[]'), ['207']);
  assert.deepEqual(q.getAll('color_ids[]'), ['1']);
  assert.deepEqual(q.getAll('catalog[]'), ['1231']);
  assert.deepEqual(q.getAll('status_ids[]'), ['3']);
});

test('searchItems truncates to perPage (Vinted pages are fixed at 96)', async () => {
  const entries = Array.from({ length: 10 }, (_, i) => catalogEntry({ id: i + 1 }));
  const c = new CatalogClient(() => catalogHtml(entries));
  assert.equal((await searchItems(c, { query: 'x', perPage: 3 })).items.length, 3);
  assert.equal((await searchItems(c, { query: 'x', perPage: 999 })).items.length, 10);
});

test('searchItems rejects date filters that Vinted no longer supports', async () => {
  const c = new CatalogClient(() => catalogHtml([]));
  await assert.rejects(searchItems(c, { query: 'x', dateFrom: '2026-01-01' }), /not supported/);
  assert.equal(c.calls.length, 0);
});

test('getSellerItems uses the wardrobe endpoint', async () => {
  const c = new FakeClient({
    '/api/v2/wardrobe/5001/items': {
      items: [{ id: 9, title: 'x', price: { amount: '2.0', currency_code: 'EUR' }, brand: 'Levi\'s', size: 'M', status: 'Good', url: 'https://www.vinted.fr/items/9-x', user: { login: 'alice' } }],
      pagination: { total_entries: 88 },
    },
  });
  const r = await getSellerItems(c, 5001, 'fr', 5, 2);
  assert.equal(r.totalCount, 88);
  assert.equal(r.items[0].seller.username, 'alice');
  assert.match(c.calls[0].path, /^\/api\/v2\/wardrobe\/5001\/items\?/);
  assert.match(c.calls[0].path, /per_page=5/);
  assert.match(c.calls[0].path, /page=2/);
});

test('getItem maps detailed payload', async () => {
  const c = new FakeClient({ '/api/v2/items/1001': fx('item.json') });
  const r = await getItem(c, 1001, 'fr');
  assert.equal(r.id, 1001);
  assert.equal(r.brand, 'Nike');
  assert.equal(r.photos.length, 2);
  assert.equal(r.description, 'Used pair, very clean.');
  assert.equal(r.seller.id, 5001);
});

test('getSeller maps payload', async () => {
  const c = new FakeClient({ '/api/v2/users/5001': fx('seller.json') });
  const r = await getSeller(c, 5001, 'fr');
  assert.equal(r.username, 'alice');
  assert.equal(r.itemCount, 42);
  assert.equal(r.feedbackReputation, 0.98);
  assert.equal(r.profileUrl, 'https://www.vinted.fr/member/5001');
});

test('searchSlim filters non-numeric prices', async () => {
  const c = new CatalogClient(() => catalogHtml([
    catalogEntry({ id: 1, price: '20.00' }),
    catalogEntry({ id: 2, price: '0' }),
    catalogEntry({ id: 3, price: 'NaN' }),
  ]));
  const r = await searchSlim(c, 'x', 'fr', 10);
  assert.equal(r.length, 1);
  assert.equal(r[0].price, 20);
});
