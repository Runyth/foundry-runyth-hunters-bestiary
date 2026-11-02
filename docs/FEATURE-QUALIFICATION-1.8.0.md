# Hunter's Bestiary 1.8.0 — Feature Qualification

## Scope

Feature release adding granular Fieldwork prerequisites/probability unlocks, absolute encounter-danger bands, deferred quarry management, GM-approved player Hunt proposals, and lazy Hunt-quarry selection.

## Automated qualification

- 132/132 Node regression tests pass.
- All static validation groups pass.
- English/German localization keys and static references are validated by `tools/check.mjs`.
- Player-facing catalogue API does not disclose raw numeric encounter tier when danger is revealed.
- Threshold boundary tests cover strict "after N" behavior and 0%/100% probability.
- Deferred quarry tests cover queue capacity and single-active-quarry invariants.
- Hunt proposal tests cover prerequisite enforcement and separation of planned versus actual outcome.
- Lazy selector regression verifies a bounded rendered result list.

## Runtime qualification boundary

The build environment cannot launch a real Foundry VTT client. Final multiplayer acceptance in Foundry 13.351 should follow `docs/TEST-PLAN.md`.
