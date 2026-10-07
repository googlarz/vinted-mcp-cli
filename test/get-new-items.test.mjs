import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opGetNewItems } from '../dist/ops/get-new-items.js';
import { catalogEntry, catalogHtml, CatalogClient } from './helpers/catalog-html.mjs';

const client = () => new CatalogClient(() => catalogHtml([30, 29, 28, 20].map((id) => catalogEntry({ id }))));

test('opGetNewItems returns everything on the first call and a cursor', async () => {
  const r = await opGetNewItems(client(), { query: 'x' });
  assert.equal(r.items.length, 4);
  assert.equal(r.latestId, 30);
});

test('opGetNewItems only returns items above afterId', async () => {
  const r = await opGetNewItems(client(), { query: 'x', afterId: 28 });
  assert.deepEqual(r.items.map((i) => i.id), [30, 29]);
  assert.equal(r.totalCount, 2);
  assert.equal(r.latestId, 30);
});

test('opGetNewItems returns nothing new when the cursor is current', async () => {
  const r = await opGetNewItems(client(), { query: 'x', afterId: 30 });
  assert.deepEqual(r.items, []);
  assert.equal(r.latestId, 30);
});

test('opGetNewItems always sorts newest first', async () => {
  const c = client();
  await opGetNewItems(c, { query: 'x', sortBy: 'price_low_to_high' });
  assert.match(c.calls[0].path, /order=newest_first/);
});

test('opGetNewItems flags a possibly truncated window', async () => {
  const r = await opGetNewItems(client(), { query: 'x', afterId: 10 });
  assert.equal(r.truncated, true);
  const ok = await opGetNewItems(client(), { query: 'x', afterId: 25 });
  assert.equal(ok.truncated, undefined);
  const first = await opGetNewItems(client(), { query: 'x' });
  assert.equal(first.truncated, undefined);
});

test('opGetNewItems bypasses the response cache', async () => {
  const c = client();
  await opGetNewItems(c, { query: 'x' });
  assert.equal(c.calls[0].ttl, 0);
});
