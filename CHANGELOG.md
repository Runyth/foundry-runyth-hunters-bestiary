# Changelog

## 1.8.2 — 2026-11-04

- The installable archive now ships every relative import the manifest entry needs, so the module's buttons and settings register on world load instead of silently failing.

## 1.8.1 — 2026-11-03

- AGENTS.md conformance release: the manifest author carries the standard organisational URL, and the shipped homebrew content states its CC BY-SA 4.0 content licence in the README and on the content data records. No runtime behaviour relationship or dependency change.

## 1.8.0 — 2026-10-11

- First publication as a Runyth module: `runyth-hunters-bestiary` / **Runyth Hunter's Bestiary** with the publication standard in place — deterministic `-mod`, `-src`, and `-doc` archives with per-version checksums, byte-identical rebuild verification, standard quality and release pipelines, the full GNU AGPL-3.0-or-later licence with the standard source notice, the standard README licence chapter, and the manifest URL surfaces.

- Added granular Fieldwork progression requirements with global defaults and sparse per-monster overrides.
- Track searches can require a configurable number of successful rumors; default is 3.
- Successful track searches can probabilistically unlock Sighting recording after a configurable threshold; default is after 5 successful tracks, with a 35% chance on each later successful search.
- Recorded sightings can probabilistically reveal absolute encounter danger after a configurable threshold; default is after 3 sightings, with a 35% chance on each later sighting.
- Track→Sighting and Sighting→Danger unlocks can optionally require GM approval independently per monster.
- Added five absolute, PC-level-independent encounter-danger bands: Low Threat, Elevated Threat, High Threat, Severe Threat, and Extreme Threat. Labels are globally customizable and monster difficulty can be overridden individually.
- Removed raw numeric encounter tier from player-facing Bestiary/API disclosure; players receive only the immersive danger label once legitimately revealed.
- Added player quarry deferral with a configurable deferred-quarry capacity (default 2).
- Reactivating a deferred quarry requires GM approval; the current active quarry is moved to the end of the deferred queue atomically.
- Deferring a quarry safely pauses an eligible solo Hunt; approved reactivation resumes it when the active-Hunt limit permits. Shared Hunts require explicit GM handling instead of unsafe automatic pausing.
- Added a configurable active-Hunt capacity per hunter (default 1).
- Added GM-approved player Hunt proposals. Players author the Hunt title, region, patron, stakes, trail template, intended outcome, and personal plan; approval creates the participant-scoped Hunt only after all current knowledge/Fieldwork requirements still pass.
- Preserved the distinction between planned/intended outcome and actual final outcome; the GM remains authoritative over what actually happened.
- Successful terminal Hunt outcomes clear the active quarry; escaped outcomes reactivate the quarry for a re-hunt.
- Added a lazy searchable Hunt-quarry selector that renders at most 80 matching choices at once instead of pre-rendering the full catalogue in a native select.
- Added content-visibility/containment for large rule and deferred-quarry lists and retained cached/indexed lookup paths.
- Extended progress export/import merging for successful track totals, Fieldwork unlocks, and deferred-quarry queues.
- Added full GM/Player workflow documentation and 1.8 acceptance coverage.
- Passed 132/132 automated tests and all static validation groups.

## 1.7.2

- GM Bestiary list now reflects the selected player Actor's actual knowledge levels while retaining GM visibility of the full catalogue.
- New Hunt monster selection now uses the selected hunter's knowledge and Hunt history for configurable status highlighting.
- Added built-in and reusable custom Hunt quarry color presets.
- Added GM import/export for all portable Runyth Hunter's Bestiary configuration settings.
- Added regression coverage for selected-player knowledge context, Hunt history classification, colors and settings transfer.

## 1.7.1 — 2026-10-10

- Added safe GM reversal of the most recently advanced Hunt step when no later attempt or progression has occurred.
- Reversal restores the prior step as active, relocks later steps, preserves existing attempt history, resets unused conclusion state, synchronizes participant progress, and records an audit event.
- Added a GM-only Transaction / Audit Log for the player who owns the currently selected Actor.
- The audit timeline reconstructs existing history from player progress, successful rumors, tracks and knowledge, notes, sightings, trophies, research books, revealed Bestiary fields, fieldwork approvals, Hunt participation, Hunt attempts, step advances/reversals, resolution checks, complications and final outcomes.
- Added indexed context lookup, newest-first sorting, stable search, scroll containment, content-visibility optimization, manual refresh, and automatic refresh through existing coalesced module rerender hooks.
- Kept the audit UI in a separate window so normal player and GM dashboard rendering cost remains unchanged when the log is closed.
- Added regression coverage for safe Hunt-step reversal, history preservation, audit recording, selected-player timeline reconstruction, and GM-only UI exposure.

