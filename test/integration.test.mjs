import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VintedClient } from '../dist/client/session.js';
import { opSearch } from '../dist/ops/search.js';
import { opTrending } from '../dist/ops/trending.js';
import { opSellerItems } from '../dist/ops/seller-items.js';
import { opCompare } from '../dist/ops/compare.js';
import { opBrands, resolveBrandIds } from '../dist/ops/brands.js';
import { opGetColors } from '../dist/ops/get-colors.js';

const skip = process.env.INTEGRATION === '1' ? false : 'set INTEGRATION=1 to run';
const client = new VintedClient();

test('live search returns items', { skip }, async () => {
  const r = await opSearch(client, { query: 'nike', country: 'fr', perPage: 5 });
  assert.ok(r.items.length > 0, 'expected at least one item');
  assert.ok(r.items[0].id && r.items[0].price && r.items[0].currency, 'item missing core fields');
});

test('live search honours a brand filter', { skip }, async () => {
  const { ids } = await resolveBrandIds(client, ["Levi's"], 'fr');
  assert.ok(ids.length, 'brand did not resolve');
  const r = await opSearch(client, { query: 'jeans', country: 'fr', brandIds: ids, perPage: 20 });
  assert.ok(r.items.length > 0);
  const share = r.items.filter((i) => i.brand === "Levi's").length / r.items.length;
  assert.ok(share > 0.8, `only ${Math.round(share * 100)}% of results matched the brand filter`);
});

test('live search honours a price ceiling', { skip }, async () => {
  const r = await opSearch(client, { query: 'levis', country: 'fr', priceMax: 5, perPage: 20 });
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((i) => Number(i.price) <= 5));
});

test('live trending returns items', { skip }, async () => {
  const r = await opTrending(client, { country: 'fr', limit: 5 });
  assert.ok(r.items.length > 0);
});

test('live seller items come from the wardrobe endpoint', { skip }, async () => {
  const first = await opSearch(client, { query: 'nike', country: 'fr', perPage: 1 });
  const r = await opSellerItems(client, { sellerId: first.items[0].seller.id, country: 'fr', limit: 3 });
  assert.ok(r.items.length > 0);
});

test('live compare returns stats without failures', { skip }, async () => {
  const r = await opCompare(client, { query: 'levis 501', countries: ['fr', 'de'], limit: 10 });
  assert.equal(r.failed, undefined, JSON.stringify(r.failed));
  assert.equal(r.countries.length, 2);
});

test('live brand and color lookups work', { skip }, async () => {
  assert.ok((await opBrands(client, { query: 'nike' })).length > 0);
  assert.ok((await opGetColors(client, { country: 'fr' })).length > 0);
});
