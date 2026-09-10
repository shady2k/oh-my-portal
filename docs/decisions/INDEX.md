# Decisions

Architecture decision records: the choices that are hard to reverse, surprising
without their context, and were a genuine trade-off rather than a preference.

Routine choices live where they are made — in the design document, in a `br`
issue, or in a comment next to the code that embodies them. A record here means
someone reading the result later would otherwise conclude it was a mistake.

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](ADR-0001-no-accept-negotiation.md) | No content negotiation on `Accept`: the site is served from object storage, which has no request-time logic | accepted | 2026-09-10 |
