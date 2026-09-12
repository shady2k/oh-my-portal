import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  articleJson,
  articleMarkdown,
  catalogueMarkdown,
  indexJson,
  llmsTxt,
  projectMarkdown,
  projectsMarkdown,
} from '../src/projections.ts';
import { project as projectSchema } from '../src/schema/project.ts';

const SITE = new URL('https://example.com/');

describe('the register in markdown', () => {
  const data = {
    title: 'Example', slug: 'example', status: 'published', lang: 'ru',
    summary: 'Synthetic experiment', state: 'experiment', question: 'What changes?',
    sketch: { center: 'agent', labels: ['memory', 'experience', 'initiative', 'character'], caption: 'Four influences on the agent.' },
  };
  const entry = (patch: Record<string, unknown> = {}) => ({ id: 'example', data: projectSchema.parse({ ...data, ...patch }) });

  it('keeps the diagram explanation and the open question', () => {
    const md = projectsMarkdown([entry()], { experiment: 'experiment' }, SITE);
    expect(md).toContain(data.question);
    expect(md).toContain(data.sketch.caption);
  });

  it('keeps the pencil annotations of the built-in artwork', () => {
    const annotations = ['Facts survived', 'Still testing', 'Context breaks here'];
    const md = projectsMarkdown([entry({ sketch: { ...data.sketch, artwork: 'memory-study', annotations } })], { experiment: 'experiment' }, SITE);
    for (const annotation of annotations) expect(md).toContain(annotation);
  });

  it('keeps the caption and notes of a picture from the content images', () => {
    const annotations = ['Первая пометка', 'Вторая пометка', 'Третья пометка'];
    const sketch = { image: '/images/example/sketch.svg', caption: 'A drawing of the project.', annotations };
    const md = projectsMarkdown([entry({ sketch })], { experiment: 'experiment' }, SITE);
    expect(md).toContain(sketch.caption);
    for (const annotation of annotations) expect(md).toContain(annotation);
  });
});

/** Shaped like a loaded collection entry; only the fields the projections read. */
const post = {
  id: 'reverse-proxy-behind-wireguard',
  body: '# Заголовок\n\nТело статьи.\n',
  data: {
    title: 'Обратный прокси за WireGuard',
    date: new Date('2026-04-11'),
    kind: 'article',
    status: 'published',
    author: 'human',
    lang: 'ru',
    summary: 'Одно предложение.',
    tags: ['homelab', 'security'],
    tools: [{ name: 'caddy', version: '2.9' }],
    sources: ['https://www.wireguard.com/quickstart/'],
    related: ['why-i-stopped-tuning-my-setup'],
    recipe: {
      goal: 'Цель',
      verified_on: new Date('2026-04-11'),
      stack: [{ name: 'caddy', version: '2.9' }],
      do_not: ['не так'],
    },
  },
} as never;

const essay = {
  id: 'why-i-stopped-tuning-my-setup',
  body: 'Только проза.\n',
  data: {
    title: 'Почему я перестал',
    date: new Date('2026-06-02'),
    kind: 'article',
    status: 'published',
    author: 'human',
    lang: 'ru',
    summary: 'Другое предложение.',
    tags: ['pkms'],
  },
} as never;

describe('the .md twin', () => {
  const md = articleMarkdown(post, SITE);
  const front = parseYaml(md.split('---')[1]);

  it('is the source body, not a rendering of it', () => {
    expect(md).toContain('# Заголовок\n\nТело статьи.');
    expect(md).not.toContain('<h1');
  });

  it('carries the canonical URL, so attribution travels with a scrape', () => {
    expect(front.canonical).toBe('https://example.com/posts/reverse-proxy-behind-wireguard/');
  });

  it('puts the structured core in the first block', () => {
    expect(md.indexOf('recipe:')).toBeLessThan(md.indexOf('# Заголовок'));
    expect(front.recipe.goal).toBe('Цель');
  });

  it('keeps a version a string through a YAML round trip', () => {
    // `2.9` unquoted would come back as a number and break an agent comparing versions.
    expect(typeof front.tools[0].version).toBe('string');
    expect(typeof front.recipe.stack[0].version).toBe('string');
  });

  it('turns related slugs into addresses a client can fetch', () => {
    expect(front.related).toEqual(['https://example.com/posts/why-i-stopped-tuning-my-setup/']);
  });

  it('leaves out what the entry does not have', () => {
    const plain = parseYaml(articleMarkdown(essay, SITE).split('---')[1]);
    expect(plain).not.toHaveProperty('recipe');
    expect(plain).not.toHaveProperty('updated');
  });
});

