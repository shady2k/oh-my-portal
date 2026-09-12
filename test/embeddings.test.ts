// test/embeddings.test.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHUNK_TOKENS, DIMS, MODEL, batchItems, chunkIds, cosine, embeddingText, hashBody, maskedMeanVector, meanVector, nearest, pending, readPosts, similarPosts, similarSlugs, writeVector } from '../src/embeddings.ts';

const post = (slug: string, body: string, extra = '') =>
  `---\ntitle: "T"\nslug: ${slug}\ndate: 2026-06-21\nkind: article\nstatus: draft\nauthor: human\nsummary: "S"\ntags: []\nlang: ru\n${extra}---\n${body}`;

function corpus(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'posts-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function cache() {
  return mkdtempSync(join(tmpdir(), 'emb-'));
}

describe('readPosts', () => {
  it('keys by the frontmatter slug, not the file name', () => {
    const dir = corpus({ 'renamed-file.md': post('the-slug', 'Hello.\n') });
    expect(readPosts(dir).map((p) => p.slug)).toEqual(['the-slug']);
  });

  it('builds the embedding input from editorial metadata and headings', () => {
    const entry = readPosts(corpus({ 'a.md': post('a', '# First heading\nBody text.\n').replace('tags: []', 'tags: [ai-agents]') }))[0];
    expect(embeddingText(entry)).toBe('T\nS\nai-agents\nFirst heading');
  });

  it('invalidates the vector hash when the title changes', () => {
    const body = 'Same text.\n';
    const before = readPosts(corpus({ 'a.md': post('a', body) }))[0].hash;
    const after = readPosts(corpus({ 'a.md': post('a', body).replace('title: "T"', 'title: "Changed"') }))[0].hash;
    expect(after).not.toBe(before);
  });

  it('hashes the body, so a frontmatter-only edit is not a new vector', () => {
    const body = 'Same text.\n';
    const before = readPosts(corpus({ 'a.md': post('a', body) }))[0].hash;
    const after = readPosts(corpus({ 'a.md': post('a', body, 'updated: 2026-09-12\n') }))[0].hash;
    expect(after).toBe(before);
    expect(hashBody('Other text.\n')).not.toBe(before);
  });

  it('refuses two files that claim one slug', () => {
    const dir = corpus({ 'a.md': post('same', 'One.\n'), 'b.md': post('same', 'Two.\n') });
    expect(() => readPosts(dir)).toThrow(/same/);
  });

  it('refuses a file with no frontmatter', () => {
    const dir = corpus({ 'a.md': 'no frontmatter here\n' });
    expect(() => readPosts(dir)).toThrow(/a\.md/);
  });
});

describe('pending', () => {
  const posts = [{ slug: 'a', body: 'A.\n', hash: 'h1' }];

  it('calls a post with no file missing', () => {
    expect(pending(posts, cache())).toEqual([{ slug: 'a', hash: 'h1', reason: 'missing' }]);
  });

  it('calls a post whose stored hash differs stale', () => {
    const dir = cache();
    writeVector(dir, 'a', { model: MODEL, dims: DIMS, hash: 'older', vector: new Array(DIMS).fill(0) });
    expect(pending(posts, dir)[0].reason).toBe('stale');
  });

  it('treats another model as missing, not as a number to compare', () => {
    const dir = cache();
    writeVector(dir, 'a', { model: 'other/model', dims: DIMS, hash: 'h1', vector: new Array(DIMS).fill(0) });
    expect(pending(posts, dir)[0].reason).toBe('model');
  });

  it('says nothing about a post that is current', () => {
    const dir = cache();
    writeVector(dir, 'a', { model: MODEL, dims: DIMS, hash: 'h1', vector: new Array(DIMS).fill(0) });
    expect(pending(posts, dir)).toEqual([]);
  });
});

describe('cosine and nearest', () => {
  it('is 1 for a vector against itself and 0 for an orthogonal pair', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('refuses vectors of different lengths', () => {
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/length/);
  });

  it('orders the corpus by descending cosine and honours top', () => {
    const vectors = [
      { slug: 'near', vector: [1, 0] },
      { slug: 'far', vector: [0, 1] },
      { slug: 'mid', vector: [0.7, 0.7] },
    ];
    expect(nearest([1, 0], vectors, 2).map((r) => r.slug)).toEqual(['near', 'mid']);
  });
});

