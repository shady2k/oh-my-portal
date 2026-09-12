#!/usr/bin/env node
/**
 * The vectors the build and the writing agent both read (design §6).
 *
 *   node scripts/embeddings.ts [--check] [--posts <dir>] [--cache <dir>]
 *   node scripts/embeddings.ts nearest <slug|file> [--top N]
 *
 * Computed here and never in CI: the model is a devDependency, the vectors are
 * committed by whoever drafted the text, and a workflow that ran this would
 * spend Actions minutes downloading 570 MB to learn nothing.
 *
 * Mean pooling over the token embeddings, L2-normalised, is what the model card
 * specifies for retrieval, and it is what makes a cosine here comparable with a
 * cosine computed anywhere else. bge-m3 takes no instruction prefix.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  CHUNK_TOKENS,
  DIMS,
  MODEL,
  chunkIds,
  meanVector,
  nearest,
  pending,
  readPosts,
  readVector,
  writeVector,
} from '../src/embeddings.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

const command = args[0] === 'nearest' ? 'nearest' : 'compute';
const subject = args[1];

const postsDir = resolve(flag('posts') ?? process.env.CONTENT_DIR ?? 'content/posts');
const cacheDir = resolve(flag('cache') ?? join(process.env.DATA_DIR ?? 'content/data', 'embeddings'));
const top = Number(flag('top') ?? 10);

/**
 * Loaded on demand, and the only reason this file may import npm at all.
 * Five things here are measured rather than assumed:
 *
 * - The import is dynamic on purpose: a static one would make this file fail at
 *   load time in a checkout that never ran `npm ci`, which is exactly the
 *   checkout the deploy scripts and `astro build` run in.
 * - The cache is pinned outside `node_modules`, where transformers.js puts it by
 *   default. `npm ci` deletes that directory, so the default means re-downloading
 *   570 MB for a reason that has nothing to do with the code.
 * - The graph's input shape is symbolic (`["batch_size", "sequence_length"]`), so
 *   the width is ours to choose — and the tokenizer chooses 8192, its
 *   `model_max_length`, whenever padding is left on.
 * - The `feature-extraction` pipeline cannot be talked out of that: it calls
 *   `this.tokenizer(texts, { padding: true, truncation: true })` and forwards no
 *   tokenizer options at all. One pass at 8192 tokens costs 4.3 GB for a single
 *   layer's attention, which is what had the kernel OOM-kill this machine's
 *   session twice. So the model is called directly, with the tokenizer's own
 *   output, where `padding: false` is honoured.
 * - A document is embedded chunk by chunk and the chunks are averaged: at 512
 *   tokens the same layer costs 16.8 MB.
 */
async function loadEmbedder() {
  const { AutoModel, AutoTokenizer, env } = await import('@huggingface/transformers');
  env.cacheDir = process.env.TRANSFORMERS_CACHE ?? join(homedir(), '.cache', 'huggingface', 'transformers');
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const model = await AutoModel.from_pretrained(MODEL, { dtype: 'q8' });
  return async (texts: string[]) => {
    const out: number[][] = [];
    for (const text of texts) {
      const ids: number[] = tokenizer(text, { add_special_tokens: false }).input_ids.tolist()[0];
      const chunks = chunkIds(ids);
      if (chunks.length === 0) throw new Error('a document with no tokens has no vector');
      const vectors: number[][] = [];
      for (const chunk of chunks) {
        const piece = tokenizer.decode(chunk, { skip_special_tokens: false });
        const inputs = tokenizer(piece, { padding: false, truncation: true, max_length: CHUNK_TOKENS });
        const outputs = await model(inputs);
        // Untyped by the library; the shape is [batch, tokens, dims], and with no
        // padding every row is a real token, so the mean of the rows is the pooled
        // vector — the same pooling the model card specifies.
        const tokens: number[][] = outputs.last_hidden_state.tolist()[0];
        vectors.push(meanVector(tokens));
      }
      out.push(meanVector(vectors));
    }
    return out;
  };
}

const posts = readPosts(postsDir);
const byslug = new Map(posts.map((post) => [post.slug, post]));

if (command === 'nearest') {
  if (!subject) {
    console.error('usage: node scripts/embeddings.ts nearest <slug|file> [--top N]');
    process.exit(2);
  }
  const embed = await loadEmbedder();
  const post = byslug.get(subject);
  const fromFile = post ? null : resolve(subject);
  const text = post?.body ?? (fromFile && existsSync(fromFile) ? readFileSync(fromFile, 'utf8') : null);
  if (text === null) {
    console.error(`${subject}: neither a post in ${postsDir} nor a readable file`);
    process.exit(2);
  }
  const [query] = await embed([text]);
  const library = posts
    .filter((entry) => entry.slug !== subject)
    .map((entry) => ({ slug: entry.slug, vector: readVector(cacheDir, entry.slug)?.vector }))
    .filter((entry): entry is { slug: string; vector: number[] } => Array.isArray(entry.vector));
  if (library.length === 0) {
    console.error(`${cacheDir} holds no vectors — run \`npm run embeddings\` first`);
    process.exit(2);
  }
  for (const hit of nearest(query, library, top)) {
    console.log(`${hit.cosine.toFixed(4)}  ${hit.slug}`);
  }
  process.exit(0);
}

const todo = pending(posts, cacheDir);

if (args.includes('--check')) {
  if (todo.length) {
    console.error(`${todo.length} post(s) need a vector: ${todo.map((p) => `${p.slug} (${p.reason})`).join(', ')}`);
    process.exit(1);
  }
  console.log(`${posts.length} vectors current`);
  process.exit(0);
}

if (todo.length === 0) {
  console.log(`${posts.length} vectors current, nothing to compute`);
  process.exit(0);
}

const embed = await loadEmbedder();
const started = Date.now();
const vectors = await embed(todo.map((entry) => byslug.get(entry.slug)!.body));
todo.forEach((entry, index) => {
  const vector = vectors[index];
  if (vector.length !== DIMS) throw new Error(`${entry.slug}: ${vector.length} dimensions, expected ${DIMS}`);
  writeVector(cacheDir, entry.slug, { model: MODEL, dims: DIMS, hash: entry.hash, vector });
});
const counted = (reason: 'missing' | 'stale' | 'model') => todo.filter((p) => p.reason === reason).length;
console.log(
  `computed ${todo.length} of ${posts.length} (${counted('missing')} new, ${counted('stale')} stale, ` +
    `${counted('model')} other model) in ${((Date.now() - started) / 1000).toFixed(1)}s into ${cacheDir}`,
);
