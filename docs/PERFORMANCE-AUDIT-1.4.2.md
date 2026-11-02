# Performance Audit — Hunter's Bestiary 1.4.2

## Scope

The complete production source, dashboard lifecycle, data loading, settings persistence, import/update/delete workflows, provider registration, and packaging paths were reviewed for browser responsiveness and Foundry VTT v13 behavior.

## Applied improvements

- Added bounded asynchronous work queues with browser-yield support for Actor provisioning and other independent bulk work.
- Coalesced progress and search DOM updates to animation frames and cached frequently accessed DOM nodes.
- Serialized mapped geometry writes, coalesced unchanged window-state persistence, and removed blocking close-time settings writes.
- Cached bundled catalogue fetches and shared concurrent in-flight requests.
- Replaced repeated dashboard, provider, monster, level, Actor, and embedded-document scans with indexed Map lookups.
- Parallelized independent content installation, transfer, reset, user synchronization, and cross-user sharing operations while serializing same-user progress writes.
- Reduced unnecessary forced rerenders and cleaned up stable-search listeners explicitly.

## Deliberately serialized work

Asynchronous concurrency is bounded rather than unlimited. Operations that mutate one shared user record, require atomic provider/world-state replacement, or need precise per-document fallback diagnostics remain serialized. This prevents lost updates, request floods, and non-deterministic partial state while unrelated work proceeds concurrently.

## Browser and Foundry considerations

- Long independent batches use bounded concurrency rather than unbounded `Promise.all`.
- Fallback loops yield periodically so painting and input are not starved.
- Foundry bulk document methods and `render: false` are used where preserving per-document diagnostics allows it.
- Search and progress DOM writes are coalesced instead of triggering repeated synchronous layout work.
- Cached data loaders use a shared in-flight promise and normal browser caching.
- Window-state writes are coalesced and do not delay close animations.

## Regression coverage

- Automated tests: **74/74**
- English/German key parity: **1019/1019**
- New coverage includes concurrency limits, result ordering, shared-fetch deduplication, settings-write races, same-user mutation serialization, batch imports, and parallel dependency readiness where applicable.
