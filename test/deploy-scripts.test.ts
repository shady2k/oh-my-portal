import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The scripts that run beside the storage keys import nothing from npm.
 *
 * The deploy job has no `npm ci`, so that no code from the dependency tree runs
 * where the keys are. A bare import would fail there; this fails here first,
 * and says why.
 */
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
