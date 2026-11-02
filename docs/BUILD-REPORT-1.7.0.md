# Hunter's Bestiary v1.7.0 — Build Report

## Deliverables

- Installable module ZIP: `hunters-bestiary-v1.7.0.zip`
- Reproducible source ZIP: `hunters-bestiary-source-v1.7.0.zip`
- SHA-256 checksums: `hunters-bestiary-v1.7.0-SHA256SUMS.txt`

## Bundled gameplay content

- 24 original monster entries
- 30 field-sign and track types
- 44 rumor seeds
- 12 research books
- 6 staged hunt templates
- 30 investigation complications

## Implemented systems

- Independent per-player Bestiary progression and knowledge gates
- GM player-perspective mirror using the canonical player dashboard rendering pipeline
- Personal notes, sightings, trophies, discoveries, books, and statistics
- Participant-scoped staged hunts with configurable knowledge eligibility and GM-authoritative shared state
- Rumor-driven quarry cycles using a GM-selected catalogue pool with repeat avoidance after completed hunts
- Explicit per-field knowledge disclosure using level, point, successful-rumor, chance, and optional GM-approval gates
- Player-chosen desired final outcomes with configurable automatic, check-plus-GM, and GM-only adjudication policies
- One-use GM approval queue for repeatable rumor, track, hunt-step, evidence-credit, and gated-discovery actions
- Spoiler-safe detailed Player guide plus complete GM workflow and responsibility guide
- Rumor and track field checks with configurable roll visibility
- Foundry-standard modular catalogue localization with English fallback and extensible language dictionaries
- Strict complete-package validation for complementary monster modules
- Deliberate Actor linking and provisioning from UUIDs, raw system data, Actor adapters, or active game-system adapters
- Native system-adapter capabilities for field checks, harvest Items, and encounter profiles
- GM provider diagnostics and schema-v2 migration
- Optional page-based Journals and GM-private Roll Tables
- Per-user and multi-user JSON export/import with merge validation
- ApplicationV2 interfaces, saved geometry, onboarding, visible launchers, and public extension API
- Per-monster image overrides synchronized across dashboards, Actor portraits, and prototype Tokens
- Bounded asynchronous work queues, cached data loading, coalesced UI updates, and non-blocking window-state persistence

## Validation performed

- Manifest, JSON, localization, path, and static schema validation
- JavaScript syntax checks with `node --check`
- Node unit tests for seed content, progression, hunts, provider validation, Actor policies, migration, and import merging
- Deprecated Foundry V1 API identifier scan
- Deterministic ZIP creation with non-versioned `hunters-bestiary/` root folder
- SHA-256 generation

## Runtime qualification

The build environment cannot launch a real Foundry VTT client. The module targets Foundry v13.351 and has been statically and unit-tested, but final validation in the user's exact Foundry, system, browser, and module stack remains necessary. Follow `docs/TEST-PLAN.md`.
