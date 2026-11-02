# Module Design

## Design goal

Hunter's Bestiary makes a monster encounter begin before initiative. It supplies a repeatable play loop in which uncertainty, ecology, investigation, preparation, confrontation, and documentation are mechanically connected.

## Core loop

1. **Hear** — A player acquires a rumor, book reference, witness statement, or damaged specimen.
2. **Hypothesize** — The party associates the clue with an unknown or partially known creature.
3. **Track** — Field signs establish direction, age, number, condition, and likely territory.
4. **Investigate** — A hunt proceeds through short sequential scenes rather than one binary Survival check.
5. **Prepare** — Identified behavior, defenses, weaknesses, and ecology support meaningful choices.
6. **Confront** — The hunt may end through observation, deterrence, relocation, negotiation, capture, escape, or killing.
7. **Record** — Each player records personal discoveries, sightings, trophies, and notes.
8. **Share** — Players may deliberately share an insight without making all personal progress identical.

## Data layers

### World catalogue

The catalogue contains monster definitions, tracks, rumors, books, trail templates, complications, and knowledge thresholds. Only GMs may edit it. Complementary modules add provider-tagged complete monster packages through the public API. By default, a monster package is rejected unless it includes or references rumors, tracks, research, a hunt structure, complications, and an explicit Actor policy.

### Shared hunts

A hunt contains participants, visibility, one quarry, a template-derived sequence of steps, attempts, contributions, complications, status, and outcome. The active GM is authoritative for shared mutations received over the module socket.

### Personal progress

Each User has independent points and logs for every monster. Discovery levels are derived from points unless the GM sets a manual level. Notes, sightings, trophies, read books, and statistics are not forced to match other party members.

### Actor integration

The core catalogue is system-neutral and therefore does not invent combat statistics. A monster package must explicitly choose one Actor policy: link or import an Actor by UUID, provide complete system-specific Actor data, use a registered system adapter, or deliberately omit an Actor with a meaningful reason. This keeps investigation content useful across systems without creating invalid or misleading Actors.

Provisioned Actors are world documents linked back to the catalogue entry through module flags and `actorUuid`. Existing world Actors are linked directly; compendium Actors are copied into a managed world folder.

### Generated Foundry documents

The optional library installer creates page-based Journals for research books and field signs plus GM-private Roll Tables for rumors, signs, and complications. Personal publication creates one owned Journal per user.

## Hunt model

A hunt is a compact quest graph represented as an ordered sequence. Each step defines:

- A Foundry-localized name.
- A semantic kind such as rumor, survey, spoor, lair, approach, or confrontation.
- One or more suitable skills.
- A DC.
- Success and failure fiction.
- Status and attempt history.

Success completes the current step and unlocks the next. Failure records the contribution and can create a random complication without deleting progress. This avoids a single failed roll ending the entire activity.

## Default hunt templates

- **Classic Trail** — rumor, perimeter survey, spoor, approach, confrontation.
- **Settlement Attacks** — victim analysis, pattern mapping, bait or watch, interception.
- **Missing Expedition** — last known route, abandoned camp, survivor signs, rescue or lair.
- **Ecological Mystery** — ecosystem anomaly, specimen analysis, territory model, intervention.
- **Urban Predator** — separate witness reports, map city access, protect bystanders, and stage a controlled intercept.
- **Migration Intercept** — establish the seasonal clock, map the corridor, remove pressure, and guide a safe crossing.

## Knowledge gating

Player-facing information is divided into ordered fields. The UI and personal Journal renderer reveal only fields available at the user's current level. Explicit GM secrets are rendered only for GMs.

## Outcomes

The design treats a hunted creature as part of an ecosystem rather than a mandatory bag of hit points. Outcomes include slain, captured, driven off, relocated, observed, negotiated with, escaped, and unknown. Future content can attach different rewards and consequences to each outcome.

## UX principles

- Every normal action has a visible entry point.
- No macro or developer-console command is required.
- The current selected hunter is always visible.
- GM-only controls are visually separated.
- Dangerous actions require confirmation.
- Windows remember user-local size and position and can reset themselves.
- Text wraps and grids collapse at smaller sizes.
- Buttons use text labels alongside icons where space permits.
- Shipped catalogue content uses Foundry localization keys; additional languages can be added through manifest-declared dictionaries without code changes.

## Extension points

The API intentionally supports provider content without requiring direct setting manipulation. Provider registration is transactional: strict validation happens before world data changes. Complementary modules may reuse shared core records by stable ID, register raw Actor data, reference Actor UUIDs, or install system-specific Actor adapters. The GM provider report surfaces incomplete packages when the development-only partial-content setting is enabled.

Custom hooks announce readiness, catalogue changes, hunt changes, attempts, knowledge sharing, and data imports. See `API.md`.
