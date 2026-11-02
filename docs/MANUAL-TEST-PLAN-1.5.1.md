# Manual Test Plan — Hunter's Bestiary 1.5.1

Target: Foundry VTT 13.351.

1. Log in as one GM and one player in separate clients.
2. Ensure **Require GM approval for repeatable player fieldwork** is enabled.
3. Player opens Fieldwork and requests one Rumor opportunity. Confirm the player sees the waiting state.
4. Without switching the GM dashboard to the GM tab, confirm the header shows a pending approval indicator.
5. Open the GM Fieldwork tab. Confirm the pending Rumor request is listed and can be approved or denied.
6. Approve it. Confirm the player's dashboard updates to an approved one-use action.
7. Player uses it. Confirm the approval becomes consumed and cannot be reused.
8. Repeat with a Track request.
9. On the GM client, control exactly one token belonging to the player. Confirm Fieldwork shows that player's checks attempted/succeeded, Rumors learned, Tracks found, pending approvals, and recent approval history.
10. Control no token, a GM-owned token, or multiple tokens. Confirm the global approval queue still remains visible and functional.
11. Create requests from two players. Confirm both appear in the world-wide queue independent of token selection.
12. Verify a Track request cannot attach a quarry that differs from the selected assigned hunt.
13. Confirm no duplicate approval rows are created by repeated request clicks while one is unresolved.
14. Confirm normal Bestiary, Hunts, Library, Guide, Actor image, and existing progression workflows remain unchanged.
