# `migration/` — the addresses that must never break

Two files in the content repository, and both are read before publication
because R1 — *every old address answers one 301 to a 200* — is the site's only
distribution channel that has been working for years.

- **`migration/redirects.yaml`** — the map, old Ghost address → new address. 49
  addresses in total, from the old sitemaps. It is **closed**: the set of
  addresses that existed is known, it stops growing, and the map keeps being
  *applied* indefinitely — not for search engines, which consolidate a 301
  within about a year, but for everybody else's links, which are never edited.
- **`migration/old-addresses.txt`** — the list the map is checked against, so an
  address that exists and is not in the map fails the check instead of being
  quietly missing.

The rules, from the design (`docs/design/portal.md` §5): 301 only (never 302),
exactly one hop (a redirect target is never itself a redirect), exhaustive over
the old sitemaps. `/rss/` is the single exemption and is deliberately absent from
the map.

## Renaming an article

The frontmatter `slug` is the address. Changing it moves the article, so the old
address goes into the article's own `aliases`:

```yaml
slug: kubernetes-descheduler
aliases: [/descheduler-dlia-kubernetes/]
```

`collect-aliases.ts` folds every `aliases` entry in the corpus into the map when
it is generated, so a rename carries its own past with it. A rename without an
`alias` is a dead link, and the map cannot cover for it because the map's set is
closed.

## Checking your work

```bash
# The call the deploy makes, against a finished build. `--dist` is what holds a
# redirect back when its target is not in this build — a draft's case exactly.
node scripts/gen-redirects.ts --format s3 --dist dist \
  --coverage content/migration/old-addresses.txt \
  content/migration/redirects.yaml redirects.json
```

That last form against a finished build is what the deploy does:
a redirect from an address the build serves fails, and a redirect to an address
it does not serve is **held back and listed** rather than published — a draft's
address is exactly this case, and the redirect goes live when the article does.

**Do not check R1 against the live site while drafting.** Object storage behind
the CDN answers 403 for a missing address, so a wrong slug and the platform's
error page are indistinguishable by status from a real problem. A build and
`check-outputs.ts` answer the question locally and honestly.
