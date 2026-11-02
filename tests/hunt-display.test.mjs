import test from "node:test";
import assert from "node:assert/strict";
import { classifyHuntMonsterState, normalizeHuntDisplayColors, BUILTIN_HUNT_COLOR_PRESETS } from "../scripts/hunt-display.mjs";

const levels = [
  { level: 0, threshold: 0 }, { level: 1, threshold: 1 }, { level: 2, threshold: 3 },
  { level: 3, threshold: 6 }, { level: 4, threshold: 10 }, { level: 5, threshold: 15 }
];

test("hunt monster display state follows selected hunter knowledge and latest outcome", () => {
  assert.equal(classifyHuntMonsterState({}, levels), "none");
  assert.equal(classifyHuntMonsterState({ points: 1 }, levels), "available");
  assert.equal(classifyHuntMonsterState({ points: 3 }, levels), "researched");
  assert.equal(classifyHuntMonsterState({ points: 4, hunts: [{ id: "h", outcome: "captured", updatedAt: "2026-01-01" }] }, levels), "captured");
  assert.equal(classifyHuntMonsterState({ points: 4, hunts: [{ id: "h", outcome: "slain", updatedAt: "2026-01-01" }] }, levels), "slain");
  assert.equal(classifyHuntMonsterState({ points: 4, hunts: [{ id: "h", outcome: "captured", updatedAt: "2026-01-01" }, { id: "h2", outcome: "escaped", updatedAt: "2026-02-01" }] }, levels), "escaped");
});

test("hunt color settings provide built-in presets and normalize custom presets", () => {
  const config = normalizeHuntDisplayColors({ activePreset: "classic", colors: {}, customPresets: { MyPreset: { escaped: "#123456" } } });
  assert.equal(config.activePreset, "classic");
  assert.equal(config.colors.escaped, BUILTIN_HUNT_COLOR_PRESETS.classic.escaped);
  assert.equal(config.customPresets.MyPreset.escaped, "#123456");
});
