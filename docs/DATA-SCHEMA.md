# Data Schema

Schema version: `2`

## World catalogue

Stored under the hidden world setting `hunters-bestiary.worldData`.

```text
{
  schemaVersion,
  moduleVersion,
  knowledgeLevels[],
  monsters[],
  tracks[],
  rumors[],
  books[],
  trailTemplates[],
  complications[]
}
```

Shipped text is represented by namespaced `HB.Content.*` localization keys resolved through Foundry `game.i18n`. Arrays such as habitats and signs contain localization keys. Research books may contain localized `chapters[]`; rumors may reference `monsterIds[]`, `regions[]`, truth classification, and weight. Campaign-authored provider text may be plain text. Provider content includes `providerId`.

## Complete monster package

A monster added by a complementary provider has relationship metadata:

```text
{
  ...monster fields,
  providerId,
  contentLinks: {
    rumorIds[],
    trackIds[],
    bookIds[],
    trailTemplateIds[],
    complicationIds[]
  },
  actorSource
}
```

Related records may additionally include `monsterIds[]`, allowing one rumor, track, book, hunt template, or complication to support multiple monsters.

### Actor source

```text
{ mode: "none", reason }
{ mode: "uuid", uuid }
{ mode: "data", systemId, data }
{ mode: "adapter", systemId, adapterId, data? }
```

`none` is a deliberate declaration, not an absent value. `data` must contain complete Actor creation data valid for the named game system. `adapter` delegates conversion to a runtime adapter registered through the public API.

Provisioned world Actors receive module flags containing the monster ID, source marker, provider ID, and provisioning timestamp. The monster's `actorUuid` is then updated to the world Actor UUID.

## Hunt

```text
{
  id, title, monsterId, region, patron, stakes,
  status, visibility, participantUserIds[], templateId,
  steps[], currentStep, complications[], contributions[],
  outcome, notes, createdBy, createdAt, updatedAt
}
```

Every step has `id`, localized `name`, `kind`, `dc`, permitted `skills`, localized success/failure text, status, and attempt history.

## Fieldwork approval queue

Transient GM-authoritative action approvals are stored separately from player progression under the hidden world setting `hunters-bestiary.fieldworkRequests`. They are deliberately excluded from portable player-progress exports.

```text
[{
  id, userId, type, status,
  monsterId?, huntId?, stepId?, recordId?, detail?,
  createdAt, resolvedAt?, resolvedBy?, consumedAt?
}]
```

Supported request types are `rumor`, `track`, `hunt-attempt`, `sighting-credit`, `trophy-credit`, and `discovery-reveal`. Rumor, track, and hunt-attempt approvals are single-use opportunities. Evidence-credit approvals are resolved directly by the GM and use a request-specific discovery source so retries are idempotent. Pending or approved duplicates are coalesced by scope to prevent queue flooding.

The queue is operational state rather than authored campaign content. Deleting or denying a request does not delete the underlying player note, sighting, or trophy.

## User progress

Stored under User flag `flags.hunters-bestiary.progress`.

```text
{
  schemaVersion,
  moduleVersion,
  monsters: {
    monsterId: {
      points, rumorsSucceeded, unlockedFields[], legacyDisclosure,
      manualLevel,
      notes[], sightings[], trophies[], discoveries[], hunts[],
      updatedAt
    }
  },
  booksRead[],
  fieldLog[],
  huntCycle: { activeMonsterId, lastCompletedMonsterId, lastCompletedHuntId },
  statistics,
  updatedAt
}
```

Logs use stable random IDs to support de-duplicating merge imports.

## Export envelope

```text
{
  format: "hunters-bestiary-export",
  schemaVersion,
  moduleVersion,
  exportedAt,
  worldId,
  exportedBy,
  users: { userId: { id, name, progress } },
  world?: { data, hunts },
  auditLog?: []
}
```

The importer validates the envelope, normalizes progress, validates world catalogue arrays and IDs, and applies user mapping. Non-GM import always targets the current user and cannot import world data. Actor documents themselves are not included in module JSON exports.

## Hunt rules

World-level hunt policy is stored under the hidden setting `hunters-bestiary.huntRules`. It contains global hunt eligibility, quarry-pool selection, disclosure gates, final-resolution policies, and sparse per-monster overrides. This is policy/configuration state, not portable player progression.

`unlockedFields[]` is the canonical explicit-disclosure record for new progress. `legacyDisclosure` preserves fields previously exposed by the pre-1.7 knowledge-level model. `rumorsSucceeded` counts successful rumor resolutions for disclosure requirements.


## 1.8 Fieldwork progression additions

Per-monster player progress additionally stores:

```text
tracksSucceeded,
fieldworkUnlocks[]
```

`tracksSucceeded` counts successful Track checks independently from generic knowledge points. `fieldworkUnlocks[]` records durable capability unlocks such as `sighting`. Encounter danger is disclosed by adding `difficulty` to `unlockedFields[]`; the internal numeric tier is never added to player-facing disclosure data.

The hunt cycle is now:

```text
huntCycle: {
  activeMonsterId,
  deferredMonsterIds[],
  lastCompletedMonsterId,
  lastCompletedHuntId
}
```

Only one `activeMonsterId` exists. Reactivation atomically swaps a deferred quarry into that slot and moves the former active quarry to the end of `deferredMonsterIds[]`, subject to the configured capacity.

Fieldwork approval records may additionally use `fieldwork-unlock`, `quarry-reactivation`, or `hunt-proposal`. Hunt proposal requests include a sanitized payload containing title, region, patron, stakes, template ID, planned outcome, and player notes. Approval creates a normal Hunt; the request is then consumed.

Hunts may contain `plannedOutcome`, which records intent separately from `outcome`. `outcome` remains the actual final adjudicated result.

Hunt Rules schema version 2 adds `fieldwork`, `difficultyBands`, and optional per-monster `difficultyTier`/Fieldwork overrides. Queue capacities (`maxDeferredQuarries`, `maxActiveHunts`) are global hunter-workload policy rather than per-monster policy.
