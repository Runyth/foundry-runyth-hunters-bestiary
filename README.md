# Runyth Hunter's Bestiary

Current release: **1.8.0**.

## 1.8.0 Fieldwork requirements and quarry queue

- Fieldwork is now an explicit staged progression: rumors can unlock track searches, successful tracks can probabilistically unlock sightings, sightings can probabilistically reveal an absolute danger band, and Hunt proposals can require that danger to be known.
- Every threshold, probability, approval requirement, and the per-monster danger tier can be configured globally with per-monster overrides.
- Players may defer an active quarry and later request GM-approved reactivation. The default capacity is one active quarry/Hunt plus up to two deferred quarry projects.
- Players propose Hunts with their intended goal and metadata; the GM approves the actual Hunt start and remains authoritative over the eventual real outcome.
- Player-facing encounter danger uses named absolute bands rather than raw numeric encounter metadata.
- The Hunt monster selector is a lazy searchable control that does not materialize the entire catalogue when the editor opens.

See [`docs/HUNT-SYSTEM.md`](docs/HUNT-SYSTEM.md), [`docs/PLAYER-GUIDE.md`](docs/PLAYER-GUIDE.md), and [`docs/GM-GUIDE.md`](docs/GM-GUIDE.md).

## 1.7.0 hunt-system redesign

- GMs configure a global minimum knowledge level required to start hunts, with per-monster overrides.
- A configurable quarry pool drives the first successful rumor of each hunt cycle; completed quarry is avoided on the next cycle when alternatives exist.
- New monster entries begin deliberately unknown. Identity and every other information field use configurable level, point, successful-rumor, chance, and optional GM-approval gates.
- Players choose their desired outcome only at the final hunt stage. Automatic, check-plus-GM, and GM-only resolution policies determine how the attempt is adjudicated; the GM records the actual result where required.
- Escaped quarry remains active for a re-hunt, while terminal outcomes clear the cycle.

See [`docs/HUNT-SYSTEM.md`](docs/HUNT-SYSTEM.md).

## 1.6.0 player-perspective mirror

- GMs can select exactly one player-owned token and open a second Runyth Hunter's Bestiary window from the normal GM dashboard.
- The second window is rendered by the same dashboard implementation with the selected player as its effective viewer.
- Knowledge gates, discovered monsters, progress, notes, evidence, hunts, approvals, library state, statistics, permissions, and the player guide therefore match the player-facing dashboard.
- GM-only tabs, secrets, provider diagnostics, catalogue controls, image editing, provisioning, and manual knowledge controls are absent from the mirrored player context.
- The selected token Actor is used as the mirrored active hunter.
- The mirror is inspection-only for state-changing controls to prevent accidental GM-privileged mutations while preserving the exact player-visible UI.
- One mirror window is reused and retargeted when the GM selects another player's token.

See [`docs/PLAYER-PERSPECTIVE.md`](docs/PLAYER-PERSPECTIVE.md).

## 1.4.0 actor-image feature

- Every monster has one effective image shared by the Bestiary list, selected-monster header, linked Actor portrait, and prototype-token texture.
- GMs can click the selected monster portrait to open Foundry's standard image FilePicker.
- A selected file is stored as a world-level override and immediately synchronized to an existing linked Actor and prototype token.
- **Restore packaged image** removes only the override and reapplies the data-file image.
- Provider refreshes and Actor updates preserve world overrides.
- Complementary modules consume the same image service, preventing dashboard and Actor artwork from diverging.

## Installation

Extract `hunters-bestiary-v1.8.0.zip` into Foundry's `Data/modules` directory while Foundry is stopped, then start Foundry and enable **Runyth Hunter's Bestiary**.

See [`docs/ACTOR-IMAGES.md`](docs/ACTOR-IMAGES.md) for pre-packed artwork, installed-world image selection, storage behavior, and build instructions.
## Localization

This module uses Foundry VTT’s standard global localization system. Select the active language through Foundry’s **Language Preference** setting; there is no dashboard-specific selector. English is the fallback/default language. See [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md) to add another language.

