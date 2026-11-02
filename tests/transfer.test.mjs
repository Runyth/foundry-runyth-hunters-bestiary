import test from "node:test";
import assert from "node:assert/strict";
import { mergeProgress } from "../scripts/transfer.mjs";

const record = (points, noteId) => ({
  points,
  notes: [{ id: noteId, text: noteId }],
  sightings: [],
  trophies: [],
  discoveries: [],
  hunts: [],
  manualLevel: null
});

test("merge keeps greater progress and de-duplicates stable records", () => {
  const merged = mergeProgress(
    { booksRead: ["a"], monsters: { beast: record(4, "same") }, fieldLog: [{ id: "log" }] },
    { booksRead: ["a", "b"], monsters: { beast: record(9, "same") }, fieldLog: [{ id: "log" }, { id: "new" }] }
  );
  assert.equal(merged.monsters.beast.points, 9);
  assert.equal(merged.monsters.beast.notes.length, 1);
  assert.deepEqual(merged.booksRead, ["a", "b"]);
  assert.equal(merged.fieldLog.length, 2);
});

test("merge preserves rumor disclosure state and active quarry cycle", () => {
  const merged = mergeProgress(
    { huntCycle: { activeMonsterId: null, lastCompletedMonsterId: "old" }, monsters: { beast: { ...record(4, "a"), rumorsSucceeded: 3, unlockedFields: ["rumor"], legacyDisclosure: false } } },
    { huntCycle: { activeMonsterId: "beast", lastCompletedMonsterId: "new", lastCompletedHuntId: "hunt-new" }, monsters: { beast: { ...record(7, "b"), rumorsSucceeded: 8, unlockedFields: ["name", "habitats"], legacyDisclosure: false } } }
  );
  assert.equal(merged.huntCycle.activeMonsterId, "beast");
  assert.equal(merged.huntCycle.lastCompletedMonsterId, "old");
  assert.equal(merged.monsters.beast.rumorsSucceeded, 8);
  assert.deepEqual(new Set(merged.monsters.beast.unlockedFields), new Set(["rumor", "name", "habitats"]));
});

test("portable settings export contains configuration but excludes world content and transient queues", async () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings: { get: (_module, key) => ({ key }) }
  };
  try {
    const { buildSettingsExport, PORTABLE_SETTING_KEYS } = await import(`../scripts/transfer.mjs?settings=${Date.now()}`);
    const payload = buildSettingsExport();
    assert.equal(payload.format, "hunters-bestiary-settings");
    assert.ok(PORTABLE_SETTING_KEYS.includes("huntRules"));
    assert.ok(PORTABLE_SETTING_KEYS.includes("huntDisplayColors"));
    assert.equal("worldData" in payload.settings, false);
    assert.equal("fieldworkRequests" in payload.settings, false);
  } finally {
    globalThis.game = previousGame;
  }
});
