import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectControlledPlayerPerspectiveTarget } from "../scripts/fieldwork-view.mjs";

const root = new URL("../", import.meta.url);

test("player perspective resolves exactly one controlled player-owned token", () => {
  const actor = { id: "a1", ownership: { player: 3 } };
  const token = { actor };
  const users = [{ id: "gm", isGM: true }, { id: "player", isGM: false, active: true }];
  assert.equal(selectControlledPlayerPerspectiveTarget([token], users, 3)?.user.id, "player");
  assert.equal(selectControlledPlayerPerspectiveTarget([], users, 3), null);
  assert.equal(selectControlledPlayerPerspectiveTarget([token, token], users, 3), null);
});

test("assigned Character wins when resolving a mirrored player", () => {
  const actor = { id: "a1", uuid: "Actor.a1", ownership: { other: 3 } };
  const users = [
    { id: "assigned", isGM: false, active: false, character: { id: "a1", uuid: "Actor.a1" } },
    { id: "other", isGM: false, active: true }
  ];
  assert.equal(selectControlledPlayerPerspectiveTarget([{ actor }], users, 3)?.user.id, "assigned");
});

test("mirror uses the canonical MainApp player rendering pipeline", async () => {
  const source = await readFile(new URL("scripts/apps/main-app.mjs", root), "utf8");
  assert.match(source, /const viewer = this\.isPlayerPerspective/);
  assert.match(source, /isGM: false/);
  assert.match(source, /getProgress\(viewer\.id\)/);
  assert.match(source, /const providerReports = isGM \?/);
  assert.match(source, /const actorStatuses = isGM \?/);
  assert.match(source, /visibleHuntsFor\(viewer\)/);
  assert.match(source, /getFieldworkRequests\(viewer\)/);
  assert.match(source, /isGM:?[ ,\n]/);
  assert.match(source, /PLAYER_PERSPECTIVE_SAFE_ACTIONS/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /id: PLAYER_PERSPECTIVE_APP_ID/);
  assert.match(source, /app\.render\(\{ force: true \}\)/);
  assert.match(source, /app\.bringToFront/);
});

test("GM dashboard exposes the mirror launcher but the same template contains no mirror-only player markup", async () => {
  const template = await readFile(new URL("templates/main.hbs", root), "utf8");
  assert.match(template, /canOpenPlayerPerspective/);
  assert.match(template, /data-action="openPlayerPerspective"/);
  assert.doesNotMatch(template, /Player Perspective|perspective mirror|inspection-only/i);
});

test("mirror participates in normal rerender propagation", async () => {
  const source = await readFile(new URL("scripts/integrations.mjs", root), "utf8");
  assert.match(source, /hunters-bestiary-player-perspective/);
});

test("public API exposes GM player perspective opening", async () => {
  const source = await readFile(new URL("scripts/api.mjs", root), "utf8");
  assert.match(source, /openPlayerPerspective\(/);
  assert.match(source, /openPlayerPerspectiveDashboard/);
});
