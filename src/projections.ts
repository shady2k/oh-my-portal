import { stringify as toYaml } from 'yaml';

import type { Post } from './posts.ts';
import type { ProjectFrontmatter } from './schema/project.ts';

/** Shaped like a loaded project entry; only what the projections read. */
export interface ProjectEntry {
  id: string;
  body?: string;
  data: ProjectFrontmatter;
}

/**
 * The projections — design §6.
 *
 * Every machine-readable output is built here and nowhere else. The design's
 * central claim is that the human version and the agent version "cannot drift by
 * construction"; that is only true while one function produces each of them from
 * the same frontmatter. A second place that assembles markdown is the drift.
 *
 * Roles are not interchangeable. `.md` carries the text, because prose in JSON
 * costs escaping and `\n` around every field. `.json` carries the core and the
 * metadata and no prose at all.
 */

/** `/posts/<slug>/` — the address both versions answer at. */
export const postPath = (post: Post) => `/posts/${post.id}/`;

/** `/projects/<slug>/` — the project page and its markdown twin. */
export const projectPath = (project: { id: string }) => `/projects/${project.id}/`;

const absolute = (site: URL, path: string) => new URL(path, site).href;

/**
 * The `.md` twin: the source frontmatter plus a canonical URL, then the source
 * body. It is the source, not a rendering of it — that is what makes it high
 * fidelity for an agent running commands out of it.
 *
 * The canonical URL and the verification date travel inside the file on purpose:
 * it will be scraped either way, and the only question is whether attribution
 * goes with it.
 */
export function articleMarkdown(post: Post, site: URL): string {
  const { data } = post;
  const front = {
    title: data.title,
    slug: post.id,
    canonical: absolute(site, postPath(post)),
    date: iso(data.date),
    ...(data.updated ? { updated: iso(data.updated) } : {}),
    ...(data.revisions ? { revisions: data.revisions.map((r) => ({ ...r, date: iso(r.date) })) } : {}),
    kind: data.kind,
    author: data.author,
    lang: data.lang,
    summary: data.summary,
    tags: data.tags,
    ...(data.project ? { project: absolute(site, projectPath({ id: data.project })) } : {}),
    ...(data.tools ? { tools: data.tools } : {}),
    ...(data.sources ? { sources: data.sources } : {}),
    ...(data.related ? { related: data.related.map((s) => absolute(site, `/posts/${s}/`)) } : {}),
    // The structured core, first block, exactly as authored (§6).
    ...(data.recipe ? { recipe: serialiseRecipe(data.recipe) } : {}),
  };
  return `---\n${toYaml(front)}---\n\n${post.body?.trim() ?? ''}\n`;
}

/**
 * The `.json` twin: the core and the metadata. No prose — that is the `.md`
 * file's job, and duplicating it here would be the drift this design avoids.
 */
export function articleJson(post: Post, site: URL) {
  const { data } = post;
  return {
    title: data.title,
    slug: post.id,
    canonical: absolute(site, postPath(post)),
    markdown: absolute(site, `/posts/${post.id}.md`),
    date: iso(data.date),
    ...(data.updated ? { updated: iso(data.updated) } : {}),
    ...(data.revisions ? { revisions: data.revisions.map((r) => ({ ...r, date: iso(r.date) })) } : {}),
    kind: data.kind,
    author: data.author,
    lang: data.lang,
    summary: data.summary,
    tags: data.tags,
    ...(data.project ? { project: absolute(site, projectPath({ id: data.project })) } : {}),
    ...(data.tools ? { tools: data.tools } : {}),
    ...(data.sources ? { sources: data.sources } : {}),
    ...(data.related ? { related: data.related.map((s) => absolute(site, `/posts/${s}/`)) } : {}),
    ...(data.recipe ? { recipe: serialiseRecipe(data.recipe) } : {}),
  };
}

