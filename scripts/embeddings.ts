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
  batchItems,
  embeddingText,
  maskedMeanVector,
  chunkIds,
  meanVector,
  nearest,
  pending,
  readPosts,
  readVector,
  writeVector,
} from '../src/embeddings.ts';

const args = process.argv.slice(2);
const BATCH_CHUNKS = Number(process.env.EMBEDDING_BATCH_SIZE ?? 4);
if (!Number.isInteger(BATCH_CHUNKS) || BATCH_CHUNKS < 1) throw new Error(`EMBEDDING_BATCH_SIZE must be a positive integer, got ${BATCH_CHUNKS}`);
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
 * - The `feature-extraction` pipeline cannot be given the 512-token batch shape we
 *   want: it pads to the tokenizer's `model_max_length` of 8192. One pass at that
 *   width costs 4.3 GB for a single layer's attention, which is what had the
 *   kernel OOM-kill this machine's session twice. So the model is called directly
 *   with 512-token batches, and the attention mask excludes padding from pooling.
 * - The compact editorial descriptor usually fits one pass. If a long article has
 *   enough headings to exceed 512 tokens, its descriptor is still chunked and
 *   averaged rather than sending the full prose through the model.
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
      const pieces = chunks.map((chunk) => tokenizer.decode(chunk, { skip_special_tokens: false }));
      const vectors: number[][] = [];
      for (const batch of batchItems(pieces, BATCH_CHUNKS)) {
        const inputs = tokenizer(batch, { padding: true, truncation: true, max_length: CHUNK_TOKENS });
        const outputs = await model(inputs);
        // The padded rows must be excluded from mean pooling. The attention mask
        // is the model's own statement of which rows are real tokens.
        const tokens: number[][][] = outputs.last_hidden_state.tolist();
        const masks: number[][] = inputs.attention_mask.tolist();
        for (let index = 0; index < tokens.length; index += 1) {
          vectors.push(maskedMeanVector(tokens[index], masks[index]));
        }
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
  const text = post ? embeddingText(post) : fromFile && existsSync(fromFile) ? readFileSync(fromFile, 'utf8') : null;
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
for (const [index, entry] of todo.entries()) {
  const [vector] = await embed([embeddingText(byslug.get(entry.slug)!)]);
  if (vector.length !== DIMS) throw new Error(`${entry.slug}: ${vector.length} dimensions, expected ${DIMS}`);
  writeVector(cacheDir, entry.slug, { model: MODEL, dims: DIMS, hash: entry.hash, vector });
  console.log(`computed ${index + 1} of ${todo.length}: ${entry.slug}`);
}
const counted = (reason: 'missing' | 'stale' | 'model') => todo.filter((p) => p.reason === reason).length;
console.log(
  `computed ${todo.length} of ${posts.length} (${counted('missing')} new, ${counted('stale')} stale, ` +
    `${counted('model')} other model) in ${((Date.now() - started) / 1000).toFixed(1)}s into ${cacheDir}`,
);
