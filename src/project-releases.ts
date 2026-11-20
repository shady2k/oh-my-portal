export interface ProjectRelease {
  version: string;
  date?: Date;
  dateKind?: 'commit';
  source: 'release' | 'tag' | 'manual';
}

interface ReleaseFields {
  repo?: string;
  version?: string;
  release_date?: Date;
}

function githubProject(repo?: string): string | undefined {
  if (!repo) return;
  const url = new URL(repo);
  if (url.origin !== 'https://github.com' || url.username || url.password) return;
  return /^\/([a-z\d-]+\/[a-z\d_.-]+)\/?$/i.exec(url.pathname.replace(/\.git\/?$/, ''))?.[1]?.toLowerCase();
}

function date(value: string | undefined): Date | undefined {
  if (!value) return;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** One lookup per repository per build. Anonymous requests never expose private release data. */
export function createReleaseLookup(fetcher: typeof fetch = fetch, enabled = true) {
  const pending = new Map<string, Promise<ProjectRelease | undefined>>();

  async function get<T>(repo: string, path: string, signal: AbortSignal): Promise<T | undefined> {
    const response = await fetcher(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', signal,
    });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  }

  async function fetchRelease(repo: string): Promise<ProjectRelease | undefined> {
    const signal = AbortSignal.timeout(4_000);
    const release = await get<{ tag_name: string; published_at?: string }>(repo, 'releases/latest', signal);
    if (release?.tag_name) return { version: release.tag_name, date: date(release.published_at), source: 'release' };

    const [tag] = await get<{ name: string }[]>(repo, 'tags?per_page=1', signal) ?? [];
    if (!tag?.name) return;
    // Annotated tags carry their own timestamp. Lightweight tags have none;
    // show the target commit date explicitly as such, or just the tag if unknown.
    let taggedAt: Date | undefined;
    try {
      const ref = await get<{ object: { type: string; sha: string } }>(repo, `git/ref/tags/${encodeURIComponent(tag.name)}`, signal);
      if (ref?.object.type === 'tag') {
        const annotation = await get<{ tagger?: { date?: string } }>(repo, `git/tags/${ref.object.sha}`, signal);
        taggedAt = date(annotation?.tagger?.date);
      } else if (ref?.object.type === 'commit') {
        const commit = await get<{ committer?: { date?: string } }>(repo, `git/commits/${ref.object.sha}`, signal);
        taggedAt = date(commit?.committer?.date);
        return { version: tag.name, date: taggedAt, source: 'tag', ...(taggedAt && { dateKind: 'commit' as const }) };
      }
    } catch {
      // A tag is still useful without a verified date.
    }
    return { version: tag.name, date: taggedAt, source: 'tag' };
  }

  return async (data: ReleaseFields): Promise<ProjectRelease | undefined> => {
    const repo = enabled ? githubProject(data.repo) : undefined;
    if (repo) {
      if (!pending.has(repo)) {
        pending.set(repo, fetchRelease(repo).catch(() => {
          console.warn(`[project-releases] GitHub lookup failed for ${repo}; using project fallback`);
          return undefined;
        }));
      }
      const release = await pending.get(repo);
      if (release) return release;
    }
    return data.version ? { version: data.version, date: data.release_date, source: 'manual' } : undefined;
  };
}

export function releaseLabel(release: ProjectRelease): string {
  return release.source === 'tag' ? 'Тег' : 'Релиз';
}
