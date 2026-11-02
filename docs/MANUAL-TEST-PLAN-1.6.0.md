# Manual test plan — 1.6.0

1. Log in as a GM and a player in separate browsers.
2. Give the player a Character and vary its Hunter's Bestiary progress.
3. On the GM client select exactly that player's token and open the normal dashboard.
4. Press the eye button; confirm a second dashboard opens.
5. Compare all tabs side-by-side with the player's dashboard: monster list, knowledge gates, points, notes, evidence, hunts, fieldwork approvals, library state, statistics, and player guide must match.
6. Confirm the mirror has no GM tab, GM secrets, catalogue controls, provider reports, approval inbox, image editing, Actor provisioning, or manual knowledge controls.
7. Confirm the selected token Actor is shown as Active Hunter.
8. Change the player's progress and fieldwork requests; confirm the mirror refreshes without reopening.
9. Navigate/search inside the mirror; confirm these work.
10. Click a state-changing player control in the mirror; confirm no state changes and an inspection-only notification appears.
11. Select a different player's token and press the GM eye button; confirm the same mirror window retargets rather than creating a third dashboard.
12. Close/reopen the mirror and confirm its geometry persists independently from the normal dashboard.
