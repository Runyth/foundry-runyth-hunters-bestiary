# Runyth Hunter's Bestiary — Hunt System 1.7

## Design goal

A hunt is a campaign project: discover a quarry, learn enough to pursue it responsibly, follow the trail, reach a confrontation, then decide what the hunter is actually trying to achieve. Buttons support that fiction; they do not replace it.

## Rumor-driven quarry cycle

Each player has one current rumored quarry. The GM configures a world-level quarry pool in **GM Dashboard → Hunt Manager → Configure Hunt Rules**.

- The first successful rumor when no quarry is active selects one monster from that pool.
- Later successful rumors stay focused on that quarry.
- A terminally resolved hunt clears the quarry and remembers it as the last completed quarry.
- The next successful rumor selects the next quarry.
- By default, the immediately previous completed quarry is excluded when another pool entry is available.
- An unintended `escaped` result does not clear the quarry; it remains available for a re-hunt.

The pool is independent of the full catalogue, so the GM can keep campaign-inappropriate creatures out of random discovery.

## Knowledge-gated hunt eligibility

The GM can set a global minimum knowledge level required before a hunt may become active. Every monster may override that minimum.

When an active hunt is saved, every assigned hunter must meet the quarry's minimum. The same requirement is checked again before shared hunt attempts and final-resolution requests.

Level `0` keeps the old unrestricted behavior.

## Progressive information disclosure

Newly discovered monsters do not automatically expose their identity or stat-like metadata. Each field has four gates:

- minimum knowledge level;
- minimum knowledge points;
- minimum successful rumor count;
- reveal chance after all minimums are met.

A field may additionally require GM approval. A successful reveal roll for such a field enters the normal GM approval queue rather than exposing the field immediately.

Default identity behavior deliberately starts uncertain: the name requires at least five successful rumors and five points; each later eligible rumor has a chance to reveal it. Weaknesses default to Mastered knowledge, forty points, forty successful rumors, a low reveal chance and explicit GM approval.

The GM may configure every field globally and then override individual monsters without duplicating the entire rule set.

Existing campaigns retain knowledge that the pre-1.7 level-based model already exposed. New monster records use only the explicit disclosure model.

## Final hunt resolution

The GM no longer chooses a guaranteed outcome while creating the hunt. The final conclusion step is a distinct resolution phase.

1. The player chooses the **desired outcome**.
2. The configured policy determines what happens next.
3. The GM records the **actual outcome** if adjudication is required.

Policies:

- **Automatic** — resolves immediately. Default example: deliberately releasing/allowing a non-hostile quarry to leave.
- **Check + GM adjudication** — player performs one configured field check, then the GM decides the scene outcome. Default examples: evading, observing or negotiating.
- **GM adjudication** — no artificial skill check is required; the GM determines whether the fiction achieved the objective. Default examples: capture, kill, relocation and driving off.

The actual outcome can differ from the player's desired outcome. A capture attempt can become slain or escaped. `escaped` is intentionally non-terminal for the quarry cycle so the monster can be pursued again.

## Performance model

Hunt Rules avoids a giant per-monster form. Global rules render once; a per-monster override opens only for the selected monster. Catalogue selectors use indexed membership checks, stable search filtering, scroll containment and browser `content-visibility` hints. Hunt-rule objects are normalized once at the settings boundary and reused by hot-path helpers.


## 1.8 staged Fieldwork requirements

The 1.8 workflow treats investigation as a sequence of capabilities rather than a collection of independent buttons. The default flow is:

1. A successful rumor cycle identifies an active quarry.
2. The hunter accumulates successful rumors. At the configured threshold (default 3), Track searching becomes available.
3. Successful Track searches are counted independently from generic knowledge points. Once the configured baseline has been exceeded (default: after 5 successful tracks), each later successful Track search gets the configured chance (default 35%) to unlock Sighting recording.
4. After Sighting is unlocked, the hunter may record real sightings of the active quarry. Once the configured baseline has been exceeded (default: after 3 sightings), each later sighting gets the configured chance (default 35%) to reveal the quarry's absolute encounter danger.
5. If Hunt start requires known danger (default), the player cannot propose the Hunt until the danger band is officially revealed. Existing knowledge-level requirements still apply in parallel.
6. The player proposes the Hunt. The proposal is always GM-reviewed. Approval creates the actual shared Hunt.