describe('the .json twin', () => {
  const json = articleJson(post, SITE);

  it('carries the core and the metadata', () => {
    expect(json.recipe?.goal).toBe('Цель');
    expect(json.summary).toBe('Одно предложение.');
  });

  it('carries no prose — text lives only in the .md', () => {
    expect(JSON.stringify(json)).not.toContain('Тело статьи');
  });

  it('points at the .md rather than duplicating it', () => {
    expect(json.markdown).toBe('https://example.com/posts/reverse-proxy-behind-wireguard.md');
  });

  it('serialises dates as dates, not as timestamps', () => {
    expect(json.date).toBe('2026-04-11');
    expect(json.recipe?.verified_on).toBe('2026-04-11');
  });
});

describe('/index.json', () => {
  const index = indexJson([post, essay], SITE);

  it('lists every entry with its language', () => {
    expect(index.count).toBe(2);
    expect(index.posts.map((p) => p.lang)).toEqual(['ru', 'ru']);
  });

  it('says which entries have a structured core, so an agent can skip the essays', () => {
    expect(index.posts.map((p) => p.has_recipe)).toEqual([true, false]);
  });

  it('gives absolute addresses for all three representations', () => {
    const first = index.posts[0]!;
    for (const url of [first.canonical, first.markdown, first.json]) {
      expect(url.startsWith('https://example.com/')).toBe(true);
    }
  });
});

describe('/llms.txt', () => {
  const txt = llmsTxt([post, essay], SITE);

  it('links every entry at its markdown address', () => {
    expect(txt).toContain('/posts/reverse-proxy-behind-wireguard.md');
    expect(txt).toContain('/posts/why-i-stopped-tuning-my-setup.md');
  });

  it('points at the catalogue and the full text', () => {
    expect(txt).toContain('/index.json');
    expect(txt).toContain('/llms-full.txt');
  });

  it('promises only what every deploy serves, so not negotiation on Accept (ADR-0001)', () => {
    // Object storage answers `Accept: text/markdown` with HTML; an agent told
    // otherwise asks for markdown, gets a page, and leaves.
    expect(txt).not.toMatch(/Accept/i);
    expect(txt).toContain('`.md`');
  });
});

describe('the markdown catalogue', () => {
  it('summarises rather than reproducing the articles', () => {
    const md = catalogueMarkdown([post, essay], SITE);
    expect(md).toContain('Одно предложение.');
    expect(md).not.toContain('Тело статьи');
  });
});

describe('a project page in markdown', () => {
  const entry = {
    id: 'example',
    body: '## Как устроено\n\nТекст страницы.\n',
    data: projectSchema.parse({
      title: 'Example', slug: 'example', status: 'published', lang: 'ru', state: 'active',
      summary: 'Synthetic.', stages: [{ title: 'Prototype', state: 'done', post: 'reverse-proxy-behind-wireguard' }, { title: 'Next', state: 'next' }],
      repo: 'https://github.com/example/example',
    }),
  };
  const md = projectMarkdown(entry, [post], SITE, { active: 'в работе' });

  it('leads with the project and its state', () => {
    expect(md.startsWith('# Example\n\nSynthetic.\n')).toBe(true);
    expect(md).toContain('- состояние: в работе (`active`)');
    expect(md).toContain('- адрес: https://example.com/projects/example/');
  });

  it('lists the stages with absolute addresses', () => {
    expect(md).toContain('- Prototype (done): https://example.com/posts/reverse-proxy-behind-wireguard/');
    expect(md).toContain('- Next (next)');
  });

  it('carries the body as authored, and the posts about the project', () => {
    expect(md).toContain('## Как устроено\n\nТекст страницы.');
    expect(md).toContain('## Записи о проекте');
    expect(md).toContain('- [Обратный прокси за WireGuard](https://example.com/posts/reverse-proxy-behind-wireguard.md): Одно предложение.');
  });
});

describe('a post that belongs to a project', () => {
  const base = post as unknown as { id: string; body: string; data: Record<string, unknown> };
  const member = { ...base, data: { ...base.data, project: 'some-project' } } as never;
  const url = 'https://example.com/projects/some-project/';

  it('names it by address in both twins and in the catalogue', () => {
    expect(parseYaml(articleMarkdown(member, SITE).split('---')[1]!).project).toBe(url);
    expect(articleJson(member, SITE).project).toBe(url);
    expect(indexJson([member], SITE).posts[0]!.project).toBe(url);
  });

  it('leaves the field out for a post that belongs to none', () => {
    expect(articleJson(essay, SITE)).not.toHaveProperty('project');
  });
});

describe('/llms.txt and the projects', () => {
  const project = {
    id: 'example',
    data: projectSchema.parse({ title: 'Example', slug: 'example', status: 'published', lang: 'ru', state: 'active', summary: 'Synthetic.' }),
  };

  it('lists each project at its markdown address with its state', () => {
    const txt = llmsTxt([post], SITE, [], [project], { active: 'в работе' });
    expect(txt).toContain('## Проекты');
    expect(txt).toContain('- [Example](https://example.com/projects/example.md): в работе — Synthetic.');
  });

  it('has no projects section when there are none', () => {
    expect(llmsTxt([post], SITE)).not.toContain('## Проекты');
  });
});
