/**
 * Similarity as a file, not a service (design §6, §9).
 *
 * Two consumers read the same matrix: the build, which offers a reader the
 * neighbours of what they just read, and the writing agent, which asks whether
 * it has covered this ground before. The vectors are computed where the text is
 * drafted and never in CI, so this module is deliberately inert — it reads and
 * writes files and does arithmetic, and the model arrives through `Embedder`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { frontmatter } from './schema/frontmatter.ts';

export const MODEL = 'Xenova/bge-m3';
export const DIMS = 1024;

export type Post = { slug: string; body: string; hash: string };
export type VectorFile = { model: string; dims: number; hash: string; vector: number[] };
export type Pending = { slug: string; hash: string; reason: 'missing' | 'stale' | 'model' };
export type Embedder = (texts: string[]) => Promise<number[][]>;

/** Matches the glob loader's id for posts: the frontmatter slug wins over the path. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Drafts are read too: a draft's vector is what lets the agent avoid writing the
 * same article twice, and a draft is never published on its own.
 *
 * The slug is the loader's id (`src/content.config.ts`), so the cache file is
 * named after it and not after the file on disk. Two files claiming one slug
 * would be resolved by the loader overwriting one with the other, silently —
 * here it is an error, because the two articles would also share a vector file.
 */
export function readPosts(postsDir: string): Post[] {
  const posts = new Map<string, Post>();
  for (const name of readdirSync(postsDir).sort()) {
    if (!name.endsWith('.md')) continue;
    const source = readFileSync(join(postsDir, name), 'utf8');
    const block = FRONTMATTER.exec(source);
    if (!block) throw new Error(`${name}: no frontmatter block`);
    const parsed = frontmatter.safeParse(parseYaml(block[1]));
    if (!parsed.success) throw new Error(`${name}: ${parsed.error.message}`);
    const { slug } = parsed.data;
    if (posts.has(slug)) {
      throw new Error(`${name}: slug \`${slug}\` is already claimed, two articles cannot share one address`);
    }
    const body = source.slice(block[0].length);
    posts.set(slug, { slug, body, hash: hashBody(body) });
  }
  return [...posts.values()];
}

const vectorPath = (dir: string, slug: string) => join(dir, `${slug}.json`);

export function readVector(dir: string, slug: string): VectorFile | null {
  const path = vectorPath(dir, slug);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as VectorFile;
  } catch {
    /* A file that cannot be parsed is a file that is not there. */
    return null;
  }
}

export function writeVector(dir: string, slug: string, file: VectorFile): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(vectorPath(dir, slug), `${JSON.stringify(file)}\n`);
}

/**
 * Another model is `missing`, never a number to compare: a cosine between two
 * spaces is arithmetic on two unrelated coordinate systems (design §6).
 */
export function pending(posts: Post[], dir: string, model = MODEL): Pending[] {
  const out: Pending[] = [];
  for (const { slug, hash } of posts) {
    const stored = readVector(dir, slug);
    if (!stored) out.push({ slug, hash, reason: 'missing' });
    else if (stored.model !== model) out.push({ slug, hash, reason: 'model' });
    else if (stored.hash !== hash) out.push({ slug, hash, reason: 'stale' });
  }
  return out;
}

/**
 * How much of an article one forward pass sees.
 *
 * Measured, and it is not a nicety. The tokenizer pads to `model_max_length` —
 * 8192 for bge-m3 — whenever `padding` is left on, and attention cost is
 * quadratic in that width: 16 heads × 8192² × 4 bytes is 4.3 GB for a *single*
 * layer, which is what OOM-killed this machine's session twice (the kernel killed
 * every process in the service's cgroup, the agent included). The ONNX graph's
 * input shape is symbolic — `["batch_size", "sequence_length"]` — so the width
 * is ours to choose, and at 512 the same layer costs 16.8 MB.
 *
 * A 512-token chunk is a real passage, and the mean of a document's chunk
 * vectors is the document's vector.
 */
export const CHUNK_TOKENS = 512;

/** Splits token ids into consecutive chunks, in order, without reordering them. */
export function chunkIds(ids: number[], size = CHUNK_TOKENS): number[][] {
  if (size < 1) throw new Error(`chunk size ${size}`);
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/**
 * The mean of a document's chunk vectors, L2-normalised so the stored vector has
 * the same length as any single one — the model's own outputs are normalised, and
 * mixing the two conventions in one cache file would be a silent distortion.
 */
export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error('mean of no vectors');
  const dims = vectors[0].length;
  const sum = new Array<number>(dims).fill(0);
  for (const vector of vectors) {
    if (vector.length !== dims) throw new Error(`mean of vectors with length ${dims} and ${vector.length}`);
    for (let i = 0; i < dims; i += 1) sum[i] += vector[i];
  }
  const mean = sum.map((value) => value / vectors.length);
  const norm = Math.sqrt(mean.reduce((acc, value) => acc + value ** 2, 0));
  return norm === 0 ? mean : mean.map((value) => value / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`cosine of vectors with length ${a.length} and ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Vectors of another width are skipped rather than compared (design §6). */
export function nearest(
  query: number[],
  corpus: { slug: string; vector: number[] }[],
  top = 10,
): { slug: string; cosine: number }[] {
  return corpus
    .filter((entry) => entry.vector.length === query.length)
    .map((entry) => ({ slug: entry.slug, cosine: cosine(query, entry.vector) }))
    .sort((a, b) => b.cosine - a.cosine)
    .slice(0, top);
}
