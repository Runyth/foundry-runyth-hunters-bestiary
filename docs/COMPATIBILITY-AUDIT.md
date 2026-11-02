# Compatibility and Interference Audit — Core v1.2.1

## Scope

Complete production-tree audit of Hunter's Bestiary v1.2.0, patched as v1.2.1 for Foundry VTT 13.351. The audit covered hooks, ApplicationV2 lifecycle, native DOM use, listeners, CSS, sheet/HUD/Scene Control/Chat/canvas ownership, settings, keybindings, sockets, public API, migrations, startup resilience, packaging, and complementary-module boundaries.

## Issues found and corrected

| Area | Affected files | Root cause | Correction |
|---|---|---|---|
| Broad application interception | `scripts/integrations.mjs` | Launchers used a broad ApplicationV2 render path capable of seeing unrelated windows | Replaced with narrow `renderTokenHUD`, `renderActorDirectory`, and `renderJournalDirectory` hooks only |
| Repeated lifecycle registration | `scripts/integrations.mjs`, `scripts/settings.mjs`, `scripts/main.mjs` | Repeated init/test calls could register settings, keybindings, Scene Controls, or hooks more than once | Added stable idempotency guards and one-shot API-ready state |
| Startup coupling | `scripts/main.mjs` | One optional integration failure could interrupt later startup work | API is exposed first; each subsystem initializes independently and reports named failures |
| Application listener accumulation | `scripts/apps/base-app.mjs`, `scripts/apps/main-app.mjs` | Renders could leave prior handlers or delayed persistence work alive | Added per-render `AbortController`, timer cleanup, geometry persistence, and active-tab restoration |
| Scene Control shape | `scripts/integrations.mjs` | Earlier assumptions could treat controls as an array | Requires the Foundry V13 record shape and inserts one named tool under `controls.tokens.tools` |
| Token HUD ambiguity | `scripts/integrations.mjs` | Fallbacks could select an unrelated controlled Token rather than the HUD Token | Resolves only the HUD application's Token/Actor, checks GM/owner access, and inserts one marked control |
| Socket replay and authorization | `scripts/socket.mjs`, `scripts/rolls.mjs`, `scripts/hunts.mjs` | A valid mutation request lacked a durable one-use action identity and full cross-checks | Added bounded payload validation, action whitelist, request replay cache, module-owned Chat-message identity, author/Actor/skill/DC/participant checks, and one-use message IDs |
| Player API data exposure | `scripts/api.mjs` | Full catalogue records could expose GM secrets and Actor source metadata to players | Player responses are knowledge-gated and stripped of GM-only fields; GMs retain the complete records |
| Managed Actor refresh boundary | `scripts/actors.mjs`, `scripts/constants.mjs` | Refreshing an Actor could replace all embedded Items/effects, including unrelated content | Reconciles only provider-managed embedded documents with stable flags/keys and preserves unrelated content, ownership, folder, and Actor identity |
| Global CSS utilities | `styles/hunters-bestiary.css` | `.muted` could style unrelated Foundry/module DOM | Scoped utility styling beneath module-owned roots/prefixes |
| Install archive scope | `tools/build.mjs` | Source documentation was included in the runtime ZIP | Install ZIP now contains runtime files only; source ZIP retains docs, tests, and tooling |

## Intentionally unchanged behavior

- The core injects no Actor-sheet or Item-sheet controls. Core D&D sheets, Tidy Modern/Classic, custom sheets, and Actor-related child applications therefore receive zero module controls.
- No `renderApplication`, `renderApplicationV2`, `renderActorSheet`, `renderItemSheet`, deprecated `renderChatMessage`, or canvas-render hook remains.
- The module creates passive Chat cards and uses `preCreateChatMessage` only to enforce GM recipients for its own private Roll Tables.
- The module creates no canvas overlays and does not modify Token nameplates, z-indexes, or display objects.
- Existing schema version 2, settings, hunts, progress, Actor/Token/Scene flags, catalogue edits, and extension API signatures remain compatible. No manual world migration is required.
- Complementary package completeness remains strict by default; the existing explicit GM opt-in is still required for partial packages.

## External errors

No external-package runtime log was supplied with this audit. No hacks, monkey patches, warning suppression, or compatibility shims were added for hypothetical errors owned by Tidy, Midi-QOL, DAE, Token HUD extensions, Chat extensions, or other packages. The manual matrix requires attribution by package path during live qualification.

## Automated result

- Static validation groups: 9 passed
- Node tests: 35 passed
- Production scripts syntax-checked: 21
- Localization parity: 308 English/German keys
- Runtime client test: not executable in the build environment; use `docs/TEST-PLAN.md`
