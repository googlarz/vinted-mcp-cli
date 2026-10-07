import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opCompare } from '../dist/ops/compare.js';
import { catalogEntry, catalogHtml, CatalogClient } from './helpers/catalog-html.mjs';

function StubClient(pricesByCountry, failing = {}) {
  return new CatalogClient((country) => {
    if (failing[country]) return new Error(failing[country]);
    const prices = pricesByCountry[country] ?? [];
    return catalogHtml(prices.map((p, i) => catalogEntry({ id: i + 1, price: String(p) })));
  });
}

test('opCompare computes median, spread, best buy/sell', async () => {
  const c = StubClient({
    fr: [10, 20, 30],
    de: [50, 60, 70],
    it: [25, 25, 25],
  });
  const r = await opCompare(c, { query: 'x', countries: ['fr', 'de', 'it'] });
  assert.equal(r.bestBuyCountry, 'fr');
  assert.equal(r.bestSellCountry, 'de');
  assert.equal(r.countries.length, 3);
  const fr = r.countries.find((s) => s.country === 'fr');
  assert.equal(fr.medianPrice, 20);
  assert.equal(fr.minPrice, 10);
  assert.equal(fr.maxPrice, 30);
  // spread = (60 - 20) / 20 * 100 = 200
  assert.equal(r.arbitrageSpreadPct, 200);
});

test('opCompare drops countries with no items', async () => {
  const c = StubClient({ fr: [10], de: [] });
  const r = await opCompare(c, { query: 'x', countries: ['fr', 'de'] });
  assert.equal(r.countries.length, 1);
  assert.equal(r.countries[0].country, 'fr');
});

test('opCompare returns empty when nothing found', async () => {
  const c = StubClient({});
  const r = await opCompare(c, { query: 'x', countries: ['fr'] });
  assert.equal(r.countries.length, 0);
  assert.equal(r.bestBuyCountry, null);
  assert.equal(r.arbitrageSpreadPct, 0);
});

test('opCompare validates query', async () => {
  await assert.rejects(() => opCompare(StubClient({}), { query: '   ' }), /query is required/);
});

test('opCompare reports failed countries instead of hiding them', async () => {
  const c = StubClient({ fr: [10, 20] }, { de: 'Vinted 429 for x' });
  const r = await opCompare(c, { query: 'x', countries: ['fr', 'de'] });
  assert.equal(r.countries.length, 1);
  assert.deepEqual(r.failed, [{ country: 'de', error: 'Vinted 429 for x' }]);
});

test('opCompare reports failures even when every country failed', async () => {
  const c = StubClient({}, { fr: 'down' });
  const r = await opCompare(c, { query: 'x', countries: ['fr'] });
  assert.equal(r.countries.length, 0);
  assert.equal(r.failed.length, 1);
});

test('opCompare omits failed when all countries succeed', async () => {
  const r = await opCompare(StubClient({ fr: [10] }), { query: 'x', countries: ['fr'] });
  assert.equal('failed' in r, false);
});

test('opCompare rejects unknown countries and dedupes repeats', async () => {
  await assert.rejects(() => opCompare(StubClient({}), { query: 'x', countries: ['fr', 'zz'] }), /Unknown country: zz/);
  const c = StubClient({ fr: [10] });
  await opCompare(c, { query: 'x', countries: ['fr', 'fr', 'fr'] });
  assert.equal(c.calls.length, 1);
});

test('opCompare clamps limit to 96', async () => {
  const entries = Array.from({ length: 96 }, (_, i) => catalogEntry({ id: i + 1, price: '5' }));
  const c = new CatalogClient(() => catalogHtml(entries));
  const r = await opCompare(c, { query: 'x', countries: ['fr'], limit: 100000 });
  assert.equal(r.countries[0].itemCount, 96);
});
