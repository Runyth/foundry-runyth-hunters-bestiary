# GM Player-Perspective Mirror

Runyth Hunter's Bestiary 1.6.0 lets a GM open one additional dashboard that is rendered from a selected player's perspective. It is not a separate dashboard design: it uses the same `MainApp`, `templates/main.hbs`, localization dictionaries, data builders, visibility rules, and player permission settings as the ordinary player dashboard.

## Opening the mirror

1. As GM, select exactly one token whose Actor belongs to a non-GM player. The player's assigned Character takes precedence when resolving ambiguous ownership.
2. Open the normal Runyth Hunter's Bestiary dashboard.
3. Press the eye button in the top bar.
4. A second Runyth Hunter's Bestiary window opens. Its body is the same player dashboard the resolved player receives.

The mirror window is reused. Select another player token and press the eye button again to retarget the existing mirror instead of opening unlimited windows.

## What is mirrored

- discovered versus undiscovered monsters;
- exact knowledge levels, points, progress bars, and locked fields;
- player notes, sightings, trophies/samples, discoveries, and hunt history;
- participant-visible hunts and active steps;
- rumor, track, evidence-credit, and hunt-attempt approval states;
- read research books;
- player statistics;
- player-facing guide content;
- player permission settings such as note, sharing, and hunt-attempt availability;
- the selected player token Actor as the active hunter.

GM-only tabs, GM secrets, provider diagnostics, manual knowledge controls, catalogue editing, provisioning controls, and other management surfaces are omitted because the context is built as the player, not as the GM.

## Inspection-only behavior

The window intentionally does not impersonate the player. Search, tab navigation, quarry selection, hunt selection, help, and window controls work normally. State-changing controls remain visually identical to the player's controls but are intercepted if clicked by the GM. This avoids accidental writes performed with GM privileges while preserving a 1:1 visual inspection surface.

Use the normal GM dashboard to approve requests or change world/player state.

## Synchronization

The mirror participates in the same rerender hooks as the normal dashboard. Player progress updates, fieldwork request changes, hunt changes, catalogue changes, system-adapter changes, and imported data refresh an open mirror. No polling or background timer is used.
