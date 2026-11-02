# Hunter's Bestiary 1.5.0 — Feature Release

## Purpose

This release makes the hunt workflow understandable without exposing secrets and makes player self-service compatible with GM-authoritative pacing.

## Main changes

- Original terse four-step guide retained.
- Detailed spoiler-safe Player guide added to the dashboard and documentation.
- Complete GM guide added to the dashboard and documentation.
- One-use GM approvals added for repeatable rumor, track, and hunt-step opportunities.
- Player sightings and trophies remain immediately recordable, but their automatic progression credit is reviewed by the GM.
- Evidence remains saved even when no active GM is available to receive a progression-review request.
- Share Insight can no longer grant repeated points to the same target at the same sender knowledge stage.
- GM dashboard gains a compact approval queue.

## Compatibility

No migration of existing player progress, hunt records, provider data, or Actor links is required.

The new approval queue is a separate hidden world setting. Disabling the approval setting restores direct repeatable fieldwork behavior while retaining the safety improvements to Share Insight.

## Runtime target

- Foundry VTT 13.351
- System-neutral core module

A real Foundry client must still be used for final manual UX acceptance.
