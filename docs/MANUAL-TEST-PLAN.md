# Manual Test Plan - Runyth Hunter's Bestiary 1.3.2


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



## 1.3.2 targeted checks

- Resize the Bestiary list pane until `Tier 4` and a long knowledge label wrap; verify no overlap or clipping.
- Confirm each list entry presents separate Tier and Knowledge facts.
- Verify `createDashboardOptions(...)` does not place minimum-size fields in ApplicationV2 `position`.
- Verify `unlinkActor(...)` refuses an unexpected UUID and clears the expected UUID for a GM.

## Patch 1.3.5 close-performance checks

1. Open and close Record Sighting with the title-bar close button and Cancel. Confirm immediate removal without the previous delayed animation.
2. Repeat for Record Trophy/Sample.
3. Open Edit Monster and close it without saving. Confirm immediate removal.
4. Resize or move each window, close it, reopen it, and confirm geometry still restores.
