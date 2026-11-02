# Feature qualification — Hunter's Bestiary 1.6.0

## Scope

GM player-perspective mirror using the canonical dashboard implementation.

## Invariants

- Same MainApp class and `templates/main.hbs` are used for both ordinary and mirrored player rendering.
- The mirror's effective viewer is always a non-GM user; a missing/deleted target falls back to a synthetic non-GM identity, never the actual GM.
- Player progress is read from the mirrored user's flag state.
- Hunt visibility is resolved with the mirrored user.
- Fieldwork requests and one-use approvals are resolved with the mirrored user.
- `isGM` in the template context reflects the mirrored user, not the actual GM.
- GM-only provider and Actor-provisioning analysis is skipped entirely for player and mirror renders.
- State-changing controls are visually unchanged but intercepted in the mirror.
- Navigation, search, guide opening, quarry selection, hunt selection, and mirror window geometry remain interactive.
- Only one mirror application instance is maintained.
- Normal update hooks rerender the mirror without polling.

## Automated coverage

See `tests/player-perspective.test.mjs` plus the existing progression, approval, API-permission, integration, UI-toolkit, localization, and performance suites.
