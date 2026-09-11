/**
 * Links that leave the site open in a new tab.
 *
 * Only addresses that actually leave: an `http(s)` URL on another host. A mail
 * link opens the mail client, and the site's own pages opening a second copy of
 * the site in another tab is clutter rather than help. `noopener` keeps the new
 * tab from reaching back into this one through `window.opener`.
 *
 * The same rule is applied to article bodies by the rehype plugin in
 * `astro.config.mjs`; this is the version the templates use.
 */
export function isExternal(href: string, site?: URL): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return !site || new URL(href).host !== site.host;
  } catch {
    return false;
  }
}

/** Attributes for an anchor, keeping any `rel` it already needs (such as `me`). */
export function linkAttrs(href: string, site?: URL, rel: string[] = []): { target?: string; rel?: string } {
  if (!isExternal(href, site)) return rel.length ? { rel: rel.join(' ') } : {};
  return { target: '_blank', rel: [...rel, 'noopener'].join(' ') };
}