/** `/index.json` — the whole catalogue in one request, so the agent filters locally. */
export function indexJson(posts: Post[], site: URL) {
  return {
    site: site.href,
    generated: new Date().toISOString(),
    count: posts.length,
    posts: posts.map((post) => ({
      title: post.data.title,
      slug: post.id,
      canonical: absolute(site, postPath(post)),
      markdown: absolute(site, `/posts/${post.id}.md`),
      json: absolute(site, `/posts/${post.id}.json`),
      date: iso(post.data.date),
      lang: post.data.lang,
      author: post.data.author,
      summary: post.data.summary,
      tags: post.data.tags,
      ...(post.data.project ? { project: absolute(site, projectPath({ id: post.data.project })) } : {}),
      /* Whether there is a structured core, so an agent can skip the essays. */
      has_recipe: Boolean(post.data.recipe),
    })),
  };
}

/** `/index.md` — the catalogue for a client that negotiated markdown at `/`. */
export function catalogueMarkdown(posts: Post[], site: URL): string {
  const lines = ['# Записи', ''];
  for (const post of posts) {
    lines.push(`## [${post.data.title}](${absolute(site, postPath(post))})`, '');
    lines.push(`${post.data.summary}`, '');
    lines.push(`- дата: ${iso(post.data.date)}`);
    for (const revision of post.data.revisions ?? []) {
      lines.push(`- передумал (${iso(revision.date)}): ${revision.before} → ${revision.after}. ${revision.reason}`);
    }
    if (post.data.tags.length) lines.push(`- темы: ${post.data.tags.join(', ')}`);
    lines.push(`- markdown: ${absolute(site, `/posts/${post.id}.md`)}`, '');
  }
  return lines.join('\n');
}

/** `/llms.txt` — the site map. Cheap, and it is what the Link header advertises. */
export function llmsTxt(posts: Post[], site: URL, tags: string[] = [], projects: ProjectEntry[] = [], label: Record<string, string> = {}): string {
  const lines = [
    '# Записи',
    '',
    '> Записи о домашней инфраструктуре, инструментах и агентах.',
    '',
    // Only what every deploy serves: object storage does not negotiate (ADR-0001).
    'У каждой записи есть markdown-версия по своему адресу, `.md` — ссылки ниже.',
    '`/index.json` отдаёт весь каталог одним запросом.',
    '',
    '## Записи',
    '',
  ];
  for (const post of posts) {
    lines.push(
      `- [${post.data.title}](${absolute(site, `/posts/${post.id}.md`)}): ${post.data.summary}`,
    );
  }
  if (projects.length) {
    lines.push('', '## Проекты', '');
    for (const project of projects) {
      lines.push(
        `- [${project.data.title}](${absolute(site, `/projects/${project.id}.md`)}): ${label[project.data.state] ?? project.data.state} — ${project.data.summary}`,
      );
    }
  }
  lines.push('', '## Прочее', '');
  lines.push(`- [Каталог JSON](${absolute(site, '/index.json')}): все записи с метаданными`);
  lines.push(`- [Полный текст](${absolute(site, '/llms-full.txt')}): все записи целиком`);
  lines.push(`- [RSS](${absolute(site, '/rss/')}): подписка на все записи`);
  lines.push(`- [Архив](${absolute(site, '/archive/index.md')}): полный журнал`);
  for (const tag of tags) {
    lines.push(`- [RSS: ${tag}](${absolute(site, `/feeds/${tag}.xml`)}): подписка только на эту тему`);
  }
  return lines.join('\n') + '\n';
}

