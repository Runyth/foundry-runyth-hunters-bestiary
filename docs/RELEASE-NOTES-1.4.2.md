# Hunter's Bestiary 1.4.2

Patch release focused on responsiveness, reduced document and DOM work, safe asynchronous concurrency, and Foundry-specific batching. No gameplay rules, stable IDs, localization keys, public APIs, or user data formats were intentionally changed.

## Changes

- Added bounded asynchronous work queues with browser-yield support for Actor provisioning and other independent bulk work.
- Coalesced progress and search DOM updates to animation frames and cached frequently accessed DOM nodes.
- Serialized mapped geometry writes, coalesced unchanged window-state persistence, and removed blocking close-time settings writes.
- Cached bundled catalogue fetches and shared concurrent in-flight requests.
- Replaced repeated dashboard, provider, monster, level, Actor, and embedded-document scans with indexed Map lookups.
- Parallelized independent content installation, transfer, reset, user synchronization, and cross-user sharing operations while serializing same-user progress writes.
- Reduced unnecessary forced rerenders and cleaned up stable-search listeners explicitly.

## Compatibility

No data migration is required. Existing progress, hunts, providers, image overrides, window positions, and linked Actors remain valid.
