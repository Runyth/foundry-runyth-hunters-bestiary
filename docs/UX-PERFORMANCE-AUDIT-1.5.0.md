# UX and Performance Audit — 1.5.0

## Design objective

The feature must let players handle routine hunting work themselves while keeping hidden information and repeatable progression opportunities GM-authoritative. The UI therefore uses progressive disclosure rather than adding another permanent dashboard or modal workflow.

## Decisions

- Reused the existing ApplicationV2 dashboard and Guide tab instead of creating new windows.
- Kept the terse quick guide and placed detailed role-specific guidance below it.
- Used a compact GM approval queue in the existing GM tab.
- Exposed request state directly in the relevant rumor, track, and hunt-step controls: request, waiting, approved/use.
- Made approvals one-use instead of cooldown-based. This maps the mechanical permission to a concrete fictional opportunity and avoids timers/polling.
- Separated evidence capture from progression credit. Recording is low-friction; progression remains deliberate.
- Kept module configuration in Foundry's Configure Settings rather than consuming dashboard space.

## Performance decisions

- No periodic polling or timers.
- No new document-wide event delegation beyond existing ApplicationV2 lifecycle bindings.
- Hidden world request state is bounded to the newest 500 records.
- Duplicate unresolved requests coalesce before persistence.
- Request-state writes are serialized to avoid concurrent read/modify/write races.
- Setting-change rerenders are restricted to relevant module applications.
- Existing cached catalogue loading, indexed lookups, animation-frame UI coalescing, bounded async work, and non-blocking window-state persistence are retained.

## Foundry alignment reviewed

The implementation was reviewed against Foundry VTT v13's standard Game Settings and user-permission model, keeping world-authoritative configuration in Configure Settings and using the module's existing ApplicationV2 surfaces rather than introducing a parallel configuration UI.

Official references reviewed:

- https://foundryvtt.com/article/settings/
- https://foundryvtt.com/article/users/
- https://foundryvtt.com/article/player-orientation/
