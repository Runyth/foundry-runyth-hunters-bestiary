# Hunter's Bestiary API

Release: 1.7.0. Public APIs are exposed through `game.modules.get("hunters-bestiary").api`; no new global namespace is required. Existing compatibility surfaces are retained for this feature release.

## Core naming API

| Method | Purpose |
|---|---|
| `getNamingConvention()` | Return the canonical family name, patterns, separators, and naming API version. |
| `getCanonicalModuleName(metadata)` | Derive the exact display title from structured metadata. |
| `validateComplementaryModuleName(metadataOrId, actualName?)` | Return structured title validation. |
| `validateComplementaryModuleRegistration(metadata, declaration)` | Validate naming plus declared dashboard/API/localization/settings constraints. |
| `registerComplementaryModule(metadata)` | Store a normalized registration and emit the registration hook. |
| `unregisterComplementaryModule(moduleId)` | Remove a registration and reset startup-warning state. |
| `getRegisteredComplementaryModules()` | Return cloned registration records. |
| `warnForInvalidComplementaryModuleName(metadataOrId, options)` | Produce Foundry and console warnings without rewriting a manifest. |
| `warnForEnabledComplementaryModuleNames()` | Check all registered modules at startup. |

Naming API version: `1.0.0`.

## Shared dashboard API

The toolkit is available as `game.modules.get("hunters-bestiary").api.ui`.

| Method | Purpose |
|---|---|
| `createDashboardOptions(options)` | Produce consistent ApplicationV2 window options. |
| `clampGeometry(value, defaults, viewport)` | Clamp saved dimensions and coordinates to the current viewport. |
| `loadGeometry(options)` | Load client-scoped geometry. |
| `saveGeometry(options)` | Save clamped client-scoped geometry. |
| `resetSize(options)` | Restore only default width/height while preserving position. |
| `resetPosition(options)` | Restore only position while preserving size. |
| `createGeometryPersistence(app, options)` | Debounce and flush final geometry with a safe lifecycle. |
| `bindStableSearch(root, options)` | Filter in place through an AbortController-scoped input listener. |
| `filterEntries(root, options)` | Apply query visibility and empty-state messaging without replacing the input. |
| `runProgressOperation(options)` | Run an operation with phase, processed/total/percentage, success/skipped/failure counts, details, busy-state handling, optional clean-success closure, and foreground failure retention. |
| `confirmDestructiveAction(options)` | Show exact eligible and preserved scopes with explicit danger confirmation. |
| `setBusyState(root, busy, options)` | Disable conflicting controls and expose an accessible busy state. |
| `reportOperationResult(options)` | Send localized notifications and structured detail logs. |
| `summarizeOperations(entries)` | Aggregate explicit operation result records. |
| `summarizeOperationResult(result)` | Summarize only the supported result schema without traversing Documents or class instances. |
| `collectOperationFailures(result)` / `operationHasFailures(result)` | Inspect explicit `failed`, `failures`, `errors`, and nested `results` fields; accessor properties and rich runtime objects remain opaque. |
| `validateDashboardModuleName(metadata, options)` | Perform one dashboard-open naming check. |

Dashboard API version: `1.0.0`. A module requiring a newer major version must fail gracefully and expose an `INCOMPATIBLE_DASHBOARD_API` diagnostic rather than invoking unavailable helpers.

## Hunt Rules API

| Method | Purpose |
|---|---|
| `getHuntRules()` | Return the normalized world hunt policy, including quarry pool, hunt eligibility, disclosure rules, resolution policies and sparse monster overrides. |
| `setHuntRules(rules)` | GM-only replacement of the Hunt Rules after normalization and bounds checking. |
| `openPlayerPerspective(...)` | GM-only player-perspective mirror using the canonical player dashboard rendering pipeline. |

Hunt Rules are world policy. Per-player rumor counts, explicitly revealed fields and current quarry-cycle state remain in the player's progress flag.

## Existing core content and system APIs

The naming/UI additions are additive. Existing public methods remain available for catalogue, monster lookup, hunts, player progress, export/import, reference-library installation, personal Journal publication, content/provider validation and reports, Actor adapters, system adapters, harvest Items, encounter profiles, and Actor provisioning. Existing provider and adapter aliases are not removed in 1.3.0.

## Initialization, registration, and rollback

1. Expose the module's own API during `init` so callers can obtain `whenReady()` even when later initialization fails.
2. Register settings and narrow integrations idempotently.
3. During `ready`, verify required module/system versions and await every required `whenReady()` promise.
4. Negotiate naming/dashboard compatibility before provider content registration.
5. Register naming metadata with the core.
6. Validate local content before registering it.
7. Register provider, content, or system-layer records atomically where the owning API supports atomic registration.
8. Resolve the module's `whenReady()` status in `finally`, including failures rather than leaving callers pending.

When registration spans APIs, unregister earlier layers if a later layer fails. The aquatic D&D reference implementation rolls back its D&D provider and ecology provider registrations when atomic combined registration fails. Partial content acceptance is never implicit: use the owning module's explicit `allowPartial` or accepted-incomplete policy only when supported and intentionally enabled by a GM.

Unregister during a controlled development reload or rollback with `unregisterComplementaryModule(moduleId)` and the corresponding provider unregister method. Normal Foundry package disable/reload does not require a broad global unload hook.

## Machine-readable registration validation

```javascript
const declaration = {
  localizationPresent: true,
  settingsPresent: true,
  usesInvalidGlobalHooks: false
};

const report = core.validateComplementaryModuleRegistration(metadata, declaration);
if (!report.valid) {
  console.warn("Complementary-module declaration failed", report);
}
```

The runtime validator can reliably check canonical title metadata, supported type, requested API major version, dashboard declaration, provider ID, and developer-supplied declarations for localization/settings/hooks. It cannot prove visual contrast, keyboard usability, deterministic builds, CSS isolation, or complete localization by observing a running package alone; those remain build-time and manual-release checks.

## Permissions

Dashboard visibility does not grant authority. Every method that creates, updates, deletes, registers privileged provider data, or exposes GM-only truth checks `game.user.isGM` internally and fails with a localized error when unauthorized. Player-safe read APIs return filtered data where supported.


## `unlinkActor(monsterId, { actorUuid })`

GM-only additive method. It clears the stored Actor link only when the optional expected UUID matches the currently linked UUID. It does not delete an Actor and returns a structured result. Complementary modules should delete only strictly provenance-marked Actors before invoking this method.

## Valid dashboard options

`api.ui.createDashboardOptions(...)` returns ordinary ApplicationV2 position fields (`width`, `height`) under `position`. Minimum size values are exposed as `hbGeometry.minWidth` and `hbGeometry.minHeight` for geometry persistence and CSS enforcement; they are never passed to Foundry's sealed `ApplicationPosition`.
