# System Adapter API

Runyth Hunter's Bestiary core is intentionally game-system-neutral. Starting with v1.2.0, a complementary module can provide native behavior for one Foundry game system without changing or copying the campaign's ecology, rumors, tracks, books, hunts, permissions, or player progress.

## Registering an adapter

```javascript
const core = game.modules.get("hunters-bestiary").api;
await core.whenReady();

core.registerSystemAdapter("example-pf2e-adapter", {
  systemId: "pf2e",
  label: "Example PF2e Adapter",
  version: "1.0.0",
  primary: true,

  supportsMonster(monster) {
    return statblockRegistry.has(monster.id);
  },

  async buildActorData({ monster, source, systemId, language }) {
    return validActorSourceData;
  },

  async rollFieldCheck({ actor, skillId, dc, modifier, extraModifier, rollMode }) {
    return {
      roll: evaluatedSystemRoll,
      total: evaluatedSystemRoll.total,
      modifier,
      success: evaluatedSystemRoll.total >= dc,
      skillLabel: "Survival"
    };
  },

  async buildHarvestItemData({ monster, options }) {
    return [validSystemItemSourceData];
  },

  async buildEncounterProfile({ monster, options }) {
    return { difficulty: "moderate", level: 5 };
  }
});
```

## Independent capabilities

An adapter may implement any non-empty combination of the following capabilities:

| Capability | Required method | Used by the core for |
|---|---|---|
| Actor provisioning | `buildActorData(context)` | Creating or refreshing world quarry Actors |
| Field checks | `rollFieldCheck(context)` | Tracking and hunt-stage checks |
| Harvest Items | `buildHarvestItemData(context)` | Generating system-native world Items |
| Encounter profiles | `buildEncounterProfile(context)` | System-specific encounter metadata |

Capabilities are inferred from implemented methods. An optional `capabilities` object may explicitly disable an implemented method, but it cannot enable a missing method.

## Adapter selection

Only adapters whose `systemId` equals `game.system.id` are eligible. If more than one is registered, adapters marked `primary: true` sort before non-primary adapters; equal candidates use adapter-ID order. A system ecosystem should therefore designate one primary integration and use that integration's own API for content packs.

## Actor behavior

A built-in or complementary monster may keep an explicit Actor source through the existing Actor-adapter API. When its Actor policy is deliberately `mode: "none"`, the core asks the active system adapter whether it supports that monster. This allows the portable core catalogue to remain unchanged while a system module supplies the real Actor.

System-neutral quarry without a matching stat block remain investigation-only and are reported as not requiring an Actor.

## Field-check result contract

`rollFieldCheck` may return `null` to use the core generic roll. A handled result must contain:

- `roll`: an evaluated Foundry Roll-compatible object;
- `total` or `roll.total`;
- optional `modifier`;
- optional `success`;
- optional localized `skillLabel`.

The core remains responsible for its field-check Chat Message, permissions, blind/GM/public visibility, statistics, and hunt progression.

## Harvest Item contract

`buildHarvestItemData` returns one Item source object or an array of Item source objects. Every record requires a non-empty `name` and a system-supported `type`. The core creates the configured Item folder, applies no player ownership by default, and adds provenance flags.

## Encounter-profile contract

Encounter profiles are intentionally opaque to the core. Return serializable data meaningful to the system, such as level, challenge rating, XP, role, encounter budget, troop size, or environment. The core clones and returns it without interpretation.

## Public management methods

```javascript
core.getSystemAdapters();
core.getActiveSystemAdapter();
core.unregisterSystemAdapter("example-pf2e-adapter");
core.buildHarvestItemData("monster-id");
core.createHarvestItems({ monsterId: "monster-id" });
core.getEncounterProfile("monster-id");
```

## Recommended module lifecycle

1. Declare Runyth Hunter's Bestiary v1.2.0 as a required module relationship.
2. Declare the target game system as a required system relationship.
3. Expose your module API during `init`.
4. During `ready`, await `core.whenReady()`.
5. Load and validate your system records.
6. Register one system adapter.
7. Re-register runtime records after every world load.
8. Provide a GM-facing status and provisioning menu.
9. Unregister only for development hot-reload workflows; Foundry normally reloads the page when modules change.

The D&D 5e 2024 complementary module is the reference implementation of this contract.
