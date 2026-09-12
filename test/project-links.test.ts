import { describe, expect, it } from 'vitest';

import { linkProblems, type LinkedProject, type LinkInput } from '../src/project-links.ts';

const project = (id: string, patch: Partial<LinkedProject> = {}): LinkedProject => ({
  id,
  slug: id,
  status: 'published',
  ...patch,
});

const check = (patch: Partial<LinkInput>) =>
  linkProblems({ posts: [], projects: [], preview: false, legacyRegister: false, ...patch });

describe('posts and projects agree', () => {
  it('accepts a post that names its project and a stage that links that post', () => {
    expect(
      check({
        posts: [{ id: 'first-post', projects: ['thing'] }],
        projects: [project('thing', { stages: [{ title: 'Prototype', post: 'first-post' }, { title: 'Next' }] })],
      }),
    ).toEqual([]);
  });

  it('accepts a post about two projects, each of whose stages links it', () => {
    expect(
      check({
        posts: [{ id: 'first-post', projects: ['thing', 'other'] }],
        projects: [
          project('thing', { stages: [{ title: 'Prototype', post: 'first-post' }] }),
          project('other', { stages: [{ title: 'Launch', post: 'first-post' }] }),
        ],
      }),
    ).toEqual([]);
  });

  it('refuses each project a post names that nobody wrote, not only the first', () => {
    expect(check({ posts: [{ id: 'first-post', projects: ['thing', 'ghost', 'phantom'] }], projects: [project('thing')] })).toEqual([
      'Post first-post: project ghost is not a published project',
      'Post first-post: project phantom is not a published project',
    ]);
  });

  it('refuses a post that names a project nobody wrote', () => {
    expect(check({ posts: [{ id: 'first-post', projects: ['ghost'] }] })).toEqual([
      'Post first-post: project ghost is not a published project',
    ]);
  });

  it('refuses a published post naming a draft project in production, and allows it in a preview', () => {
    const input = { posts: [{ id: 'first-post', projects: ['thing'] }], projects: [project('thing', { status: 'draft' })] };
    expect(check(input)).toEqual(['Post first-post: project thing is not a published project']);
    expect(check({ ...input, preview: true })).toEqual([]);
  });

  it('refuses a stage that links a post this build does not publish', () => {
    expect(check({ projects: [project('thing', { stages: [{ title: 'Prototype', post: 'missing' }] })] })).toEqual([
      'Project thing: stage "Prototype" links post missing, which is not a published post',
    ]);
  });

  it('refuses a stage whose post names no project, or another one', () => {
    const stages = [{ title: 'Prototype', post: 'first-post' }];
    expect(check({ posts: [{ id: 'first-post', projects: [] }], projects: [project('thing', { stages })] })).toEqual([
      'Project thing: stage "Prototype" links post first-post, which does not name this project',
    ]);
    expect(
      check({ posts: [{ id: 'first-post', projects: ['other'] }], projects: [project('thing', { stages }), project('other')] }),
    ).toEqual(['Project thing: stage "Prototype" links post first-post, which does not name this project']);
  });

  it('refuses a second featured project', () => {
    expect(check({ projects: [project('one', { featured: true }), project('two', { featured: true })] })).toEqual([
      'Only one project can be featured on the homepage: one, two',
    ]);
  });

  it('ignores a featured draft in production, where nobody sees it', () => {
    expect(check({ projects: [project('one', { featured: true }), project('two', { featured: true, status: 'draft' })] })).toEqual([]);
  });

  it('refuses a slug that differs from the file name, and a project called index', () => {
    expect(check({ projects: [project('thing', { slug: 'other-thing' }), project('index')] })).toEqual([
      'Project thing.md: slug other-thing must match the file name',
      'Project index.md: "index" is reserved for /projects/index.md',
    ]);
  });

  it('refuses the retired register rather than silently building without it', () => {
    expect(check({ legacyRegister: true })[0]).toMatch(/^data\/projects\.yaml is no longer read/);
  });

  it('reports every problem at once', () => {
    expect(check({ legacyRegister: true, posts: [{ id: 'first-post', projects: ['ghost'] }] })).toHaveLength(2);
  });
});
