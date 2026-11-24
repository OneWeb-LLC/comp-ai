import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../../..');

test('Vercel JSON defines monorepo install and build', () => {
  for (const app of ['apps/app/vercel.json', 'apps/portal/vercel.json']) {
    const config = JSON.parse(
      readFileSync(path.join(repoRoot, app), 'utf8'),
    );
    assert.match(config.installCommand, /bun install/);
    assert.match(config.buildCommand, /vercel-build\.sh/);
    assert.deepEqual(config.regions, ['iad1']);
  }
});

test('Vercel build scripts exist', () => {
  for (const script of [
    'scripts/vercel-monorepo-build.sh',
    'apps/app/vercel-build.sh',
    'apps/portal/vercel-build.sh',
  ]) {
    assert.ok(existsSync(path.join(repoRoot, script)));
  }
});

test('deploy/vercel README covers required topics', () => {
  const readme = readFileSync(
    path.join(repoRoot, 'deploy/vercel/README.md'),
    'utf8',
  );
  assert.match(readme, /Supabase/);
  assert.match(readme, /Trigger\.dev/);
  assert.match(readme, /Rollback/);
});