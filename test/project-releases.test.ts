import { describe, expect, it, vi } from 'vitest';
import { createReleaseLookup } from '../src/project-releases.ts';

const repo = 'https://github.com/example/project';
const fallback = { repo, version: 'v1', release_date: new Date('2020-01-01') };

function mockGitHub(routes: Record<string, unknown>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api.github.com');
    const key = (url.pathname + url.search).replace('/repos/example/project/', '');
    const value = routes[key];
    return typeof value === 'number' ? new Response(null, { status: value }) : Response.json(value ?? null);
  });
}

describe('project releases', () => {
  it('prefers the public release and shares concurrent lookups', async () => {
    const fetcher = mockGitHub({ 'releases/latest': { tag_name: 'v2', published_at: '2026-11-01T02:00:00Z' } });
    const resolve = createReleaseLookup(fetcher);
    const result = { version: 'v2', date: new Date('2026-11-01T02:00:00Z'), source: 'release' };
    expect(await Promise.all([resolve(fallback), resolve({ repo: `${repo}.git` })])).toEqual([result, result]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses the tagger date for an annotated tag if there is no release', async () => {
    const resolve = createReleaseLookup(mockGitHub({
      'releases/latest': 404,
      'tags?per_page=1': [{ name: 'v2' }],
      'git/ref/tags/v2': { object: { type: 'tag', sha: 'one' } },
      'git/tags/one': { tagger: { date: '2026-11-02T00:00:00Z' } },
    }));
    expect(await resolve(fallback)).toEqual({ version: 'v2', date: new Date('2026-11-02'), source: 'tag' });
  });

  it('labels the target commit date for a lightweight tag', async () => {
    const resolve = createReleaseLookup(mockGitHub({
      'releases/latest': 404,
      'tags?per_page=1': [{ name: 'v2' }],
      'git/ref/tags/v2': { object: { type: 'commit', sha: 'one' } },
      'git/commits/one': { committer: { date: '2026-11-02T00:00:00Z' } },
    }));
    expect(await resolve(fallback)).toEqual({ version: 'v2', date: new Date('2026-11-02'), source: 'tag', dateKind: 'commit' });
  });

  it.each([404, 429, 500])('uses only the manual values if GitHub replies %s', async (status) => {
    const resolve = createReleaseLookup(mockGitHub({ 'releases/latest': status, 'tags?per_page=1': [] }));
    expect(await resolve(fallback)).toEqual({ version: 'v1', date: fallback.release_date, source: 'manual' });
    expect(await resolve({ repo })).toBeUndefined();
  });

  it('does not request non-GitHub or disabled repositories', async () => {
    const fetcher = mockGitHub({});
    expect(await createReleaseLookup(fetcher)({ ...fallback, repo: 'https://example.org/example/project' })).toMatchObject({ version: 'v1' });
    expect(await createReleaseLookup(fetcher, false)(fallback)).toMatchObject({ version: 'v1' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
