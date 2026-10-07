import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSizeIds } from '../dist/ops/sizes.js';

class FakeClient {
  async apiGet(_country, _path) {
    return {
      size_groups: [
        {
          id: 1, caption: "Women's clothing", description: '',
          sizes: [
            { id: 101, title: 'XS' },
            { id: 102, title: 'S' },
            { id: 103, title: 'M' },
            { id: 104, title: 'L' },
          ],
        },
        {
          id: 2, caption: "Men's clothing", description: '',
          sizes: [
            { id: 201, title: 'S' },
            { id: 202, title: 'M' },
            { id: 203, title: 'L' },
            { id: 204, title: 'XL' },
          ],
        },
        {
          id: 3, caption: 'Shoes', description: '',
          sizes: [
            { id: 301, title: '42' },
            { id: 302, title: '43' },
          ],
        },
      ],
    };
  }
}

const fake = new FakeClient();

test('resolveSizeIds resolves exact label (case-insensitive)', async () => {
  const r = await resolveSizeIds(fake, ['xs'], 'fr');
  assert.deepEqual(r.ids, [101]);
  assert.equal(r.unresolved.length, 0);
});

test('resolveSizeIds returns multiple IDs for cross-group label', async () => {
  const r = await resolveSizeIds(fake, ['M'], 'fr');
  // M appears in both women's (103) and men's (202)
  assert.ok(r.ids.includes(103));
  assert.ok(r.ids.includes(202));
  assert.equal(r.unresolved.length, 0);
});

test('resolveSizeIds reports unresolved labels', async () => {
  const r = await resolveSizeIds(fake, ['M', 'XXXL'], 'fr');
  assert.ok(r.ids.length > 0);
  assert.deepEqual(r.unresolved, ['XXXL']);
});

test('resolveSizeIds handles empty input', async () => {
  const r = await resolveSizeIds(fake, [], 'fr');
  assert.deepEqual(r.ids, []);
  assert.deepEqual(r.resolved, []);
  assert.deepEqual(r.unresolved, []);
});

test('resolveSizeIds handles numeric sizes', async () => {
  const r = await resolveSizeIds(fake, ['42', '43', '44'], 'fr');
  assert.deepEqual(r.ids, [301, 302]);
  assert.deepEqual(r.unresolved, ['44']);
});

test('resolveSizeIds resolved entries include group name', async () => {
  const r = await resolveSizeIds(fake, ['XS'], 'fr');
  assert.equal(r.resolved[0].group, "Women's clothing");
  assert.equal(r.resolved[0].id, 101);
});
