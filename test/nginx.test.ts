import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The shipped nginx example, as a gate.
 *
 * Both faults below shipped in it and neither was visible from the site's own
 * tests: the config is the one part of the design that nothing else executes.
 * These assertions are the cheapest thing that would have caught them, and they
 * are here rather than in a comment because a comment does not fail.
 */
const conf = readFileSync('nginx/site.conf.example', 'utf8');

/** Byte offsets, so "before the server block" can be asserted rather than described. */
const serverAt = conf.indexOf('server {');
const typesAt = conf.search(/types\s*\{/);

describe('nginx/site.conf.example', () => {
  it('maps .md to markdown', () => {
    expect(conf).toMatch(/types\s*\{[^}]*text\/markdown\s+md;/);
  });

  it('declares that mapping outside the server block', () => {
    /*
     * A `types` block in a nested context replaces the map inherited from
     * `include mime.types` rather than adding to it, so the same three lines one
     * level down serve every stylesheet, script and font as
     * application/octet-stream. Verified against nginx 1.30.4.
     */
    expect(typesAt).toBeGreaterThan(-1);
    expect(serverAt).toBeGreaterThan(-1);
    expect(typesAt).toBeLessThan(serverAt);
  });

  it('sets a charset, or Cyrillic markdown arrives as mojibake', () => {
    expect(conf).toMatch(/^\s*charset\s+utf-8;/m);
  });

  it('includes markdown among the types the charset applies to', () => {
    /* nginx charsets text/html always, and nothing else unless it is listed. */
    const line = conf.match(/^\s*charset_types\s+([^;]+);/m);
    expect(line?.[1]).toContain('text/markdown');
  });

  it('keeps Vary: Accept, without which caches serve markdown to browsers', () => {
    expect(conf).toMatch(/add_header\s+Vary\s+Accept\s+always;/);
  });
});
