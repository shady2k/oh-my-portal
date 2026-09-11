import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  articleJson,
  articleMarkdown,
  catalogueMarkdown,
  indexJson,
  llmsTxt,
  projectsMarkdown,
} from '../src/projections.ts';
import { project as projectSchema } from '../src/schema/site.ts';

describe('illustrated project content', () => {
  it('requires evidence for active stages and rejects two current stages', () => {
    const base = { slug: 'example', name: 'Example', summary: 'Synthetic', state: 'active' };
    expect(projectSchema.safeParse({ ...base, stages: [{ title: 'Done', state: 'done' }, { title: 'Next', state: 'next' }] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, stages: ['One', 'Two'].map((title) => ({ title, state: 'current', post: 'example' })) }).success).toBe(false);
  });
  const data = {
    slug: 'example', name: 'Example', summary: 'Synthetic experiment', state: 'experiment',
    question: 'What changes?',
    sketch: { center: 'agent', labels: ['memory', 'experience', 'initiative', 'character'], caption: 'Four influences on the agent.' },
  };
  it('keeps the diagram explanation and open question in the machine version', () => {
    const parsed = projectSchema.parse(data);
    const md = projectsMarkdown([parsed], { experiment: 'experiment' });
    expect(md).toContain(data.question);
    expect(md).toContain(data.sketch.caption);
  });
  it('rejects incomplete or oversized labels that cannot fit the sketch', () => {
    expect(projectSchema.safeParse({ ...data, sketch: { ...data.sketch, labels: ['one'] } }).success).toBe(false);
    expect(projectSchema.safeParse({ ...data, sketch: { ...data.sketch, center: 'x'.repeat(19) } }).success).toBe(false);
  });
  it('keeps pencil annotations in Markdown and requires their matching artwork', () => {
    const annotations = ['Facts survived', 'Still testing', 'Context breaks here'];
    const sketch = { ...data.sketch, artwork: 'memory-study', annotations };
    const parsed = projectSchema.parse({ ...data, sketch });
    const md = projectsMarkdown([parsed], { experiment: 'experiment' });
    for (const annotation of annotations) expect(md).toContain(annotation);
    expect(projectSchema.safeParse({ ...data, sketch: { ...sketch, artwork: undefined } }).success).toBe(false);
    expect(projectSchema.safeParse({ ...data, sketch: { ...sketch, annotations: ['One'] } }).success).toBe(false);
  });
  it('takes a picture from the content images instead of the built-in artwork', () => {
    const annotations = ['Первая пометка', 'Вторая пометка', 'Третья пометка'];
    const sketch = { image: '/images/example/sketch.svg', caption: 'A drawing of the project.', annotations };
    const parsed = projectSchema.parse({ ...data, sketch });
    const md = projectsMarkdown([parsed], { experiment: 'experiment' });
    expect(md).toContain(sketch.caption);
    for (const annotation of annotations) expect(md).toContain(annotation);
    expect(projectSchema.safeParse({ ...data, sketch: { ...sketch, image: 'https://cdn.example.com/sketch.svg' } }).success).toBe(false);
    expect(projectSchema.safeParse({ ...data, sketch: { ...sketch, artwork: 'memory-study' } }).success).toBe(false);
  });
  it('still needs the centre and labels for a drawn diagram with no picture', () => {
    expect(projectSchema.safeParse({ ...data, sketch: { caption: 'Nothing to draw.' } }).success).toBe(false);
  });
});

const SITE = new URL('https://example.com/');

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
});

describe('the markdown catalogue', () => {
  it('summarises rather than reproducing the articles', () => {
    const md = catalogueMarkdown([post, essay], SITE);
    expect(md).toContain('Одно предложение.');
    expect(md).not.toContain('Тело статьи');
  });
});
