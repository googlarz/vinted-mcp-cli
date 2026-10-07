import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('--version comes from package.json', () => {
  assert.equal(run('--version').stdout.trim(), pkg.version);
});

test('--watch rejects a non-numeric or too-short interval before any request', () => {
  for (const bad of ['abc', '1', '0', '-5']) {
    const r = run('search', 'x', `--watch=${bad}`);
    assert.notEqual(r.status, 0, `--watch ${bad}`);
    assert.match(r.stderr, /--watch interval/);
  }
});

test('date filters are no longer advertised', () => {
  assert.doesNotMatch(run('search', '--help').stdout, /date-from|date-to/);
});

test('debug documents --show-cookie', () => {
  assert.match(run('debug', '--help').stdout, /--show-cookie/);
});
