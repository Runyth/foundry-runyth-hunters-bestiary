# Hunter's Bestiary 1.7.0 — Feature Qualification

## Scope

- configurable global/per-monster hunt eligibility;
- configurable rumor quarry pool and non-repeat cycle;
- explicit field disclosure gates and GM approval;
- player-chosen desired final outcomes with configurable resolution policy;
- terminal vs escaped quarry-cycle semantics;
- legacy campaign visibility preservation;
- export/import preservation of new player progress fields;
- responsive large-list configuration UI.

## Automated acceptance

The release suite must prove:

1. Default identity and weakness thresholds are conservative.
2. Quarry-pool selection honors configured membership and repeat avoidance.
3. Per-monster eligibility overrides beat global values.
4. New records expose only explicitly unlocked fields.
5. Legacy records preserve old level-based visibility.
6. GM-approved reveal requests unlock exactly one requested field.
7. Terminal hunt completion clears the active quarry.
8. Escaped hunts keep the quarry active.
9. Export/import merging preserves rumor counts, unlocked fields and hunt-cycle state.
10. Hunt creation contains no preselected outcome.
11. Player resolution controls and GM actual-outcome controls coexist in the canonical dashboard.
12. Large rule lists use stable search and browser containment hints.
13. Localization remains complete and symmetric.
14. Existing public APIs, provider IDs and player progress normalize without a destructive migration.
