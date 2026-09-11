import { describe, expect, it } from 'vitest';

import { project } from '../src/schema/project.ts';

/** The smallest project that publishes — every required field, nothing else. */
const minimal = {
  title: 'Example',
  slug: 'example',
  status: 'published',
  lang: 'ru',
  state: 'active',
  summary: 'Synthetic.',
};

const parse = (patch: Record<string, unknown> = {}) => project.safeParse({ ...minimal, ...patch });
const rejects = (patch: Record<string, unknown>) => expect(parse(patch).success).toBe(false);

describe('the project frontmatter', () => {
  it('accepts the minimal project', () => {
    expect(parse().success).toBe(true);
  });

  it('requires each of its fields', () => {
    for (const field of Object.keys(minimal)) {
      const { [field]: _dropped, ...rest } = minimal as Record<string, unknown>;
      expect(project.safeParse(rest).success, `${field} should be required`).toBe(false);
    }
  });

  it('rejects a field nobody defined, including the register’s old `name`', () => {
    rejects({ name: 'Example' });
  });

  it('lets a stage of any state go without a post', () => {
    expect(parse({ stages: [{ title: 'Done', state: 'done' }, { title: 'Now', state: 'current' }] }).success).toBe(true);
  });

  it('allows one current stage, not two', () => {
    rejects({ stages: ['One', 'Two'].map((title) => ({ title, state: 'current' })) });
  });

  it('caps the open question and the observation', () => {
    rejects({ question: 'x'.repeat(181) });
    rejects({ observation: 'x'.repeat(241) });
  });
});

describe('the sketch', () => {
  const diagram = { center: 'agent', labels: ['memory', 'experience', 'initiative', 'character'], caption: 'Four influences on the agent.' };

  it('rejects incomplete or oversized labels that cannot fit the drawing', () => {
    rejects({ sketch: { ...diagram, labels: ['one'] } });
    rejects({ sketch: { ...diagram, center: 'x'.repeat(19) } });
  });

  it('requires matching artwork for pencil annotations', () => {
    const annotations = ['Facts survived', 'Still testing', 'Context breaks here'];
    expect(parse({ sketch: { ...diagram, artwork: 'memory-study', annotations } }).success).toBe(true);
    rejects({ sketch: { ...diagram, annotations } });
    rejects({ sketch: { ...diagram, artwork: 'memory-study', annotations: ['One'] } });
  });

  it('takes a picture from the content images, and only from there', () => {
    const picture = { image: '/images/example/sketch.svg', caption: 'A drawing of the project.' };
    expect(parse({ sketch: picture }).success).toBe(true);
    rejects({ sketch: { ...picture, image: 'https://cdn.example.com/sketch.svg' } });
    rejects({ sketch: { ...picture, artwork: 'memory-study' } });
  });

  it('still needs the centre and labels for a drawn diagram with no picture', () => {
    rejects({ sketch: { caption: 'Nothing to draw.' } });
  });
});