## 1.7.0 — 2026-10-10

- Redesigned the hunt lifecycle around rumor-selected quarry, knowledge-gated hunt eligibility, progressive information disclosure, and player-chosen final objectives.
- Added global Hunt Rules plus focused per-monster overrides for minimum hunt knowledge and every disclosure field.
- Added a configurable quarry pool; the first successful rumor of a cycle selects the target, terminal completion clears it, and escaped quarry remains active for a re-hunt.
- New player Bestiary entries hide identity, tier, summary, behavior, defenses, weaknesses, harvest information and other metadata until explicitly revealed.
- Added configurable minimum knowledge level, points, successful-rumor count, independent reveal chance and optional GM approval for each information field.
- Default name discovery begins after five successful rumors; weaknesses default to Mastered knowledge, forty points, forty rumors, a low reveal chance and GM approval.
- Removed outcome selection from Hunt creation. At the conclusion, the player chooses a desired result; configured automatic, check-plus-GM, or GM-only policy determines the procedure, and the GM records the actual result when adjudication is required.
- Added distinct released and evaded outcomes and made escaped a non-terminal result that keeps the quarry available.
- Preserved pre-1.7 player visibility through a legacy-disclosure compatibility marker instead of hiding knowledge already earned.
- Updated progress export/import merging for rumor counts, unlocked fields and hunt-cycle state.
- Optimized Hunt Rules lists with Set-based membership, stable search, scroll containment, content visibility, and one-monster-at-a-time overrides.
- Added feature qualification, hunt-system documentation and a dedicated Foundry acceptance plan.

## 1.6.0 — 2026-10-10

- Added a GM-only player-perspective mirror dashboard launched from the normal GM dashboard for the currently selected player-owned token.
- The mirror uses the same MainApp class, Handlebars template, localization, knowledge gating, hunt visibility, fieldwork approvals, progress records, books, notes, sightings, trophies, and guide content as the real player dashboard.
- The mirror renders with the selected player's identity and permissions rather than GM visibility, preventing GM-only tabs, secrets, undiscovered monsters, hidden knowledge, and management controls from leaking into the mirrored view.
- The selected token Actor is used as the mirrored active hunter, with the player's assigned Character as a fallback.
- Kept the mirror observational: navigation and search remain functional, while state-changing controls are intercepted without changing their appearance so the GM cannot accidentally act with elevated permissions while inspecting the player's UI.
- Reuses a single second mirror window and retargets it when another player token is selected, preventing window proliferation.
- Added independent persisted window geometry for the mirror and included it in normal catalogue, progress, hunt, fieldwork, and setting rerender propagation.
- Added a public GM API method `openPlayerPerspective()` for integrations and automation.
- Added regression coverage for player-owner resolution, exact player-context rendering contracts, read-only interception, mirror rerender propagation, API exposure, and localization parity.

## 1.5.1 — 2026-10-10

- Fixed the GM approval workflow so pending player fieldwork requests are visible immediately and are no longer confined to the GM-only tab.
- Added a persistent pending-approval banner across the GM dashboard and a full approval queue directly on the Fieldwork tab.
- Added selected-token player context for GMs: selecting one player-owned Actor now shows that player’s field-check totals, successful rumor discoveries, successful track discoveries, active approvals, and recent approval history.
- Added a dedicated fieldwork-change event plus Foundry setting `onChange` handling, with coalesced rerenders, so approval creation/resolution refreshes open dashboards reliably without duplicate render storms.
- Kept the existing world-level approval state and made its UI synchronization independent of the currently selected dashboard tab.
- Tightened track-request validation so a request cannot combine a quarry with an unrelated assigned hunt.
- Preserved one-use approval semantics, duplicate-request coalescing, evidence review, knowledge progression, and player progress data.
- Added multiplayer regression coverage for GM visibility, selected-token ownership context, setting-change propagation, and mismatched hunt/quarry rejection.

## 1.5.0 — 2026-09-25

