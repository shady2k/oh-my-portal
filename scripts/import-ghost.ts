/**
 * Import from Ghost.
 *
 * Two stages, deliberately separate:
 *
 *   node scripts/import-ghost.ts fetch <out.json>
 *   node scripts/import-ghost.ts convert <out.json> <content-dir>
 *
 * `fetch` talks to the live blog once and writes everything it saw to disk.
 * `convert` never touches the network for prose. Splitting them means the
 * conversion can be re-run a hundred times while the decisions about cards,
 * summaries and images settle, without hammering somebody's blog and without
 * the source changing underfoot between runs. The dump is also the backup: once
 * Ghost is switched off, it is the only remaining copy of what was there.
 *
 * Credentials come from the environment, never from a file in this repository:
 *
 *   GHOST_API_URL         https://example.com
 *   GHOST_ADMIN_API_KEY   <id>:<hex secret>
 *
 * The Admin API rather than the Content API, because the Content API cannot see
 * drafts. This particular blog has none, but an importer that silently skips
 * unpublished work is a bad tool to hand the next person.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { gfm } from 'turndown-plugin-gfm';
import TurndownService from 'turndown';

import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';

import { expand } from '../src/redirects.ts';

/** Ghost signs Admin API requests with a short-lived JWT keyed by the id half. */
function adminToken(key: string): string {
  const [id, secret] = key.split(':');
  if (!id || !secret) throw new Error('GHOST_ADMIN_API_KEY must be `<id>:<hex secret>`');
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT', kid: id });
  const body = b64({ iat, exp: iat + 300, aud: '/admin/' });
  const sig = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function fetchAll(outPath: string): Promise<void> {
  const url = process.env.GHOST_API_URL;
  const key = process.env.GHOST_ADMIN_API_KEY;
  if (!url || !key) throw new Error('GHOST_API_URL and GHOST_ADMIN_API_KEY must both be set');

  const token = adminToken(key);
  const headers = { Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0' };

  /*
   * `formats=html,lexical` takes both renderings. `html` is what the converter
   * works from; `lexical` is the source of truth Ghost itself keeps, and it is
   * cheap to store now and impossible to recover once the blog is gone.
   */
  const query = 'limit=all&formats=html,lexical&include=tags,authors';
  const [posts, pages, tags] = await Promise.all(
    ['posts', 'pages', 'tags'].map(async (kind) => {
      const res = await fetch(`${url}/ghost/api/admin/${kind}/?${query}`, { headers });
      if (!res.ok) throw new Error(`GET ${kind}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return (await res.json())[kind];
    }),
  );

  const dump = {
    exported_at: new Date().toISOString(),
    source: url,
    counts: { posts: posts.length, pages: pages.length, tags: tags.length },
    posts,
    pages,
    tags,
  };
  await fs.writeFile(outPath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
  console.log(`${outPath}: ${posts.length} записей, ${pages.length} страниц, ${tags.length} тегов`);
}

/**
 * Ghost bookmark cards carry two images each — a favicon and a preview
 * thumbnail — and neither is an illustration. Removing the whole card before
 * looking for images is what separates the 36 pictures in these articles from
 * the 54 decorations around their links. The card itself becomes a plain
 * markdown link in the convert stage.
 */
const stripBookmarks = (html: string) =>
  html.replace(/<figure class="kg-card kg-bookmark-card[\s\S]*?<\/figure>/g, '');

/** Every illustration in the body, in document order, with its article. */
function illustrations(dump: any, slugOf: (old: string) => string) {
  const found: { slug: string; url: string }[] = [];
  for (const post of dump.posts) {
    for (const m of stripBookmarks(post.html ?? '').matchAll(/<img\b[^>]*src="([^"]+)"/g)) {
      found.push({ slug: slugOf(post.slug), url: m[1] });
    }
  }
  return found;
}

/**
 * Download every illustration and re-encode it.
 *
 * Why download the ones that are not ours: they were hotlinks, and a hotlink is
 * a picture somebody else can delete. One already 404s — a Play Store icon in
 * the SiYuan review — which is the argument making itself. Sixteen more come
 * from a club's file host and are the author's own screenshots of the apps he
 * was reviewing; in a review the screenshots are the content, not decoration.
 *
 * Re-encoding is not vanity: these are 2021-era screenshots straight out of a
 * CMS, and nothing has ever compressed them.
 */
async function fetchImages(dumpPath: string, mapPath: string, outDir: string): Promise<void> {
  const dump = JSON.parse(await fs.readFile(dumpPath, 'utf8'));
  const map = parseYaml(await fs.readFile(mapPath, 'utf8')) as { posts: Record<string, string> };
  const slugOf = (old: string) => map.posts[old] ?? old;

  /*
   * Resume rather than restart.
   *
   * These hosts time out at random — a different two or three each run — so a
   * fresh run is never a superset of the last one. Writing a manifest from
   * scratch therefore DROPS entries whose files are sitting on disk, and the
   * convert stage would turn those into broken links: data loss caused by
   * retrying, which is the worst kind. Seed from what is already there.
   */
  let manifest: Record<string, string> = {};
  try {
    manifest = JSON.parse(await fs.readFile(`${outDir}/manifest.json`, 'utf8'));
  } catch {
    /* first run */
  }
  const failures: { url: string; slug: string; why: string }[] = [];
  const seen = new Map<string, string>(Object.entries(manifest));
  const perSlug = new Map<string, number>();

  const exists = async (rel: string) =>
    fs
      .access(`${outDir}/${rel.replace(/^\/images\//, '')}`)
      .then(() => true)
      .catch(() => false);

  for (const { slug, url } of illustrations(dump, slugOf)) {
    const n = (perSlug.get(slug) ?? 0) + 1;
    perSlug.set(slug, n);

    const already = seen.get(url);
    if (already && (await exists(already))) {
      manifest[url] = already;
      continue;
    }

    try {
      /*
       * Three tries with a widening pause. Not politeness — necessity: the
       * failures observed here are transient and uncorrelated, and one pass
       * over 36 URLs reliably loses two or three of them.
       */
      let input: Buffer | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          input = Buffer.from(await res.arrayBuffer());
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
      if (!input) throw new Error('unreachable');

      /*
       * The name comes from the position in the article, not from the source
       * URL: Ghost's own filenames are content hashes and the foreign ones are
       * CDN keys. `03.webp` says where the picture is; the hash said nothing.
       */
      const image = sharp(input, { animated: true });
      const meta = await image.metadata();
      const animated = (meta.pages ?? 1) > 1;
      const ext = meta.format === 'svg' ? 'svg' : animated ? 'gif' : 'webp';
      const name = `${String(n).padStart(2, '0')}.${ext}`;
      const rel = `/images/${slug}/${name}`;

      let output = input;
      if (ext === 'webp') {
        // 1600px is twice the reading measure; beyond that a screenshot on this
        // site is only paying for bytes nobody sees.
        output = await image
          .resize({ width: Math.min(meta.width ?? 1600, 1600), withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      }

      await fs.mkdir(`${outDir}/${slug}`, { recursive: true });
      await fs.writeFile(`${outDir}/${slug}/${name}`, output);
      manifest[url] = rel;
      seen.set(url, rel);

      const saved = input.length && output.length < input.length
        ? ` (−${Math.round((1 - output.length / input.length) * 100)}%)`
        : '';
      console.log(`  ${rel.padEnd(46)} ${(output.length / 1024).toFixed(0)}k${saved}`);
    } catch (error) {
      failures.push({ url, slug, why: error instanceof Error ? error.message : String(error) });
    }
  }

  await fs.writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`\n${Object.keys(manifest).length} изображений, манифест: ${outDir}/manifest.json`);

  /*
   * Loudly, and without writing a manifest entry. A missing picture that the
   * convert stage silently turns into a broken link is exactly the failure this
   * whole exercise is meant to end.
   */
  if (failures.length) {
    console.error(`\n${failures.length} НЕ СКАЧАНО — эти места в тексте требуют решения:`);
    for (const f of failures) console.error(`  [${f.slug}] ${f.why}: ${f.url}`);
  }
}

/**
 * Ghost's HTML into markdown.
 *
 * Ghost stores Lexical and renders HTML from it. Converting the HTML is the
 * pragmatic choice — Lexical is Ghost's internal shape and reading it means
 * reimplementing their renderer — but it means the "cards" arrive as styled
 * markup with no markdown equivalent, and each needs a decision rather than a
 * best effort. Those decisions are below, next to the code that acts on them.
 */
function ghostToMarkdown(
  html: string,
  images: Record<string, string>,
  internal: { origin: string; resolve: (path: string) => string | undefined },
  losses: { kind: string; detail: string }[],
): string {
  let s = html;

  /*
   * Cross-references between articles arrive as absolute URLs on the old
   * domain, carrying the old slugs. Left alone they would still resolve — the
   * redirect map covers them — but every internal link would leave the site and
   * come back through a 301, and the article's markdown twin would advertise
   * the old address as canonical. The origin is taken from the export rather
   * than written here: this repository must not know which site it is building.
   */
  s = s.replace(new RegExp(`href="${internal.origin.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}([^"]*)"`, 'g'), (whole, path) => {
    const target = internal.resolve(String(path));
    if (target) return `href="${target}"`;
    losses.push({ kind: 'internal-link-unmapped', detail: `${internal.origin}${path}` });
    return whole;
  });

  /*
   * Telegram comment widgets. Three articles carry one. Comments are a platform
   * feature the new site does not have, and a `<script>` tag is not content at
   * all — dropping it is right, but it IS a loss and gets recorded rather than
   * disappearing quietly.
   */
  s = s.replace(/<script\b[^>]*data-telegram-discussion="([^"]*)"[\s\S]*?<\/script>/g, (_, d) => {
    losses.push({ kind: 'telegram-comments', detail: String(d) });
    return '';
  });
  s = s.replace(/<script[\s\S]*?<\/script>/g, '');

  /*
   * Bookmark cards become ordinary links. Each carried two pictures — a favicon
   * and a preview — which is 54 images across the export that are decoration
   * around a link rather than illustration in an article. The title and the URL
   * are the whole content; the description is the destination's own marketing
   * copy and is dropped.
   */
  s = s.replace(/<figure class="kg-card kg-bookmark-card[\s\S]*?<\/figure>/g, (card) => {
    const href = card.match(/<a class="kg-bookmark-container" href="([^"]+)"/)?.[1] ?? '';
    const title = card.match(/<div class="kg-bookmark-title">([\s\S]*?)<\/div>/)?.[1] ?? href;
    const clean = title.replace(/<[^>]+>/g, '').trim();
    return `<p><a href="${href}">${clean}</a></p>`;
  });

  /*
   * Header cards are section titles wearing a background colour. Ghost gives
   * them a heading and/or a subheading; in these articles they are used as
   * plain section breaks, so they become headings and lose the colour. Level 2:
   * they are full-width dividers, the same rank the articles' own `h2` carries.
   */
  s = s.replace(/<div class="kg-card kg-header-card[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, (card) => {
    const parts = [...card.matchAll(/<p[^>]*class="kg-header-card-(?:heading|subheading)"[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    return parts.map((t) => `<h2>${t}</h2>`).join('');
  });

  /* Callouts become blockquotes; the emoji is decoration and does not survive. */
  s = s.replace(/<div class="kg-card kg-callout-card[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g, (_, inner) => {
    const text = String(inner)
      .replace(/<div class="kg-callout-emoji">[\s\S]*?<\/div>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return `<blockquote><p>${text}</p></blockquote>`;
  });

  /*
   * Point every image at our own copy. `srcset` and `sizes` go with it: they
   * name Ghost's resized variants, which do not exist any more, and a stale
   * srcset is a broken image on exactly the screens that ask for it.
   */
  s = s.replace(/<img\b[^>]*>/g, (tag) => {
    const src = tag.match(/src="([^"]+)"/)?.[1] ?? '';
    const local = images[src];
    if (!local) {
      losses.push({ kind: 'image-not-downloaded', detail: src });
      return '';
    }
    const alt = tag.match(/alt="([^"]*)"/)?.[1] ?? '';
    return `<img src="${local}" alt="${alt}">`;
  });

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
  });
  turndown.use(gfm);

  /* Keep the language on a fence: 63 code blocks here and the highlighter needs it. */
  turndown.addRule('fencedCodeWithLanguage', {
    filter: (node) =>
      node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
    replacement: (_content, node: any) => {
      const code = node.firstChild;
      const language = (code.getAttribute('class') ?? '').match(/language-(\S+)/)?.[1] ?? '';
      return `\n\n\`\`\`${language}\n${code.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
    },
  });

  /* A caption is prose about the picture; keep it as a line under the image. */
  turndown.addRule('figureWithCaption', {
    filter: (node) => node.nodeName === 'FIGURE',
    replacement: (content) => `\n\n${content.trim()}\n\n`,
  });
  turndown.addRule('figcaption', {
    filter: 'figcaption',
    replacement: (content) => (content.trim() ? `\n*${content.trim()}*` : ''),
  });

  return (
    turndown
      .turndown(s)
      /* Turndown pads the bullet to four columns; two is the ordinary shape and
       * the `.md` twin is read as source, not only rendered. Nested items keep
       * their own leading indentation, which is what the capture preserves. */
      .replace(/^(\s*)-\s{3}/gm, '$1- ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** YAML for one value, quoting only when the value would otherwise be ambiguous. */
function yamlValue(v: string): string {
  return /^[\w][\w .,;:()\/–—-]*$/u.test(v) && !/: /.test(v) ? v : `'${v.replace(/'/g, "''")}'`;
}

async function convert(
  dumpPath: string,
  mapPath: string,
  tagsPath: string,
  imagesDir: string,
  outDir: string,
): Promise<void> {
  const dump = JSON.parse(await fs.readFile(dumpPath, 'utf8'));
  const map = parseYaml(await fs.readFile(mapPath, 'utf8')) as { posts: Record<string, string> };
  const tags = parseYaml(await fs.readFile(tagsPath, 'utf8')) as Record<string, string[]>;
  const images = JSON.parse(await fs.readFile(`${imagesDir}/manifest.json`, 'utf8'));

  /*
   * The redirect map, reused as a link resolver. It already states where every
   * old address now lives, so resolving an internal link from it means there is
   * one answer to "where did this go", not two that can disagree.
   */
  const expanded = expand(await fs.readFile(mapPath, 'utf8'));
  const byOldPath = new Map([...expanded.redirects, ...expanded.unchanged].map((r) => [r.from, r.to]));
  const internal = {
    origin: String(dump.source).replace(/\/$/, ''),
    resolve(path: string) {
      /* An even older shape survives in one article: `/blog/<slug>`, no trailing
       * slash. Normalising both before the lookup costs nothing and the map does
       * not have to carry addresses that were never in a sitemap. */
      const normalised = path.replace(/^\/blog\//, '/').replace(/\/?$/, '/');
      return byOldPath.get(normalised);
    },
  };

  await fs.mkdir(outDir, { recursive: true });
  const needSummary: string[] = [];
  const trimmed: { slug: string; was: string; now: string }[] = [];
  const repeatedLead: string[] = [];
  const allLosses: { slug: string; kind: string; detail: string }[] = [];
  let noAlt = 0;
  let withAlt = 0;

  for (const post of dump.posts) {
    const slug = map.posts[post.slug];
    if (!slug) throw new Error(`${post.slug} has no entry in the redirect map — refusing to invent one`);
    if (!(slug in tags)) throw new Error(`${slug} has no entry in ${tagsPath}`);

    const losses: { kind: string; detail: string }[] = [];
    const body = ghostToMarkdown(post.html ?? "", images, internal, losses);
    for (const l of losses) allLosses.push({ slug, ...l });

    for (const m of body.matchAll(/!\[([^\]]*)\]/g)) (m[1].trim() ? withAlt++ : noAlt++);

    /*
     * A summary must be written, not generated. The schema requires one, caps it
     * at 200 characters, and it is what feeds the archive rows, the feeds,
     * /index.json and the cards. Ghost's automatic excerpt is the first
     * paragraph with the end cut off, which is worse than nothing in a feed.
     *
     * So an article without a hand-written excerpt is imported as a DRAFT. It
     * then has no address and no feed entry in a production build (§4, asserted
     * in test/build.test.ts) and shows up under `npm run dev`, which is where
     * the summary gets written. Impossible by construction beats a TODO nobody
     * greps for.
     */
    /*
     * Three of the seven hand-written excerpts are longer than the schema's 200
     * characters. They get cut at a sentence boundary — the author's own words,
     * one of his own sentences dropped — and never rewritten or truncated
     * mid-word. Every cut is reported, because choosing which sentence carries
     * the article is an editorial act and the tool is only guessing.
     */
    const excerpt: string = (post.custom_excerpt ?? '').replace(/\s+/g, ' ').trim();
    let summary = excerpt;
    if (excerpt.length > 200) {
      const sentences = excerpt.match(/[^.!?]+[.!?]+/g) ?? [excerpt];
      let kept = '';
      for (const sentence of sentences) {
        if ((kept + sentence).trim().length > 200) break;
        kept += sentence;
      }
      summary = kept.trim();
      trimmed.push({ slug, was: excerpt, now: summary });
    }

    const status = summary ? 'published' : 'draft';
    if (!summary) needSummary.push(slug);

    /*
     * Ghost showed the excerpt only on the listing, so authors sometimes opened
     * the article with the same sentence again as a lead blockquote. This layout
     * prints the summary under the title, and the reader then meets it twice in
     * a row. Drop the repeat — but only on a real match of the opening block,
     * never on an article that merely begins on the same subject.
     */
    const flat = (s: string) => s.replace(/[>*_#[\]()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const [lead, ...restOfBody] = body.split('\n\n');
    const deduped =
      summary && lead && flat(lead).startsWith(flat(summary).slice(0, 60))
        ? restOfBody.join('\n\n').replace(/^(---\n+)/, '')
        : body;
    if (deduped !== body) repeatedLead.push(slug);

    const front = [
      '---',
      `title: ${yamlValue(post.title)}`,
      `slug: ${slug}`,
      `date: ${(post.published_at ?? post.created_at).slice(0, 10)}`,
      'kind: article',
      `status: ${status}`,
      'author: human',
      `summary: ${yamlValue(summary || 'НУЖНО НАПИСАТЬ: одно предложение, до 200 символов')}`,
      `tags: [${tags[slug].join(', ')}]`,
      'lang: ru',
      '---',
      '',
    ].join('\n');

    await fs.writeFile(`${outDir}/${slug}.md`, `${front}${deduped}\n`, 'utf8');
  }

  console.log(`${dump.posts.length} статей → ${outDir}`);
  console.log(`  опубликовано: ${dump.posts.length - needSummary.length}, черновиками: ${needSummary.length}`);
  console.log(`  alt есть у ${withAlt} картинок, отсутствует у ${noAlt}`);

  if (repeatedLead.length) {
    console.log(`\nЛид повторял summary, убран: ${repeatedLead.join(', ')}`);
  }
  if (trimmed.length) {
    console.log(`\nОБРЕЗАНО до 200 символов — проверь, то ли предложение осталось:`);
    for (const t of trimmed) {
      console.log(`  ${t.slug}`);
      console.log(`    было (${t.was.length}): ${t.was}`);
      console.log(`    стало (${t.now.length}): ${t.now}`);
    }
  }
  if (needSummary.length) {
    console.log(`\nЖДУТ summary (импортированы черновиками, в прод не попадут):`);
    for (const s of needSummary) console.log(`  ${s}`);
  }
  if (allLosses.length) {
    console.log(`\nПотеряно при конверсии:`);
    for (const l of allLosses) console.log(`  [${l.slug}] ${l.kind}: ${l.detail}`);
  }
}

const [stage, ...rest] = process.argv.slice(2);
switch (stage) {
  case 'fetch':
    if (rest.length !== 1) throw new Error('usage: import-ghost.ts fetch <out.json>');
    await fetchAll(rest[0]);
    break;
  case 'images':
    if (rest.length !== 3) throw new Error('usage: import-ghost.ts images <dump.json> <redirects.yaml> <out-dir>');
    await fetchImages(rest[0], rest[1], rest[2]);
    break;
  case 'convert':
    if (rest.length !== 5) {
      throw new Error('usage: import-ghost.ts convert <dump.json> <redirects.yaml> <tags.yaml> <images-dir> <out-dir>');
    }
    await convert(rest[0], rest[1], rest[2], rest[3], rest[4]);
    break;
  default:
    throw new Error(`unknown stage ${stage ?? '(none)'} — expected: fetch, images, convert`);
}
