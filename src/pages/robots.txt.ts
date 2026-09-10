import type { APIContext } from 'astro';

import { STAGING } from '../staging.ts';

/**
 * `/robots.txt`.
 *
 * An endpoint and not a file in `public/`, because the one line that matters is
 * the absolute `Sitemap:` URL and this repository does not know its own address
 * until `SITE_URL` is set at build time (§2). A static file would have to carry
 * a hard-coded host, which is the same failure `check-outputs.ts` now refuses
 * for canonical.
 *
 * `/search/` is disallowed for the reason it carries `noindex`: it is a box, not
 * a page. The rest of the site is open, including the markdown twins — §6 exists
 * to have them read.
 *
 * `/llms.txt` is advertised here as well as in the `Link` header nginx adds
 * (§7), because a crawler that reads robots.txt is exactly the client that will
 * never see a response header for an address it has not fetched yet.
 */
export function GET({ site }: APIContext) {
  /*
   * A rehearsal must not be indexed.
   *
   * The migration is tried on a staging host before the real address is
   * switched over, and a full copy of the articles there would compete first
   * with the site still running at the old address and then with the new one.
   * The same articles on two hosts is exactly the duplication the redirect map
   * exists to prevent — losing rankings to the rehearsal rather than to the
   * move would be an expensive irony.
   *
   * No `Sitemap:` line either: inviting a crawler in and then asking it not to
   * look is a contradiction, and some crawlers resolve it the wrong way.
   */
  const body = STAGING
    ? [
        '# Репетиция переезда. Это не настоящий сайт.',
        'User-agent: *',
        'Disallow: /',
        '',
      ].join('\n')
    : [
        'User-agent: *',
        'Allow: /',
        'Disallow: /search/',
        '',
        `Sitemap: ${new URL('/sitemap.xml', site!).href}`,
        `# Agent-readable index: ${new URL('/llms.txt', site!).href}`,
        '',
      ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
