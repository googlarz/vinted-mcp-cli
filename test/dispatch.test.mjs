import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callTool } from '../dist/dispatch.js';
import { catalogEntry, catalogHtml } from './helpers/catalog-html.mjs';

const item = JSON.parse(readFileSync(new URL('./fixtures/item.json', import.meta.url), 'utf8'));

function makeClient({ brands = { levis: [{ id: 10, title: "Levi's" }] }, sizes = [] } = {}) {
  const calls = [];
  return {
    calls,
    async apiGet(country, path) {
      calls.push({ kind: 'api', country, path });
      if (path.startsWith('/api/v2/brands')) {
        const kw = decodeURIComponent(path.split('keyword=')[1]).toLowerCase();
        return { brands: brands[kw] ?? [] };
      }
      if (path.startsWith('/api/v2/size_groups')) return { size_groups: [{ id: 1, caption: 'Clothes', description: '', sizes }] };
      if (path.startsWith('/api/v2/items/1001')) return item;
      throw new Error(`unmocked: ${path}`);
    },
    async pageGet(country, path, parse) {
      calls.push({ kind: 'page', country, path });
      return parse(catalogHtml([catalogEntry({ id: 1 })]));
    },
  };
}

test('callTool rejects non-object arguments', async () => {
  await assert.rejects(callTool(makeClient(), 'search_items', 'nike'), /must be an object/);
  await assert.rejects(callTool(makeClient(), 'search_items', ['nike']), /must be an object/);
});

test('callTool rejects unknown countries before any request', async () => {
  const c = makeClient();
  await assert.rejects(callTool(c, 'search_items', { query: 'x', country: 'zz' }), /Invalid country "zz"/);
  await assert.rejects(callTool(c, 'compare_prices', { query: 'x', countries: ['fr', 'constructor'] }), /Invalid countries entry/);
  assert.equal(c.calls.length, 0);
});

test('get_new_items validates afterId', async () => {
  await assert.rejects(callTool(makeClient(), 'get_new_items', { query: 'x', afterId: 'abc' }), /afterId must be an integer/);
  await assert.rejects(callTool(makeClient(), 'get_new_items', { query: 'x', afterId: 1.5 }), /afterId must be an integer/);
});

test('callTool rejects unknown tools', async () => {
  await assert.rejects(callTool(makeClient(), 'nope', {}), /Unknown tool: nope/);
});

test('search_items resolves brand names into the query', async () => {
  const c = makeClient();
  const r = await callTool(c, 'search_items', { query: 'jeans', brand: ['Levis'] });
  assert.equal(r.items.length, 1);
  assert.equal('warnings' in r, false);
  const page = c.calls.find((x) => x.kind === 'page');
  assert.deepEqual(new URLSearchParams(page.path.split('?')[1]).getAll('brand_ids[]'), ['10']);
});

test('search_items accepts a comma-separated string for list filters', async () => {
  const c = makeClient();
  await callTool(c, 'search_items', { query: 'jeans', brand: 'Levis' });
  assert.ok(c.calls.some((x) => x.kind === 'page' && x.path.includes('brand_ids%5B%5D=10')));
});

test('an unresolvable filter is an error, not a silent unfiltered search', async () => {
  const c = makeClient();
  await assert.rejects(callTool(c, 'search_items', { query: 'x', brand: ['Nonexistent'] }), /Could not resolve brand\(s\): Nonexistent.*search_brands/);
  assert.equal(c.calls.some((x) => x.kind === 'page'), false);
});

test('a partly unresolved filter still searches and reports a warning', async () => {
  const c = makeClient();
  const r = await callTool(c, 'search_items', { query: 'x', brand: ['Levis', 'Nonexistent'] });
  assert.deepEqual(r.warnings, ['unresolved brand(s): Nonexistent']);
  assert.equal(r.items.length, 1);
});

test('explicit IDs take precedence over names', async () => {
  const c = makeClient();
  await callTool(c, 'search_items', { query: 'x', brandIds: [99], brand: ['Nonexistent'] });
  assert.equal(c.calls.some((x) => x.kind === 'api'), false);
  assert.ok(c.calls[0].path.includes('brand_ids%5B%5D=99'));
});

test('size and color names are resolved for get_new_items', async () => {
  const c = makeClient({ sizes: [{ id: 207, title: 'M' }] });
  const r = await callTool(c, 'get_new_items', { query: 'x', size: ['M'] });
  assert.equal(r.latestId, 1);
  assert.ok(c.calls.some((x) => x.kind === 'page' && x.path.includes('size_ids%5B%5D=207')));
});

test('get_item ignores a caller-supplied browser flag', async () => {
  const r = await callTool(makeClient(), 'get_item', { itemId: 1001, country: 'fr', browser: true });
  assert.equal(r.id, 1001);
});

test('resolve_size_ids accepts a comma-separated string', async () => {
  const c = makeClient({ sizes: [{ id: 1, title: 'S' }, { id: 2, title: 'M' }] });
  const r = await callTool(c, 'resolve_size_ids', { sizes: 'S, M' });
  assert.deepEqual(r.ids, [1, 2]);
});
