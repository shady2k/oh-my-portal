import { stringify as toYaml } from 'yaml';

import type { Post } from './posts.ts';

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
    kind: data.kind,
    author: data.author,
    lang: data.lang,
    summary: data.summary,
    tags: data.tags,
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
    kind: data.kind,
    author: data.author,
    lang: data.lang,
    summary: data.summary,
    tags: data.tags,
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
    if (post.data.tags.length) lines.push(`- темы: ${post.data.tags.join(', ')}`);
    lines.push(`- markdown: ${absolute(site, `/posts/${post.id}.md`)}`, '');
  }
  return lines.join('\n');
}

/** `/llms.txt` — the site map. Cheap, and it is what the Link header advertises. */
export function llmsTxt(posts: Post[], site: URL): string {
  const lines = [
    '# Записи',
    '',
    '> Записи о домашней инфраструктуре, инструментах и агентах.',
    '',
    'Каждый адрес отвечает и markdown: запросите его с `Accept: text/markdown`,',
    'либо возьмите `.md` напрямую. `/index.json` отдаёт весь каталог одним запросом.',
    '',
    '## Записи',
    '',
  ];
  for (const post of posts) {
    lines.push(
      `- [${post.data.title}](${absolute(site, `/posts/${post.id}.md`)}): ${post.data.summary}`,
    );
  }
  lines.push('', '## Прочее', '');
  lines.push(`- [Каталог JSON](${absolute(site, '/index.json')}): все записи с метаданными`);
  lines.push(`- [Полный текст](${absolute(site, '/llms-full.txt')}): все записи целиком`);
  lines.push(`- [RSS](${absolute(site, '/rss/')}): подписка`);
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
