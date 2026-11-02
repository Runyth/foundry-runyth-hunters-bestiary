# Hunter's Bestiary 1.7.0 — Manual Foundry Acceptance

Target: Foundry VTT 13.351 in a multiplayer world.

1. Open Hunt Rules as GM. Select a quarry pool containing at least three monsters.
2. Set global minimum hunt knowledge to 2 and override one monster to 4.
3. Configure name to require five successful rumors and weaknesses to require forty rumors, Mastered knowledge and GM approval.
4. As a fresh player, successfully resolve the first approved rumor. Confirm an unknown Bestiary entry appears without name, tier, strengths/weaknesses or other hidden metadata.
5. Continue approved rumors. Confirm the same quarry remains current until its hunt ends.
6. Confirm no hunt can be activated for a participant below the configured quarry knowledge requirement.
7. Confirm eligible disclosure rolls reveal only the fields whose thresholds/chance succeed; GM-gated reveals appear in the approval queue.
8. Approve one gated reveal and confirm only that field becomes visible.
9. Reach the hunt conclusion. Confirm the player chooses a desired outcome; the hunt creator never predetermined it.
10. Test an automatic outcome, a Check + GM outcome and a GM-only outcome.
11. For a capture request, record a different actual outcome and confirm the Bestiary history uses the actual result.
12. Resolve one hunt terminally and confirm the next successful rumor selects a new quarry, avoiding the just-completed one when possible.
13. Resolve another hunt as `escaped` and confirm the same quarry remains active for a re-hunt.
14. Export player progress, import/merge it, and confirm rumor counts, revealed fields and quarry-cycle state remain intact.
15. Open the GM player-perspective mirror and verify hidden/revealed fields exactly match the real player dashboard.
16. Search a large quarry pool and override list; confirm filtering stays responsive and there is no whole-dashboard render storm.
