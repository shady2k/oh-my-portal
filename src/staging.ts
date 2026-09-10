/**
 * Staging: this build is a rehearsal, not the site.
 *
 * One switch, read in one place, like `PREVIEW` in src/posts.ts. It does three
 * things and they belong together: /robots.txt refuses every crawler, every
 * page carries a noindex robots meta, and the page says so where a human can
 * see it.
 *
 * The third is not decoration. A rehearsal that looks identical to production
 * is one somebody will mistake for production — and the mistake runs both ways,
 * reporting a bug against the wrong site or trusting a staging address with a
 * link. `PREVIEW` already had this problem and solved it the same way.
 */
export const STAGING = process.env.STAGING === '1';
