// @ts-check
import { defineConfig } from 'astro/config';

import { codeTheme } from './src/styles/code-theme.ts';

// The public URL is deployment data, not engine data: this repository carries no
// site of its own (design §2). CI sets SITE_URL; the placeholder only keeps
// `astro build` runnable here.
const site = process.env.SITE_URL ?? 'https://example.com';

export default defineConfig({
  site,
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
