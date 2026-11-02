# Testing

Automated regression total for this release: **132 passing tests**. Static quality validation also passes.

## Automated test commands

```bash
npm test
npm run check
npm run build
```

The build command reruns static validation and the complete test suite before packaging. Tests run without a live Foundry client by mocking the minimum runtime surfaces needed for deterministic behavioral checks.

## Required manual Foundry smoke test

1. Back up a disposable Foundry v13 world.
2. Install the new core first, then each enabled complementary module in dependency order.
3. Verify canonical titles in Manage Modules, Module Settings, window headers, notifications, generated folders, and confirmations.
4. Open each dashboard, resize/move/close/reopen it, then test **Reset size** and **Reset position**.
5. Type into every search field without losing focus or caret; remove characters and verify hidden entries return.
6. Run validation and diagnostics as GM; verify players do not see provider truth or destructive controls.
7. Run every relevant import/update workflow and confirm real phase/count/percentage feedback.
8. Cancel or close progress safely where supported, induce a controlled failure, and inspect the final summary/error detail.
9. For deletion, inspect the exact eligible list, cancel once, then confirm in a disposable world; verify unrelated/user-modified Documents survive.
10. Test startup with all modules, each supported subset, a disabled complementary module, a missing dependency, an incompatible API declaration, and valid/invalid third-party naming metadata.
11. Confirm one invalid-name warning at startup and one per intentional dashboard open, with no rerender loop.
12. Verify English and German UI paths and keyboard-only operation.

## Module-specific regression focus

## 1.3.0 behavior

- Authoritative naming registry and structured validator.
- Shared dashboard toolkit and structural CSS tokens.
- Provider overview, diagnostics, documentation access, stable search, real Actor-import progress, and client geometry reset controls.
- Existing field-journal visual identity and all content/progression/hunt workflows remain.



## 1.3.2 targeted checks

- Resize the Bestiary list pane until `Tier 4` and a long knowledge label wrap; verify no overlap or clipping.
- Confirm each list entry presents separate Tier and Knowledge facts.
- Verify `createDashboardOptions(...)` does not place minimum-size fields in ApplicationV2 `position`.
- Verify `unlinkActor(...)` refuses an unexpected UUID and clears the expected UUID for a GM.


## 1.8 Fieldwork / Hunt proposal acceptance

1. With default rules, verify Track search remains unavailable until 3 successful rumors and becomes available at the threshold.
2. Verify exactly 5 successful Tracks do not roll the Sighting unlock; the 6th and later successful Tracks do, using the configured probability.
3. Test 0% and 100% Sighting-unlock probabilities and the optional GM-approval path.
4. Verify Sighting recording is impossible before the capability is officially unlocked.
5. Verify exactly 3 sightings do not roll danger disclosure; the 4th and later sightings do, using the configured probability.
6. Verify danger-reveal GM approval leaves the label hidden until approved.
7. Confirm the player dashboard and player public API show only the named danger band, never raw CR/internal numeric tier.
8. Change all five global danger labels and verify the selected monster/player mirror update without modifying monster data.
9. Apply a per-monster danger-tier and Fieldwork-rule override and verify another monster still inherits global defaults.
10. Defer the active quarry and confirm it becomes inactive and appears in the deferred list; confirm the configured deferred limit is enforced.
11. Request reactivation of a deferred quarry and approve as GM. Confirm the prior active quarry is appended to the deferred queue and there remains exactly one active quarry.
12. Defer a quarry with a solo active Hunt and verify that Hunt pauses; approve reactivation and verify it resumes when the active-Hunt limit allows.
13. Attempt the same with a shared Hunt and verify the module refuses unsafe automatic pausing and explains that GM intervention is required.
14. With known danger and sufficient knowledge, create a player Hunt proposal. Confirm it remains pending until GM approval and that approval creates exactly one participant-scoped Hunt.
15. Confirm proposal metadata and planned outcome survive approval while actual `outcome` remains unset. Resolve the Hunt to a different actual outcome and verify history records the actual result.
16. Verify escaped resolution keeps/reactivates the quarry for another Hunt; verify terminal resolution clears it.
17. Set active-Hunt limit to 1, create one active Hunt, and confirm another proposal is rejected both at request time and after a stale approval condition changes.
18. Open New Hunt with a very large monster catalogue. Verify the quarry selector opens immediately, searching is responsive, and no more than 80 result rows are materialized at once.
19. Export and import player progress and verify successful Track totals, Fieldwork unlocks, and deferred queue merge without duplicates.
20. Repeat the workflow in the GM player-perspective mirror and verify it remains identical/read-only relative to the real player's visible state.
