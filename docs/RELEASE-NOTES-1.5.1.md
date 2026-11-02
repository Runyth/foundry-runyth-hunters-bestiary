# Hunter's Bestiary 1.5.1 — Patch Release

This patch repairs the multiplayer GM approval workflow introduced in 1.5.0.

## Fixed

- Pending player fieldwork is visible to GMs regardless of the currently selected dashboard tab.
- The Fieldwork tab includes the complete active approval queue with approve, deny, and revoke actions.
- A compact pending-approval indicator is present in the GM dashboard header.
- Selecting one player-owned token gives the GM contextual totals and recent approval history for that player.
- Fieldwork setting changes trigger a dedicated module event in addition to Foundry's settings `onChange` path.
- Multiple change notifications in the same browser frame are coalesced into one dashboard rerender.
- Track approval requests cannot combine an unrelated hunt and quarry.

No player-progress or world-data migration is required.
