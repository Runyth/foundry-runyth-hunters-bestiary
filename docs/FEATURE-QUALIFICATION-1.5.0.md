# Feature Qualification — 1.5.0

## Scope

Hunter's Bestiary 1.5.0 adds guided hunt workflow controls without changing the player progression schema or the provider/Actor contracts.

## Qualified behavior

- The existing four-step terse guide remains available.
- The dashboard contains a spoiler-safe detailed Player guide and a complete GM guide.
- Repeatable player rumor gathering, track searching, and active hunt-step attempts require one-use GM approval by default.
- Identical unresolved requests coalesce rather than creating a queue flood.
- An approved attempt is consumed once, including on a failed roll.
- Personal notes remain self-service and never award knowledge by themselves.
- Sightings and trophies/samples are saved immediately; automatic progression credit is a separate GM-reviewed action when approval gating is enabled.
- Evidence remains saved if no GM is online to receive the review request.
- Share Insight cannot repeatedly award the same target from the same sender at the same quarry knowledge stage.
- GM-only secrets, provider diagnostics, hunt administration, direct knowledge control, and approval controls remain absent from the player dashboard.
- Existing player progress, stable quarry IDs, hunt IDs, Actor links, image overrides, localization keys, and provider contracts remain compatible.

## Performance and UX safeguards

- No polling was added. World-setting updates drive dashboard synchronization through the existing Foundry update hook.
- The approval queue is capped and unresolved duplicate requests are coalesced.
- Same-setting mutations are serialized to avoid lost updates.
- Player dashboards do not receive the GM approval queue.
- The fieldwork-request setting update rerenders only the relevant dashboard surfaces rather than all module applications.
- Existing stable search bindings, cached catalogue data, bounded async queues, and non-blocking geometry persistence remain intact.

## Automated qualification

The release build must pass the complete Node test suite and `tools/check.mjs`, including dedicated approval, guide, settings, socket, performance, UI ownership, localization, provider, Actor, and operation-result tests.

## Runtime acceptance

A live Foundry VTT 13 client is still required for final visual and multiplayer acceptance. See `MANUAL-TEST-PLAN-1.5.0.md`.
