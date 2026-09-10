import type { APIContext } from 'astro';

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
  const body = [
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
