# Patch Qualification 1.3.6

Runyth Hunter's Bestiary 1.3.6 defines the canonical safe operation-result contract. Validation must prove that rich Foundry runtime objects and accessor properties are never recursively enumerated, explicit nested failures remain visible, and existing progress-window lifecycle behavior remains unchanged.

## Required gates

- Complete automated test suite and static checks.
- Throwing compatibility-getter regression fixture remains untouched on success paths.
- Explicit nested per-document failures remain detectable.
- English/German localization parity.
- Deterministic install and source archives with source-to-install reproduction.
