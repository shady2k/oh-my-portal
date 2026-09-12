#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { Index, connect } from '@lancedb/lancedb';
import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';

import { MODEL } from '../src/embeddings.ts';

const MINIMUM_NODE = [22, 6] as const;

function assertSupportedNode(version = process.versions.node): void {
  const [major, minor] = version.split('.').map(Number);
  const [minimumMajor, minimumMinor] = MINIMUM_NODE;
  if (major < minimumMajor || (major === minimumMajor && minor < minimumMinor)) {
    throw new Error(`Node ${minimumMajor}.${minimumMinor} or newer is required; found ${version}`);
  }
}

async function smokeTestLanceDb(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'oh-my-portal-lancedb-'));
  try {
    const database = await connect(directory);
    const table = await database.createTable('agent_setup', [
      { id: 'expected', text: 'ограниченный параллелизм загрузки', vector: [1, 0] },
      { id: 'other', text: 'редактор статического сайта', vector: [0, 1] },
    ]);
    await table.createIndex('text', {
      config: Index.fts({ language: 'Russian', stem: true, removeStopWords: true }),
      waitTimeoutSeconds: 60,
    });
    const matches = await table.query().fullTextSearch('параллелизм').limit(1).toArray();
    if (matches.length !== 1 || matches[0].id !== 'expected') {
      throw new Error('LanceDB FTS installed but did not return the smoke-test document');
    }
    console.log('LanceDB BM25 smoke check passed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function prefetchEmbeddingModel(): Promise<void> {
  env.cacheDir = process.env.TRANSFORMERS_CACHE ?? join(homedir(), '.cache', 'huggingface', 'transformers');
  console.log(`prefetching ${MODEL} into ${env.cacheDir}`);
  await AutoTokenizer.from_pretrained(MODEL);
  const model = await AutoModel.from_pretrained(MODEL, { dtype: 'q8' });
  await model.dispose();
  console.log(`${MODEL} ready`);
}

assertSupportedNode();
await smokeTestLanceDb();
if (process.argv.includes('--skip-model')) {
  console.log('model prefetch skipped');
} else {
  await prefetchEmbeddingModel();
}