- Expanded the in-dashboard Guide with a detailed spoiler-safe Player guide and a complete GM guide while preserving the original terse four-step quick guide.
- Added a GM approval queue for repeatable player fieldwork and shared hunt attempts.
- Added one-use approvals for rumor gathering, track searches, and active hunt-step attempts.
- Kept player notes, sightings, trophies/samples, journals, and other personal record-keeping self-service.
- Separated player evidence recording from automatic knowledge credit; sighting and trophy credit is now GM-reviewed when approval gating is enabled.
- Added unresolved-request coalescing so repeated clicks cannot flood identical active requests.
- Added Share Insight deduplication per sender, target, quarry, and sender knowledge stage.
- Added detailed role boundaries and end-to-end hunt workflow documentation for both GMs and players.
- Added a world setting, enabled by default, to require GM approval for repeatable player fieldwork.
- Preserved stable quarry IDs, hunt IDs, provider contracts, Actor links, localization architecture, image overrides, and existing player progress.
- Added regression coverage for approvals, single-use consumption, evidence-credit review, and guide/permission contracts.

## 1.4.3 — 2026-08-09

- Removed the unsupported top-level `system` key from `module.json`, eliminating Foundry VTT v13 manifest validation warnings.
- Added a manifest regression check that fails future builds if the unsupported key is reintroduced.
- Preserved all existing compatibility metadata, module IDs, settings, localization, public APIs, and runtime behavior.

## 1.4.2 — 2026-08-03

- Added bounded asynchronous work queues with browser-yield support for Actor provisioning and other independent bulk work.
- Coalesced progress and search DOM updates to animation frames and cached frequently accessed DOM nodes.
- Serialized mapped geometry writes, coalesced unchanged window-state persistence, and removed blocking close-time settings writes.
- Cached bundled catalogue fetches and shared concurrent in-flight requests.
- Replaced repeated dashboard, provider, monster, level, Actor, and embedded-document scans with indexed Map lookups.
- Parallelized independent content installation, transfer, reset, user synchronization, and cross-user sharing operations while serializing same-user progress writes.
- Reduced unnecessary forced rerenders and cleaned up stable-search listeners explicitly.

## 1.4.1 — 2026-08-03

- Replaced embedded bilingual content records with standard Foundry localization keys.
- Made Foundry’s global Language Preference the sole language selector.
- Removed custom translation loading/injection and language-specific runtime branches.
- Added future-language authoring documentation and regression coverage.
- Preserved the coordinated actor-image feature set and all stable IDs and settings.

## 1.4.0

- Added persistent quarry-image overrides and Foundry FilePicker selection.
- Synchronized dashboard portraits, Actor images, and prototype-token textures.
- Added packaged-image restoration and source-author documentation.

## 1.3.6

- Replaced unrestricted recursive operation-result traversal with an explicit schema for success, failure, count, and nested-result fields.
- Treats Foundry Documents, DataModels, Collections, proxies, class instances, and accessor properties as opaque values.
- Prevents progress inspection from invoking D&D 5e compatibility getters while preserving accumulated failure reporting and success/failure window policy.
- Published shared dashboard toolkit contract 1.1.0 with safe `operationHasFailures` and result summarization helpers.

## 1.3.5

- Added an opt-in shared progress lifecycle that closes clean successful operations immediately and keeps failed operations foregrounded with their error details.
- Disabled Foundry close animation for Record Sighting, Record Trophy/Sample, and Edit Monster windows.
- Made Edit Monster geometry persistence non-blocking during close, matching the record-entry windows.
- Preserved all saved geometry, record results, and monster-edit behavior.

## 1.3.4

- Made Record Sighting and Record Trophy/Sample close immediately instead of waiting for client-setting persistence.
- Deferred Bestiary refreshes until the record-entry window has completed closing.
- Corrected Share Insight player-name contrast.
- Corrected Share Insight, Add Note, and reusable core prompt fields with bounded border-box sizing and balanced horizontal padding.
- Audited all module-family textareas; only the core module contains this DialogV2 free-text control pattern.

## 1.3.3

- Rebuilt Bestiary list entries as structural cards with an independent full-card action hitbox, preventing Foundry button sizing from clipping Tier and Knowledge metadata.
- Fixed shared progress dialogs to use a stable viewport-clamped width.
- Added structured extraction and display of operation failures in shared progress dialogs.

## 1.3.2 — 2026-07-31

