import { describe, expect, it } from 'vitest';

import { offLimits } from '../scripts/check-agent-paths.ts';

describe('offLimits', () => {
  it('lets an agent propose any change to the content itself', () => {
    expect(
      offLimits([
        'posts/a.md',
        'projects/a.md',
        'images/a/01.webp',
        'data/author.yaml',
        'data/embeddings/a.json',
        'migration/redirects.yaml',
        'README.md',
      ]),
    ).toEqual([]);
  });

  it('refuses the pipeline itself', () => {
    expect(offLimits(['.github/workflows/deploy.yml'])[0]).toMatch(/grant itself/);
  });

  it('names every offending file, not just the first', () => {
    expect(offLimits(['.github/workflows/checks.yml', '.github/engine-ref', 'posts/ok.md'])).toHaveLength(2);
  });
});
