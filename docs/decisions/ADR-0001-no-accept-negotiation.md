# ADR-0001 — No content negotiation on `Accept`

*Status:* accepted, 2026-09-10

## Context

Design §6 ranks four ways of serving an agent, and puts content negotiation
first: an agent requests an article's ordinary address with
`Accept: text/markdown` and receives markdown instead of HTML. The argument for
ranking it first is that it costs the agent nothing — coding assistants already
send that header, so no client has to be taught anything. The same argument is
used two paragraphs later to reject MCP for readers: a thing that must be
connected first will not be connected.

§10 calls the ai-first layer the point of the whole move rather than a later
nicety, and §6a made negotiation one of exactly two behaviours allowed to be
dynamic, with the rule that both live in the reverse proxy and nowhere else.

The deploy that was finally chosen has no reverse proxy. The site is served from
S3-compatible object storage behind that provider's CDN. Object storage returns
one object per key and does not look at request headers; the CDN can add
response headers and redirect on a key prefix, but has no request-time logic and
no edge functions. Negotiation is not difficult there — it is unavailable.

The alternative was to keep a server: nginx on the maintainer's Kubernetes
cluster, or on a small VPS. Both would have delivered negotiation exactly as §7
describes, because that configuration is already written and tested.

## Decision

Content negotiation on `Accept` is **not implemented**, and the requirement is
withdrawn rather than deferred.

The rest of §6 stays and is built: the `.md` and `.json` twins at their own
addresses, `/index.json`, `/llms.txt`, `<link rel="alternate">` in every head,
and the `Link: </llms.txt>` header — the last supplied by the CDN, which is why
the CDN is load-bearing in this design and not merely an accelerator.

§6 keeps negotiation listed first, marked as not implemented, rather than
deleting the item. Anyone later weighing a move back to a server should be able
to see what that move would buy without reconstructing the argument.

## Rationale

What is actually lost is narrower than "the ai-first layer". An agent that reads
the head, follows a response header, or fetches `llms.txt` still finds markdown.
What disappears is the case that required no cooperation at all: an agent that
opens the link with a default header now gets HTML and leaves.

What is bought is the absence of a server. No operating system to patch, no
certificate renewal of our own, no process that can die at 3 a.m., and — for a
site whose author would otherwise host it on his home Kubernetes cluster — no
public dependency on a domestic uplink and a dynamic address. §12's maintenance
principle is that what is built by hand is repaired by hand; a permanently
running server is the largest hand-built thing this project could own, and it
would exist for one feature.

The exchange rate settles it: an unbounded ongoing maintenance cost against a
convenience for the subset of agent traffic that would have sent the header.
Object storage is also the cheaper, faster and more available option for the
human readers who are the overwhelming majority.

Honesty about the trade was a condition of accepting it. A design document
promising a behaviour the deployment cannot perform is worse than one that never
promised it, because the gap looks like a bug and invites someone to "fix" it.

## Consequences

- §6a shrinks to a single dynamic requirement, subscriptions (R6), and its rule
  is restated: dynamic behaviour is one endpoint, not one place.
- §7 records object storage plus CDN as the deploy, with the behaviour measured
  against a live bucket. The nginx subsection stays, relabelled as a path for
  whoever self-hosts the engine — `nginx/site.conf.example` remains a working
  configuration and is not deleted.
- Phase 1d loses its first item; the twins are unaffected, because they were
  always build outputs rather than something the proxy produced.
- The two acceptance criteria in `br` issue `ekq` that asserted live negotiation
  and `Vary: Accept` are withdrawn, not left open.
- `Vary: Accept` becomes unnecessary. It was described as mandatory, and the
  reason held: without it a cache hands markdown to a browser. With nothing
  varying by `Accept`, there is nothing to vary on.
- Reversible at the cost of a server. Nothing in the build changes: the same
  output tree, placed behind nginx with the existing configuration, negotiates.

## Alternatives considered

**nginx on the maintainer's Kubernetes cluster.** Delivers everything. Rejected
for the maintenance surface and for putting a public site on a home uplink.

**nginx on a small VPS.** Delivers everything for a few hundred roubles a month.
Rejected on the same maintenance grounds, less decisively — this is the option
to revisit if negotiation is ever missed.

**A serverless container running our nginx image.** Delivers everything and
needs no server to patch. Rejected on cold starts against a low-traffic blog,
where the first visitor after an idle period pays the latency, plus a registry
and service account to maintain. Viable behind a CDN, and the runner-up.