Thresholds and probabilities are intentionally separate. Reaching a threshold never guarantees the next unlock unless its chance is 100%. A 0% chance disables probabilistic unlocking without removing the prerequisite model.

### Global rules and monster overrides

The GM configures global defaults in **Hunt Rules → Fieldwork progression**. A monster-specific editor can override only the values that need to differ:

- successful rumors required before Track searches;
- successful Track baseline before Sighting unlock rolls;
- Sighting unlock probability;
- optional GM approval for the Sighting unlock;
- Sighting baseline before danger-reveal rolls;
- danger-reveal probability;
- optional GM approval for danger reveal;
- whether known danger is required before proposing a Hunt;
- the monster's absolute danger tier.

Empty/Inherited values continue to use the global rule. This keeps the common case cheap to configure and avoids copying a large settings object for every monster.

### Absolute encounter danger

Player-facing difficulty never displays raw CR or the internal numeric tier. Runyth Hunter's Bestiary uses five absolute bands, independent of the current party level:

1. **Low Threat**
2. **Elevated Threat**
3. **High Threat**
4. **Severe Threat**
5. **Extreme Threat**

The model is deliberately absolute: a creature does not become less dangerous merely because a stronger party is looking at it. The labels can be renamed globally to fit the campaign's vocabulary, while individual monsters can override which band they occupy. The internal numeric tier remains GM/configuration data and is not disclosed through the player-facing Bestiary API.

Monster Hunter games communicate difficulty primarily through ranked/starred quest structures rather than a canonical five-name immersive threat vocabulary. Runyth Hunter's Bestiary therefore uses its own descriptive bands instead of presenting invented terminology as official Monster Hunter nomenclature.

### Deferring a quarry

Once a hunter has enough information to judge the danger, they may decide that the quarry should wait. **Defer quarry**:

- removes that monster from the active quarry slot;
- appends it to the hunter's deferred queue;
- pauses an eligible single-player active Hunt for that quarry;
- never silently pauses a shared Hunt involving multiple players; the GM must handle a shared Hunt explicitly.

The deferred capacity is configurable globally and defaults to **2**. The active quarry is separate, so the default working set is one active quarry plus two deferred projects.

A deferred quarry remains visible in the hunter's Bestiary but cannot be used for active Fieldwork/Hunt attempts. To resume it, the player sends **Request reactivation**. The GM approves or denies that request. On approval, the chosen deferred quarry becomes active and the previously active quarry is appended to the deferred queue. The mutation is atomic and respects the configured queue capacity.

### Active Hunt limit

The number of simultaneous active Hunts per hunter is configurable globally and defaults to **1**. The limit is revalidated when a Hunt proposal is created and again when the GM approves it, preventing stale approvals from exceeding the current rule.

### Player-authored Hunt proposals

A Hunt proposal is intent, not an outcome. The player supplies the metadata they legitimately control or propose:

- Hunt title;
- region;
- patron/context;
- stakes;
- trail template;
- intended final outcome;
- personal plan/notes.

The GM approves the proposal. Approval creates a participant-scoped Hunt only if the quarry is still active, the knowledge/Fieldwork requirements are still met, and the active-Hunt limit has not been exceeded.

The intended outcome does **not** become the actual outcome. Final resolution continues to use the 1.7 resolution state machine: the player's desired result determines the attempted objective, checks and/or GM adjudication occur according to policy, and the GM records the actual result. Capture can therefore become escape, a planned observation can become a retreat, and so on without corrupting Hunt history.

Terminal outcomes clear the quarry cycle. Escape keeps the quarry active so it can be hunted again.

### Performance rules

Large catalogue selection must not depend on a native `<select>` containing every monster. The Hunt editor uses a lazy searchable selector that caches normalized search text and materializes at most 80 matching rows when opened. Hunt Rules uses indexed membership plus contained/`content-visibility` rows. No polling or continuously running observers are introduced by Fieldwork progression.
