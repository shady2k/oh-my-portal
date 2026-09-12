import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};

describe('agent setup contract', () => {
  it('installs the locked development dependencies and prepares local agent assets', () => {
    expect(pkg.scripts?.['agent:setup']).toBe('npm ci --include=dev && node scripts/setup-agent.ts');
    expect(pkg.devDependencies?.['@lancedb/lancedb']).toMatch(/^\^0\.38\./);
    expect(pkg.engines?.node).toBe('>=22.6');
    expect(existsSync(resolve('scripts/setup-agent.ts'))).toBe(true);
  });

  it('proves the installed LanceDB native module can perform Russian full-text search', () => {
    const result = spawnSync(process.execPath, ['scripts/setup-agent.ts', '--skip-model'], {
      cwd: resolve('.'),
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('LanceDB BM25 smoke check passed');
    expect(result.stdout).toContain('model prefetch skipped');
  });
});
