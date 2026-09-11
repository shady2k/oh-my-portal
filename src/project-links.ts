/**
 * How posts and projects refer to each other — project-pages design §3.3.
 *
 * Pure on purpose: it takes what a build can see and returns everything that is
 * wrong, so each rule is tested without booting Astro, and a content repository
 * with three mistakes learns about all three in one build rather than one per
 * build.
 */

export interface LinkedPost {
  id: string;
  project?: string;
}

export interface LinkedProject {
  /** The collection id: the file name without `.md`. */
  id: string;
  slug: string;
  status: 'draft' | 'published';
  featured?: boolean;
  stages?: { title: string; post?: string }[];
}

export interface LinkInput {
  /** The posts this build publishes — `listPosts()`, with the draft rule applied. */
  posts: LinkedPost[];
  /** Every project file, drafts included. */
  projects: LinkedProject[];
  /** A preview build shows drafts, so there a draft project is a real target. */
  preview: boolean;
  /** Whether the retired `data/projects.yaml` is still in the content repository. */
  legacyRegister: boolean;
}

export function linkProblems({ posts, projects, preview, legacyRegister }: LinkInput): string[] {
  const problems: string[] = [];

  /* An engine that silently ignored the old register would publish a site with
     no projects and no error. */
  if (legacyRegister) {
    problems.push(
      'data/projects.yaml is no longer read: each project is projects/<slug>.md, with the register fields in its frontmatter',
    );
  }

  /* The id is the file name, so two projects cannot share an address; the slug
     only has to agree with it. `index` would collide with /projects/index.md. */
  for (const project of projects) {
    if (project.id === 'index') problems.push('Project index.md: "index" is reserved for /projects/index.md');
    else if (project.slug !== project.id) problems.push(`Project ${project.id}.md: slug ${project.slug} must match the file name`);
  }

  const visible = projects.filter((project) => preview || project.status === 'published');
  const visibleIds = new Set(visible.map((project) => project.id));
  const projectOf = new Map(posts.map((post) => [post.id, post.project]));

  /* A stage and the post it links cannot disagree about where the post belongs. */
  for (const project of visible) {
    for (const stage of project.stages ?? []) {
      if (!stage.post) continue;
      if (!projectOf.has(stage.post)) {
        problems.push(`Project ${project.id}: stage "${stage.title}" links post ${stage.post}, which is not a published post`);
      } else if (projectOf.get(stage.post) !== project.id) {
        problems.push(`Project ${project.id}: stage "${stage.title}" links post ${stage.post}, which does not name this project`);
      }
    }
  }

  /* What keeps a published post from linking a project page production never built. */
  for (const post of posts) {
    if (post.project && !visibleIds.has(post.project)) {
      problems.push(`Post ${post.id}: project ${post.project} is not a published project`);
    }
  }

  const featured = visible.filter((project) => project.featured).map((project) => project.id);
  if (featured.length > 1) problems.push(`Only one project can be featured on the homepage: ${featured.join(', ')}`);

  return problems;
}