- Replaced the Tier/knowledge subtitle with separate wrapping fact badges to eliminate compressed labels.
- Corrected shared ApplicationV2 option generation.
- Added a strict GM-only Actor unlink API for managed-resource cleanup.
- Added regression coverage for narrow metadata layout, valid ApplicationV2 options, and UUID-guarded unlinking.

## 1.3.1 — 2026-07-31

- Made Bestiary list entries grow naturally with localized tier and knowledge-level subtitles.
- Replaced sighting and trophy/sample prompts with resizable ApplicationV2 record windows.
- Persisted record-window position and dimensions per client and record type.
- Corrected right-side input and textarea padding through border-box sizing.
- Added regression coverage for dynamic card layout and record-window persistence.

- Normalized the canonical family title and coordinated dependency versions across all four official modules.
- Added/consumed the core naming API with structured validation, registrations, startup warning deduplication, and dashboard-open warnings.
- Added/consumed the shared dashboard toolkit for ApplicationV2 geometry, reset controls, stable search, progress, busy states, operation reporting, and safe destructive confirmations.
- Preserved stable module IDs, existing settings and flags, imported content identities, provider IDs, and documented compatibility aliases.
- Added complete English/German localization parity, developer guidance, migration documentation, tests, and release qualification artifacts.
- Retained this module's high-contrast dark field-journal palette and module-specific functionality.

## 1.2.1 — 2026-07-29

- Narrowed all launcher hooks to module-owned Token HUD and directory integration points; removed broad Application render interception.
- Made startup, keybinding, Scene Control, socket, and optional integration registration idempotent and independently resilient.
- Hardened GM-authoritative hunt mutations against malformed, unauthorized, and replayed socket requests.
- Preserved unrelated embedded Actor Items and effects when refreshing provider-managed quarry Actors.
- Knowledge-gated player-facing API catalogue data and removed GM-only secrets and Actor source metadata.
- Added ApplicationV2 listener cleanup, active-tab persistence, scoped CSS, and comprehensive interference regression tests.
- Excluded source-only documentation from the installable archive.

## 1.2.0

- Added a public, system-neutral system-adapter registry.
- Added adapter capabilities for native field checks, quarry Actor generation, harvest Items, and encounter profiles.
- Allowed system adapters to provision Actors for intentionally system-neutral core quarry without changing catalogue records.
- Exposed adapter registration, capability inspection, harvest creation, and encounter metadata through the public API.

## 1.1.0 — 2026-07-25

- Added deliberate Actor provisioning without inventing system-specific stat blocks.
- Added Actor sources from world/compendium UUIDs, raw system data, or registered system adapters.
- Added GM controls for creating missing Actors, refreshing managed Actors, and provisioning a selected quarry.
- Added a strict complete-monster-package contract for complementary modules.
- Added bundle flattening and automatic relationship linking for rumors, tracks, books, hunt structures, and complications.
- Added an explicit GM setting that alone permits incomplete provider packages.
- Added provider diagnostics in the GM dashboard and public validation/report APIs.
- Added schema-v2 migration, stable complication IDs, complete built-in relationship metadata, and explicit core Actor-omission policies.
- Added six provider/Actor API tests and expanded seed validation.

## 1.0.0 — 2026-07-25

- Added the Runyth Hunter's Bestiary control centre using Foundry VTT ApplicationV2.
- Added independent per-user bestiary progress, notes, sightings, trophies, hunt history, fieldwork statistics, and discoveries.
- Added a GM-owned monster catalogue with public knowledge layers and GM-only UI fields and generated-document ownership.
- Added active hunt micro-questlines with clues, checks, setbacks, hazards, lairs, and conclusions.
- Added 24 quarry species, 30 track/spoor categories, 44 weighted rumors, 30 complications, 12 multi-page research books, six hunt templates, ecology, field-library, and investigation systems.
- Added system-neutral checks with enhanced D&D 5e skill integration.
- Added GM-authoritative socket handling for shared hunt mutations and knowledge awards.
- Added generated Journal books and GM-private Roll Tables with idempotent installation.
- Added personal bestiary Journal publication and refresh.
- Added JSON export/import for self, selected players, or the entire module state.
- Added a complementary content-pack API and schema validation.
- Added Configure Settings launchers, Scene Controls, Token HUD, Actor Directory, and Journal Directory entry points.
- Added per-user window position and size persistence with viewport clamping and reset.
- Added English and German localization and high-contrast responsive styling.
- Added reproducible build, static validation, schema tests, and ZIP layout checks.
