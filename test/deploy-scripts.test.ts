import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The scripts that run beside the storage keys import nothing from npm.
 *
 * The deploy job has no `npm ci`, so that no code from the dependency tree runs
 * where the keys are. A bare import would fail there; this fails here first,
 * and says why.
 */
describe('the delete pass', () => {
  /*
   * A page's HTML outlives its deploy in every cache — a CDN, a browser — and
   * that HTML links the previous build's hashed stylesheet. Deleting it turned a
   * cached /archive/ into an unstyled page answering 403 for its CSS.
   */
  const syncLine = () =>
    execFileSync('node', ['scripts/deploy-s3.ts', 'dist-that-is-not-read', 'example-bucket', '--dry-run'], {
      encoding: 'utf8',
    })
      .split('\n')
      .find((line) => line.includes(' s3 sync ')) ?? '';

  it('keeps the hashed assets of earlier builds, which cached pages still link to', () => {
    expect(syncLine()).toContain('--exclude _astro/*');
  });

  it('still removes everything else the build no longer contains', () => {
    expect(syncLine()).toContain('--delete');
  });
});

describe('cache-control defaults', () => {
  const dryRun = () =>
    execFileSync('node', ['scripts/deploy-s3.ts', 'dist-that-is-not-read', 'example-bucket', '--dry-run'], {
      encoding: 'utf8',
    });

  it('keeps mutable content short-lived and hashed assets long-lived', () => {
    const output = dryRun();
    expect(output).toContain('max-age=60');
    expect(output).toContain('max-age=2592000');
  });
});

describe.each(['scripts/deploy-s3.ts', 'scripts/check-live.ts'])('%s', (file) => {
  it('imports only Node built-ins', () => {
    const source = readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
      (m) => m[1] ?? m[2],
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => !s.startsWith('node:'))).toEqual([]);
  });
});
