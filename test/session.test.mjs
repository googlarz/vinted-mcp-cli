import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockAgent } from 'undici';
import { VintedClient } from '../dist/client/session.js';

const HOST = 'https://www.vinted.fr';
const cookieHeader = (name) => ({ headers: { 'set-cookie': [`${name}=v; Path=/`] } });

function setup(opts = {}) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const pool = agent.get(HOST);
  const client = new VintedClient({ dispatcher: agent, cacheTtlMs: 60_000, rateLimitPerSec: 1000, rateLimitBurst: 1000, ...opts });
  return { agent, pool, client };
}

test('concurrent first requests share a single bootstrap', async () => {
  const { pool, client } = setup();
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('t1')); // only one allowed
  pool.intercept({ path: '/api/v2/a', method: 'GET' }).reply(200, { n: 'a' });
  pool.intercept({ path: '/api/v2/b', method: 'GET' }).reply(200, { n: 'b' });
  pool.intercept({ path: '/api/v2/c', method: 'GET' }).reply(200, { n: 'c' });
  const r = await Promise.all(['a', 'b', 'c'].map((p) => client.apiGet('fr', `/api/v2/${p}`)));
  assert.deepEqual(r.map((x) => x.n), ['a', 'b', 'c']);
});

test('identical concurrent requests are deduplicated', async () => {
  const { pool, client } = setup();
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('t1'));
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(200, { n: 1 }); // a second request would fail: no interceptor
  const [a, b] = await Promise.all([client.apiGet('fr', '/api/v2/x'), client.apiGet('fr', '/api/v2/x')]);
  assert.deepEqual(a, b);
});

test('a 401 triggers one re-bootstrap and a retry', async () => {
  const { pool, client } = setup({ cacheTtlMs: 0 });
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('old'));
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(401, 'expired');
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('new'));
  pool.intercept({ path: '/api/v2/x', method: 'GET', headers: { cookie: 'new=v' } }).reply(200, { ok: true });
  assert.deepEqual(await client.apiGet('fr', '/api/v2/x'), { ok: true });
});

test('a repeated 401 fails instead of looping', async () => {
  const { agent, pool, client } = setup({ cacheTtlMs: 0 });
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('a')).times(2);
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(401, 'no').times(2);
  await assert.rejects(client.apiGet('fr', '/api/v2/x'), /Vinted 401/);
  agent.assertNoPendingInterceptors(); // exactly two bootstraps and two requests, no third attempt
});

test('a 403 fails without retrying', async () => {
  const { pool, client } = setup({ cacheTtlMs: 0 });
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('a'));
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(403, 'blocked');
  await assert.rejects(client.apiGet('fr', '/api/v2/x'), /Vinted 403/);
});

test('a 429 honours Retry-After and then succeeds', async () => {
  const { pool, client } = setup({ cacheTtlMs: 0 });
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('a'));
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(429, 'slow down', { headers: { 'retry-after': '1' } });
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(200, { ok: 1 });
  const t0 = Date.now();
  assert.deepEqual(await client.apiGet('fr', '/api/v2/x'), { ok: 1 });
  assert.ok(Date.now() - t0 >= 900, 'should have waited about a second');
});

test('a hung request is aborted by the timeout', async () => {
  const { pool, client } = setup({ cacheTtlMs: 0, timeoutMs: 100 });
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('a'));
  pool.intercept({ path: '/api/v2/x', method: 'GET' }).reply(200, { ok: 1 }).delay(1000);
  await assert.rejects(client.apiGet('fr', '/api/v2/x'), /abort|timeout/i);
});

test('an unknown country is rejected before any network access', async () => {
  const { client } = setup();
  await assert.rejects(client.apiGet('zz', '/api/v2/x'), /Unknown country: zz/);
  await assert.rejects(client.apiGet('constructor', '/api/v2/x'), /Unknown country/);
});

test('pageGet caches the parsed result, not the document', async () => {
  const { pool, client } = setup();
  pool.intercept({ path: '/catalog', method: 'GET' }).reply(200, '', cookieHeader('a'));
  pool.intercept({ path: '/catalog?x=1', method: 'GET' }).reply(200, '<html>doc</html>'); // served once only
  let parses = 0;
  const parse = (html) => { parses++; return html.length; };
  assert.equal(await client.pageGet('fr', '/catalog?x=1', parse), 16);
  assert.equal(await client.pageGet('fr', '/catalog?x=1', parse), 16);
  assert.equal(parses, 1);
});
