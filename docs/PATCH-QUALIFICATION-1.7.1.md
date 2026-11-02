# Runyth Hunter's Bestiary 1.7.1 — Patch Qualification

## Scope

This patch adds two GM ergonomics features without changing the player-progress schema or companion-module API contract:

1. Safe reversal of the most recently advanced Hunt step.
2. A selected-player Transaction / Audit Log.

## Hunt-step reversal safety

A completed step is reversible only when it is the step immediately before the current active step. Reversal is refused once the later active step has attempts, any later step has progressed, the Hunt is no longer active, or the conclusion already has an in-progress resolution. Existing attempts are retained for history; no evidence is silently deleted.

## Audit Log design

The audit window is GM-only and targets the player owner of the currently selected Actor. It assembles a chronological view from existing authoritative sources rather than duplicating gameplay state. This makes it useful immediately for established worlds. The log is built only while its dedicated window is open.

Sources include player field activity, knowledge discoveries, fieldwork approvals, Hunt records and the world audit trail. Large timelines use stable search, a scrolling container and `content-visibility` to keep rendering bounded.

## Validation

- Automated Node test suite
- Static Foundry v13 compatibility validation
- Localization parity
- ApplicationV2 action mapping validation
- CSS isolation validation
- Deterministic double-build comparison
- Source-to-install archive reproduction
