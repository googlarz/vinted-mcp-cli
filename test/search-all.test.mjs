import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opSearchAll } from '../dist/ops/search.js';
import { catalogEntry, catalogHtml, CatalogClient } from './helpers/catalog-html.mjs';

function makePages(pages) {
  const total = pages.flat().length;
  return new CatalogClient((_country, path) => {
    const page = Number(new URLSearchParams(path.split('?')[1]).get('page') ?? 1);
    const ids = pages[page - 1] ?? [];
    return catalogHtml(ids.map((id) => catalogEntry({ id })), { current_page: page, total_entries: total });
  });
}

test('opSearchAll walks pages and dedupes', async () => {
  const c = makePages([[1, 2, 3], [3, 4, 5], [6]]); // 3 appears twice
  const r = await opSearchAll(c, { query: 'x' });
  assert.deepEqual(r.items.map((i) => i.id), [1, 2, 3, 4, 5, 6]);
});

test('opSearchAll stops at maxItems', async () => {
  const c = makePages([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  const r = await opSearchAll(c, { query: 'x', maxItems: 4 });
  assert.equal(r.items.length, 4);
});

test('opSearchAll stops on empty page', async () => {
  const c = makePages([[1, 2], []]);
  const r = await opSearchAll(c, { query: 'x' });
  assert.equal(r.items.length, 2);
});

test('opSearchAll stops when no new items added (loop guard)', async () => {
  const c = makePages([[1, 2, 3], [1, 2, 3]]);
  const r = await opSearchAll(c, { query: 'x' });
  assert.equal(r.items.length, 3);
});

test('opSearchAll keeps whole pages even when perPage is small', async () => {
  const c = makePages([[1, 2, 3, 4, 5]]);
  const r = await opSearchAll(c, { query: 'x', perPage: 2 });
  assert.equal(r.items.length, 5);
});

test('opSearchAll counts maxPages from the start page', async () => {
  const c = makePages([[1], [2], [3], [4], [5]]);
  const r = await opSearchAll(c, { query: 'x', page: 2, maxPages: 2 });
  assert.deepEqual(r.items.map((i) => i.id), [2, 3]);
  assert.equal(r.page, 2);
});

test('opSearchAll clamps maxItems to 1000 and maxPages to 25', async () => {
  const c = makePages(Array.from({ length: 40 }, (_, i) => [i + 1]));
  const r = await opSearchAll(c, { query: 'x', maxItems: 1e9, maxPages: 1e9 });
  assert.equal(r.items.length, 25);
});

test('opSearchAll surfaces a failed page without unhandled rejections', async () => {
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    const c = new CatalogClient((_c, path) => {
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page') ?? 1);
      if (page >= 2) return new Error('boom');
      return catalogHtml([catalogEntry({ id: 1 })]);
    });
    await assert.rejects(opSearchAll(c, { query: 'x' }), /boom/);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
