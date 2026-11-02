# Patch Qualification 1.3.3

## Scope

Structural monster cards, fixed-width shared progress dialogs, and structured failure retention.

## Automated qualification

- Tests: 54/54
- English/German localization parity: 332/332
- Static validation: passed
- Manifest paths and dependencies: passed
- Runtime archive path safety: passed
- Repeated deterministic builds: required by release packaging
- Source-to-install reproduction: required by release packaging

## Limitation

No live Foundry client was launched in the build environment.
