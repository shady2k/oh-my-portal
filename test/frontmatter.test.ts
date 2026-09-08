import { describe, expect, it } from 'vitest';

import { frontmatter } from '../src/schema/frontmatter.ts';

/** The smallest frontmatter that publishes — every required field, nothing else. */
const minimal = {
  title: 'Kubernetes pod logs in a homelab',
  slug: 'kubernetes-pod-logs',
  date: '2026-05-14',
  kind: 'article',
  status: 'published',
  author: 'human',
  summary: 'Collecting pod logs without running a log stack you then have to maintain.',
  tags: ['kubernetes', 'homelab'],
  lang: 'ru',
};

const parse = (patch: Record<string, unknown> = {}) =>
  frontmatter.safeParse({ ...minimal, ...patch });

const rejects = (patch: Record<string, unknown>) => expect(parse(patch).success).toBe(false);

describe('required fields', () => {
  it('accepts the minimal entry', () => {
    const result = parse();
    expect(result.success).toBe(true);
    expect(result.data?.date).toBeInstanceOf(Date);
  });

  it('rejects a missing one', () => {
    for (const field of Object.keys(minimal)) {
      const { [field]: _dropped, ...rest } = minimal as Record<string, unknown>;
      expect(frontmatter.safeParse(rest).success, `${field} should be required`).toBe(false);
    }
  });

  it('accepts a post that joins no tag group', () => {
    expect(parse({ tags: [] }).success).toBe(true);
  });
});

describe('the agent boundary', () => {
  it('rejects a field nobody defined', () => {
    // Design §9: an invented field breaks the build instead of being ignored.
    rejects({ catgeory: 'homelab' });
  });

  it('rejects a value outside its enum', () => {
    rejects({ kind: 'recipe' });
    rejects({ status: 'live' });
    rejects({ author: 'claude' });
  });
});

describe('slugs', () => {
  it('rejects anything but lowercase hyphenated words', () => {
    for (const slug of ['Kubernetes-Logs', 'kubernetes_logs', 'kubernetes--logs', '-logs', 'logs-', 'логи', '']) {
      rejects({ slug });
    }
  });

  it('applies the same rule to tags and to related', () => {
    rejects({ tags: ['Kubernetes'] });
    rejects({ related: ['Some_Slug'] });
  });
});

describe('optional fields', () => {
  it('accepts aliases only as site-absolute paths with a trailing slash', () => {
    expect(parse({ aliases: ['/sbor-loghov-iz-podov-kubernetes/', '/'] }).success).toBe(true);
    rejects({ aliases: ['sbor-loghov/'] });
    rejects({ aliases: ['/sbor-loghov'] });
    rejects({ aliases: ['https://elsewhere.example/x'] });
  });

  it('rejects an update that precedes publication', () => {
    rejects({ updated: '2026-05-13' });
    expect(parse({ updated: '2026-05-15' }).success).toBe(true);
  });

  it('rejects an entry that lists itself as related', () => {
    rejects({ related: [minimal.slug] });
    expect(parse({ related: ['k3s-homelab-setup'] }).success).toBe(true);
  });

  it('requires sources to be URLs', () => {
    expect(parse({ sources: ['https://kubernetes.io/docs/'] }).success).toBe(true);
    rejects({ sources: ['kubernetes docs'] });
  });

  it('caps the summary, because it goes into cards and llms.txt', () => {
    rejects({ summary: 'x'.repeat(201) });
  });

  it('takes a BCP 47 language and nothing else', () => {
    expect(parse({ lang: 'pt-BR' }).success).toBe(true);
    rejects({ lang: 'russian' });
    rejects({ lang: 'RU' });
  });
});

describe('the article core', () => {
  const recipe = {
    goal: 'Tool A behind tool B',
    verified_on: '2026-05-14',
    stack: [{ name: 'some-tool', version: '1.5.9' }],
    steps: [{ id: 'install', cmd: 'apt-get install -y some-tool', note: 'on the host, not in a pod' }],
    pitfalls: [{ symptom: '502 after restart', cause: 'upstream not ready', fix: 'add a readiness probe' }],
    do_not: ['do not enable X together with Y — port conflict'],
  };

  it('accepts a full core', () => {
    expect(parse({ recipe }).success).toBe(true);
  });

  it('treats an absent core as normal — an essay has none', () => {
    expect(parse().success).toBe(true);
  });

  it('requires goal and verified_on once a core is present', () => {
    rejects({ recipe: { goal: 'x' } });
    rejects({ recipe: { verified_on: '2026-05-14' } });
    expect(parse({ recipe: { goal: 'x', verified_on: '2026-05-14' } }).success).toBe(true);
  });

  it('rejects an invented key inside the core too', () => {
    rejects({ recipe: { ...recipe, difficulty: 'medium' } });
    rejects({ recipe: { ...recipe, steps: [{ id: 'install', cmd: 'x', warning: 'y' }] } });
  });
});
