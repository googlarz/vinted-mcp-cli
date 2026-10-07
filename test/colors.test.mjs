import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColorIds } from '../dist/ops/get-colors.js';

class FakeClient {
  async apiGet(_country, _path) {
    return {
      colors: [
        { id: 1, title: 'Black', code: 'BLACK' },
        { id: 2, title: 'White', code: 'WHITE' },
        { id: 3, title: 'Navy Blue', code: 'NAVY_BLUE' },
        { id: 4, title: 'Red', code: 'RED' },
        { id: 5, title: 'Dark Grey', code: 'DARK_GREY' },
      ],
    };
  }
}

const fake = new FakeClient();

test('resolveColorIds resolves by title (case-insensitive)', async () => {
  const r = await resolveColorIds(fake, ['black'], 'fr');
  assert.deepEqual(r.ids, [1]);
  assert.equal(r.unresolved.length, 0);
});

test('resolveColorIds resolves by Vinted code', async () => {
  const r = await resolveColorIds(fake, ['NAVY_BLUE'], 'fr');
  assert.deepEqual(r.ids, [3]);
  assert.equal(r.unresolved.length, 0);
  assert.equal(r.resolved[0].title, 'Navy Blue');
});

test('resolveColorIds reports unresolved names', async () => {
  const r = await resolveColorIds(fake, ['black', 'purple'], 'fr');
  assert.deepEqual(r.ids, [1]);
  assert.deepEqual(r.unresolved, ['purple']);
});

test('resolveColorIds handles empty input', async () => {
  const r = await resolveColorIds(fake, [], 'fr');
  assert.deepEqual(r.ids, []);
  assert.deepEqual(r.resolved, []);
  assert.deepEqual(r.unresolved, []);
});

test('resolveColorIds resolves multiple names', async () => {
  const r = await resolveColorIds(fake, ['Red', 'White', 'Dark Grey'], 'fr');
  assert.deepEqual(r.ids.sort(), [2, 4, 5].sort());
  assert.equal(r.unresolved.length, 0);
});
