# Actor and prototype-token images

## Pre-packed source images

Each monster record may define an `img` path. The same path is used by the Hunter’s Bestiary dashboard, generated Actor portrait, and prototype-token texture.

1. Add a WebP, PNG, JPEG, or SVG file below `assets/actors/`.
2. Set the monster record’s `img` field to `modules/runyth-hunters-bestiary/assets/actors/<file>`.
3. Run `npm test`, `npm run check`, and `npm run build`.

Complementary modules follow the same rule in their own data files and asset directories. Use stable monster IDs for filenames, for example `assets/actors/ashback-troll.webp`.

## Changing an image in an installed world

A GM can click the selected monster portrait in the dashboard. Foundry’s standard FilePicker opens, including its normal upload control when the user has upload permission. Selecting a file stores a world-level override and immediately synchronizes any linked Actor portrait and prototype token.

The **Restore packaged image** action removes only the world override. It does not delete uploaded files. Overrides survive provider refreshes and module updates because they are stored separately from provider content.
