/** A separate catalog server; leave Astro's existing site server and lock alone. */
import { dev } from 'astro';

process.env.UI_KIT = '1';
process.env.PREVIEW = '1';
process.env.CONTENT_DIR = 'examples/posts';
process.env.DATA_DIR = 'examples/data';
process.env.PROJECTS_DIR = 'examples/projects';

const server = await dev({ server: { host: '127.0.0.1', port: Number(process.env.UI_PORT ?? 4324) } });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
