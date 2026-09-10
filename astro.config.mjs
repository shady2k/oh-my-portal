// @ts-check
import { defineConfig } from 'astro/config';

import { codeTheme, syntaxVariables } from './src/styles/code-theme.ts';

// The public URL is deployment data, not engine data: this repository carries no
// site of its own (design §2). CI sets SITE_URL; the placeholder only keeps
// `astro build` runnable here.
// `||`, not `??`: an empty SITE_URL is the same mistake as an unset one, and CI
// variables arrive empty far more often than they arrive absent.
const site = process.env.SITE_URL || 'https://example.com';

/**
 * Content images.
 *
 * They live beside the articles that reference them, in the content repository,
 * and the articles reference them by absolute path (`/images/<slug>/01.webp`).
 * That choice is what keeps the markdown twin honest — the twin is the source
 * body verbatim, so a relative path would resolve against nothing on the
 * agent's side — but it leaves the files outside anything Astro copies.
 *
 * `public/` cannot be the answer: it belongs to the engine and carries the
 * fonts, the og card and robots.txt. So the images are copied in after the
 * build, and `scripts/check-outputs.ts` fails the build if any picture an
 * article references is missing — a broken image is invisible in a diff and
 * obvious to every reader, which is the wrong way round.
 */
/** @type {import('astro').AstroIntegration} */
const contentImages = {
  name: 'content-images',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const from = process.env.IMAGES_DIR;
      if (!from) return logger.info('IMAGES_DIR не задан — картинки контента не копируются');
      const { cp, readdir } = await import('node:fs/promises');
      await cp(from, new URL('images/', dir), {
        recursive: true,
        filter: (src) => !src.endsWith('manifest.json'),
      });
      const slugs = await readdir(from, { withFileTypes: true });
      logger.info(`картинки контента: ${slugs.filter((d) => d.isDirectory()).length} статей`);
    },
  },
};

/** @type {import('astro').AstroIntegration} */
const uiKit = {
  name: 'field-journal-ui-kit',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: '/_ui/', entrypoint: './src/ui-kit/index.astro' });
      injectRoute({ pattern: '/_ui/index.md', entrypoint: './src/ui-kit/index.md.ts' });
    },
  },
};

export default defineConfig({
  site,
  integrations: [
    contentImages,
    ...(process.env.UI_KIT === '1' ? [uiKit] : []),
  ],
  server: {
    /*
     * `127.0.0.1`, not the default `localhost`.
     *
     * Astro passes the host to Node, which resolves `localhost` through the
     * system resolver; where that answers with `::1` first, the server binds to
     * the IPv6 loopback ALONE and `http://127.0.0.1:4321` is refused. The
     * printed URL still says `localhost`, so it looks like it is working.
     *
     * A literal address removes the resolver from the question. Set
     * `HOST=0.0.0.0` to reach the dev server from another machine — that is a
     * deliberate act, which is why it is not the default.
     */
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4321),
  },
  markdown: {
    /*
     * Design §12. Astro's default is Shiki with `github-dark`, which puts a dark
     * slab on a near-white page in colours nothing else on the site can reach.
     * Ours is the tag palette darkened into text, so a code block belongs to the
     * page it is on.
     */
    shikiConfig: {
      theme: codeTheme,
      /*
       * Wrapping is done in CSS, not here: base.css pairs `pre-wrap` with a
       * hanging indent on Shiki's per-line spans, which is what keeps a wrapped
       * shell command readable as one command. Shiki's own `wrap` would write an
       * inline style that the transformer below strips anyway.
       */
      wrap: false,
      transformers: [
        {
          /*
           * Drop the wrapper's inline style so the block's ground comes from
           * `--paper-sunk` like every other sunk panel. Without this, Shiki
           * writes a background here and the token would silently stop being
           * the single source for it.
           */
          span(node) {
            if (typeof node.properties.style === 'string') {
              node.properties.style = node.properties.style.replace(/color:\s*(#[0-9a-f]{6})/gi, (value, hex) => {
                const variable = syntaxVariables[hex.toLowerCase()];
                return variable ? `color:var(${variable})` : value;
              });
            }
          },
          pre(node) {
            delete node.properties.style;
          },
        },
      ],
    },
  },

  trailingSlash: 'always',
  build: {
    // Every route is a directory with an index.html, so `/posts/<slug>/` is a
    // real path on disk. Required for the nginx `map` in design §7 to serve the
    // markdown tree at the same addresses.
    format: 'directory',
  },
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru'],
    routing: {
      // Design §5: the default locale is NOT prefixed. Russian keeps `/about/`
      // forever; an `/en/` tree can be added later without touching a single
      // existing URL. Adding a language is one entry in `locales`.
      prefixDefaultLocale: false,
    },
  },
});
