// @ts-check
import { defineConfig } from 'astro/config';

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
