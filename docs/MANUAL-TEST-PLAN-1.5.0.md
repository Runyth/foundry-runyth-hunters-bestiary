# Manual Test Plan — Runyth Hunter's Bestiary 1.5.0

Target: Foundry VTT 13.351 or compatible v13 build.

## GM guide and player guide

1. Open the Guide tab as GM.
2. Confirm the original terse four-step quick guide still appears first.
3. Confirm the detailed GM guide explains player-owned actions, GM-only authority, approvals, evidence credit, hunt flow, and recommended table discussion.
4. Log in as a player and open the Guide tab.
5. Confirm the detailed Player guide is visible and contains no GM secrets or hidden truth controls.

## Player self-service

As a player, verify that personal notes, sightings, trophies/samples, available sources, personal Journal publishing, assigned-hunt viewing, and own-progress export remain usable without a GM operating the player's interface.

## One-use rumor approval

1. Player requests a rumor opportunity.
2. Repeated clicks must not create duplicate unresolved requests.
3. GM sees one request and approves it.
4. Player receives one usable attempt.
5. Use the attempt and confirm the approval becomes unavailable whether the roll succeeds or fails.
6. Confirm another attempt requires a new request and GM decision.

## One-use track approval

Repeat the rumor test for track searching. Confirm a valid quarry or assigned hunt is required.

## Hunt-step approval

1. Create and assign a hunt to the test player.
2. Reach an active player-check step.
3. Player requests one attempt.
4. GM approves it.
5. Player chooses an allowed skill and attempts the step.
6. Confirm the approval is consumed exactly once and an immediate reroll is not available without another GM approval.

## Evidence versus progression

1. Player records a sighting and a trophy/sample.
2. Confirm both records save immediately.
3. With automatic knowledge awards enabled and approval gating enabled, confirm the GM receives separate credit-review requests.
4. Approve one and deny one; verify only the approved evidence changes knowledge.
5. Repeat the same unresolved evidence action and confirm the approval queue does not flood with duplicate active credit requests.
6. Repeat once with no active GM and confirm the evidence still saves while the player receives a warning that progression review could not be queued.

## Share Insight

1. Player A shares an insight about a quarry with Player B.
2. Repeat the same share at the same Player A knowledge stage.
3. Confirm Player B receives progression only once.
4. Advance Player A to a higher knowledge stage and confirm a new meaningful share can award again.

## GM queue UX

- Confirm pending requests appear before approved-but-unused requests.
- Confirm hunt-step requests show the quarry and hunt name.
- Confirm Approve once, Deny, and Revoke are clear and responsive.
- Confirm player dashboards update after GM decisions without manual page refresh or polling.

## Regression and performance

- Search the Bestiary repeatedly while approvals arrive; typing should remain responsive.
- Open and close Record Sighting, Record Trophy/Sample, and Edit Monster; their fast-close behavior must remain unchanged.
- Resize/reposition the dashboard and confirm geometry persistence remains non-blocking.
- Confirm no duplicate Scene Control, Token HUD, or directory launchers appear after rerenders.
- Confirm complementary module content and linked Actors remain available.