/** `/llms-full.txt` — every article in full, for a client that would rather fetch once. */
export function llmsFullTxt(posts: Post[], site: URL): string {
  const head = `# Записи — полный текст\n\nСгенерировано ${new Date().toISOString()}. Канонический адрес каждой записи указан в её блоке.\n`;
  return [head, ...posts.map((post) => articleMarkdown(post, site))].join('\n---\n\n');
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Dates inside the core are Date objects after parsing; YAML and JSON both want the string. */
function serialiseRecipe(recipe: NonNullable<Post['data']['recipe']>) {
  return { ...recipe, verified_on: iso(recipe.verified_on) };
}

/** `/about/index.md` — the page prose, if any, plus the contacts that R3 asks for. */
export function aboutMarkdown(
  author: { name: string; bio: string; contact: { label: string; href: string }; links: { label: string; href: string }[] } | undefined,
  body: string | undefined,
): string {
  const lines = ['# Обо мне', ''];
  if (author) lines.push(author.bio, '');
  if (body) lines.push(body.trim(), '');
  if (author) {
    lines.push('## Связаться', '');
    lines.push(`- ${author.contact.label}: ${author.contact.href}`);
    for (const link of author.links) lines.push(`- ${link.label}: ${link.href}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * `/projects/index.md` — the register, state and all.
 *
 * The state belongs in the machine version as much as in the human one: an
 * agent summarising someone's work should be able to say a project is archived
 * rather than inferring liveness from a commit date.
 */
export function projectsMarkdown(projects: ProjectEntry[], label: Record<string, string>, site: URL, body?: string): string {
  const lines = ['# Проекты', ''];
  if (body) lines.push(body.trim(), '');
  for (const project of projects) {
    const { data } = project;
    lines.push(`## [${data.title}](${absolute(site, projectPath(project))})`, '');
    lines.push(data.summary, '');
    if (data.question) lines.push(`Открытый вопрос: ${data.question}`, '');
    if (data.sketch) lines.push(data.sketch.caption, '');
    if (data.sketch?.annotations) lines.push(`Пометки к рисунку: ${data.sketch.annotations.join('; ')}.`, '');
    if (data.observation) lines.push(`Наблюдение: ${data.observation}`, '');
    for (const stage of data.stages ?? []) {
      lines.push(`- ${stage.title} (${stage.state})${stage.post ? `: /posts/${stage.post}/` : ''}`);
    }
    lines.push(`- состояние: ${label[data.state] ?? data.state} (\`${data.state}\`)`);
    if (data.since) lines.push(`- с: ${iso(data.since)}`);
    if (data.repo) lines.push(`- исходники: ${data.repo}`);
    if (data.site) lines.push(`- сайт: ${data.site}`);
    lines.push(`- markdown: ${absolute(site, `/projects/${project.id}.md`)}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * `/projects/<slug>.md` — the project page for a client that wants markdown:
 * the register's facts, the body as authored, and what was written about it.
 */
export function projectMarkdown(project: ProjectEntry, posts: Post[], site: URL, label: Record<string, string>): string {
  const { data } = project;
  const lines = [`# ${data.title}`, '', data.summary, ''];
  lines.push(`- состояние: ${label[data.state] ?? data.state} (\`${data.state}\`)`);
  if (data.since) lines.push(`- с: ${iso(data.since)}`);
  if (data.repo) lines.push(`- исходники: ${data.repo}`);
  if (data.site) lines.push(`- сайт: ${data.site}`);
  lines.push(`- адрес: ${absolute(site, projectPath(project))}`, '');
  if (data.stages) {
    lines.push('## Этапы', '');
    for (const stage of data.stages) {
      lines.push(`- ${stage.title} (${stage.state})${stage.post ? `: ${absolute(site, `/posts/${stage.post}/`)}` : ''}`);
    }
    lines.push('');
  }
  if (data.observation) lines.push(`Наблюдение: ${data.observation}`, '');
  if (data.question) lines.push(`Открытый вопрос: ${data.question}`, '');
  if (data.sketch) lines.push(data.sketch.caption, '');
  if (data.sketch?.annotations) lines.push(`Пометки к рисунку: ${data.sketch.annotations.join('; ')}.`, '');
  if (project.body?.trim()) lines.push(project.body.trim(), '');
  if (posts.length) {
    lines.push('## Записи о проекте', '');
    for (const post of posts) {
      lines.push(`- [${post.data.title}](${absolute(site, `/posts/${post.id}.md`)}): ${post.data.summary}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
