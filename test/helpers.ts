import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/**
 * Builds the site the way `npm run build` does — Astro, then the Pagefind index,
 * then the R10 gate. Tests that skip a step stop testing the thing that ships.
 *
 * Each caller gets its own directory. Sharing one made a later suite's setup
 * overwrite what an earlier one was asserting against, which is a test that
 * passes or fails on file order rather than on behaviour.
 */
export function build(env: Record<string, string>, out: string) {
  rmSync(out, { recursive: true, force: true });
  const options = {
    env: { ...process.env, CONTENT_DIR: 'test/fixtures/posts', DATA_DIR: 'test/fixtures/data', ...env },
    stdio: 'pipe' as const,
  };
  execFileSync('npx', ['astro', 'build', '--outDir', out], options);
  execFileSync('npx', ['pagefind', '--site', out], options);
  execFileSync('node', ['scripts/check-outputs.ts', out], options);
}

/*
 * Charsets included on purpose: the test server stands in for nginx, and the one
 * that was missing there was missing here too, so no test could have caught it.
 * A server that is more forgiving than production is a server that hides bugs.
 */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pagefind': 'application/wasm',
};

/**
 * Serves a built site so the real Pagefind engine can run against it.
 *
 * Pagefind is a browser bundle, but it needs only `fetch` and `WebAssembly`,
 * both of which Node has. Running the actual engine rather than inspecting the
 * index files is the difference between asserting that search works and
 * asserting that a file exists — and it is what caught the article core being
 * left out of the index.
 */
export async function serve(dir: string) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const path = join(root, decodeURIComponent((req.url ?? '/').split('?')[0]!));
    if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  await new Promise<void>((done) => server.listen(0, done));
  const port = (server.address() as { port: number }).port;
  return {
    origin: `http://localhost:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

type Hit = { url: string; excerpt: string; meta: Record<string, string | undefined> };

/** Loads the built index and returns a search function over it. */
export async function search(dir: string, origin: string) {
  const engine = await import(resolve(dir, 'pagefind/pagefind.js') + '');
  await engine.options({ basePath: `${origin}/pagefind/` });
  await engine.init();
  return async (query: string): Promise<Hit[]> => {
    const found = await engine.search(query);
    return Promise.all(found.results.map((r: { data: () => Promise<Hit> }) => r.data()));
  };
}