describe('similarSlugs', () => {
  it('returns nearest current-model vectors, excluding the subject and unusable files', () => {
    const dir = cache();
    const vector = (first: number, second = 0) => [first, second, ...new Array(DIMS - 2).fill(0)];
    writeVector(dir, 'subject', { model: MODEL, dims: DIMS, hash: 's', vector: vector(1) });
    writeVector(dir, 'near', { model: MODEL, dims: DIMS, hash: 'n', vector: vector(0.99, 0.01) });
    writeVector(dir, 'far', { model: MODEL, dims: DIMS, hash: 'f', vector: vector(0, 1) });
    writeVector(dir, 'wrong-model', { model: 'other/model', dims: DIMS, hash: 'w', vector: vector(1) });
    writeVector(dir, 'wrong-width', { model: MODEL, dims: DIMS, hash: 'x', vector: [1, 0, 0] });

    expect(similarSlugs('subject', ['subject', 'near', 'far', 'wrong-model', 'wrong-width', 'missing'], dir, 3)).toEqual(['near', 'far']);
  });

  it('keeps the cosine score for rendering a degree of similarity', () => {
    const dir = cache();
    const vector = (first: number, second = 0) => [first, second, ...new Array(DIMS - 2).fill(0)];
    writeVector(dir, 'subject', { model: MODEL, dims: DIMS, hash: 's', vector: vector(1) });
    writeVector(dir, 'near', { model: MODEL, dims: DIMS, hash: 'n', vector: vector(0.99, 0.01) });

    const [result] = similarPosts('subject', ['subject', 'near'], dir);
    expect(result?.slug).toBe('near');
    expect(result?.cosine).toBeCloseTo(0.9999, 3);
  });

  it('returns no suggestions when the subject vector is unavailable', () => {
    expect(similarSlugs('missing', ['missing', 'other'], cache())).toEqual([]);
  });
});

describe('batched embedding helpers', () => {
  it('groups items into bounded batches and keeps the tail', () => {
    expect(batchItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('rejects a batch size that would not make progress', () => {
    expect(() => batchItems([1], 0)).toThrow(/batch size/);
  });

  it('pools only real tokens when the batch contains padding', () => {
    const result = maskedMeanVector([[1, 0], [0, 1], [9, 9]], [1n, 1n, 0n]);
    expect(result[0]).toBeCloseTo(Math.SQRT1_2);
    expect(result[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('rejects an attention mask with a different width', () => {
    expect(() => maskedMeanVector([[1, 0], [0, 1]], [1])).toThrow(/length/);
  });
});

/*
 * The chunking is not cosmetic. Padding to `model_max_length` made one forward
 * pass 8192 tokens wide, and attention at that width is 4.3 GB per layer for a
 * single document — the reason the generator OOM-killed a whole session. These
 * two functions are what keeps a call 512 tokens wide, and they are the part of
 * that decision a test can hold.
 */
describe('chunkIds', () => {
  it('splits in order, keeping a short tail', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('leaves a document shorter than one chunk whole', () => {
    expect(chunkIds([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('gives nothing back for nothing in', () => {
    expect(chunkIds([])).toEqual([]);
  });

  it('refuses a chunk size that would loop forever', () => {
    expect(() => chunkIds([1, 2, 3], 0)).toThrow(/chunk size/);
  });

  it('defaults to the width the measurements asked for', () => {
    expect(CHUNK_TOKENS).toBe(512);
    expect(chunkIds(new Array(CHUNK_TOKENS + 1).fill(7)).map((chunk) => chunk.length)).toEqual([CHUNK_TOKENS, 1]);
  });
});

describe('meanVector', () => {
  it('returns a unit vector for a document of one chunk', () => {
    expect(meanVector([[3, 4]])).toEqual([0.6, 0.8]);
  });

  it('averages chunks and normalises the result', () => {
    const [x, y] = meanVector([
      [1, 0],
      [0, 1],
    ]);
    expect(x).toBeCloseTo(Math.SQRT1_2);
    expect(y).toBeCloseTo(Math.SQRT1_2);
  });

  it('refuses vectors of different widths', () => {
    expect(() => meanVector([[1, 0], [1, 0, 0]])).toThrow(/length/);
  });

  it('refuses to average nothing', () => {
    expect(() => meanVector([])).toThrow(/no vectors/);
  });

  it('leaves a zero vector at zero rather than dividing by it', () => {
    expect(meanVector([[0, 0], [0, 0]])).toEqual([0, 0]);
  });
});
