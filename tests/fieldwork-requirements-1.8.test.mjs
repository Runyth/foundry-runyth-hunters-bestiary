// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  defaultHuntRules,
  normalizeHuntRules,
  fieldworkProgressStatus,
  rollFieldworkOpportunity,
  difficultyTierFor,
  difficultyBandFor,
  chooseQuarryMonsterId
} from "../scripts/hunt-rules.mjs";
import { normalizeProgress, deferActiveQuarry, activateDeferredQuarry } from "../scripts/state.mjs";

const monsters = ["alpha", "beta", "gamma"];
const levels = [{ level: 0, threshold: 0 }, { level: 1, threshold: 1 }, { level: 2, threshold: 3 }, { level: 3, threshold: 8 }, { level: 4, threshold: 15 }, { level: 5, threshold: 25 }];

test("default fieldwork progression is staged and Hunt start requires known danger", () => {
  const rules = defaultHuntRules(monsters);
  assert.equal(rules.fieldwork.trackSearch.minRumors, 3);
  assert.equal(rules.fieldwork.sighting.minSuccessfulTracks, 5);
  assert.equal(rules.fieldwork.difficulty.minSightings, 3);
  assert.equal(rules.fieldwork.huntStart.requireDifficulty, true);
  assert.equal(rules.fieldwork.maxDeferredQuarries, 2);
  assert.equal(rules.fieldwork.maxActiveHunts, 1);
  const status = fieldworkProgressStatus({ record: { rumorsSucceeded: 2 }, level: 5, rules, monsterId: "alpha", monsterIds: monsters });
  assert.equal(status.canSearchTracks, false);
  assert.equal(status.canRecordSighting, false);
  assert.equal(status.canStartHunt, false);
});

test("global and per-monster fieldwork requirements normalize independently", () => {
  const rules = normalizeHuntRules({
    fieldwork: { trackSearch: { minRumors: 4 }, sighting: { minSuccessfulTracks: 7, chance: 50 }, difficulty: { minSightings: 6, chance: 25 }, huntStart: { requireDifficulty: true }, maxDeferredQuarries: 3, maxActiveHunts: 2 },
    monsterOverrides: { alpha: { difficultyTier: 4, fieldwork: { trackSearch: { minRumors: 1 }, sighting: { chance: 90 }, difficulty: { gmApproval: true }, huntStart: { requireDifficulty: false } } } }
  }, monsters);
  const alpha = fieldworkProgressStatus({ record: { rumorsSucceeded: 1 }, level: 0, rules, monsterId: "alpha", monsterIds: monsters });
  const beta = fieldworkProgressStatus({ record: { rumorsSucceeded: 1 }, level: 0, rules, monsterId: "beta", monsterIds: monsters });
  assert.equal(alpha.trackMinRumors, 1);
  assert.equal(alpha.sightingChance, 90);
  assert.equal(alpha.difficultyGmApproval, true);
  assert.equal(alpha.requiresDifficulty, false);
  assert.equal(beta.trackMinRumors, 4);
  assert.equal(beta.sightingChance, 50);
  assert.equal(rules.fieldwork.maxDeferredQuarries, 3);
  assert.equal(difficultyTierFor(rules, "alpha", { tier: 1 }, monsters), 4);
});

test("sighting and danger rolls begin only after the configured threshold", () => {
  const rules = defaultHuntRules(monsters);
  let result = rollFieldworkOpportunity({ kind: "sighting", record: { tracksSucceeded: 5 }, rules, monsterId: "alpha", monsterIds: monsters, rng: () => 0 });
  assert.equal(result.eligible, false);
  result = rollFieldworkOpportunity({ kind: "sighting", record: { tracksSucceeded: 6 }, rules, monsterId: "alpha", monsterIds: monsters, rng: () => 0 });
  assert.equal(result.eligible, true);
  assert.equal(result.success, true);
  result = rollFieldworkOpportunity({ kind: "difficulty", record: { sightings: [{}, {}, {}] }, rules, monsterId: "alpha", monsterIds: monsters, rng: () => 0 });
  assert.equal(result.eligible, false);
  result = rollFieldworkOpportunity({ kind: "difficulty", record: { sightings: [{}, {}, {}, {}] }, rules, monsterId: "alpha", monsterIds: monsters, rng: () => 0 });
  assert.equal(result.eligible, true);
  assert.equal(result.success, true);
});

test("probability zero and one hundred are deterministic at the boundary", () => {
  const noChance = normalizeHuntRules({ fieldwork: { sighting: { minSuccessfulTracks: 0, chance: 0 } } }, monsters);
  assert.equal(rollFieldworkOpportunity({ kind: "sighting", record: { tracksSucceeded: 1 }, rules: noChance, monsterId: "alpha", monsterIds: monsters, rng: () => 0 }).success, false);
  const fullChance = normalizeHuntRules({ fieldwork: { sighting: { minSuccessfulTracks: 0, chance: 100 } } }, monsters);
  assert.equal(rollFieldworkOpportunity({ kind: "sighting", record: { tracksSucceeded: 1 }, rules: fullChance, monsterId: "alpha", monsterIds: monsters, rng: () => .999 }).success, true);
});

test("legacy progress remains playable and legacy track totals are backfilled", () => {
  const progress = normalizeProgress({
    monsters: { alpha: { points: 10 } },
    fieldLog: [{ type: "knowledge", source: "track", monsterId: "alpha" }, { type: "knowledge", source: "track", monsterId: "alpha" }]
  });
  assert.equal(progress.monsters.alpha.tracksSucceeded, 2);
  assert.equal(progress.monsters.alpha.legacyDisclosure, true);
  const rules = defaultHuntRules(monsters);
  const status = fieldworkProgressStatus({ record: progress.monsters.alpha, level: 3, rules, monsterId: "alpha", monsterIds: monsters });
  assert.equal(status.canRecordSighting, true);
  assert.equal(status.difficultyKnown, true);
});

test("difficulty bands are absolute five-tier labels with configurable custom names", () => {
  const rules = normalizeHuntRules({ difficultyBands: { "4": { customLabel: "Predatory Catastrophe" } } }, monsters);
  const band = difficultyBandFor(rules, "alpha", { tier: 4 }, monsters);
  assert.deepEqual(band, { tier: 4, customLabel: "Predatory Catastrophe", localizationKey: "HB.Difficulty.Tier.4" });
});

test("quarry selection excludes deferred monsters", () => {
  const rules = normalizeHuntRules({ quarryPool: monsters, avoidImmediateRepeat: false }, monsters);
  const pick = chooseQuarryMonsterId({ rules, monsterIds: monsters, excludedMonsterIds: ["alpha", "beta"], rng: () => 0 });
  assert.equal(pick, "gamma");
});

test("defer and reactivate maintain one active quarry and bounded queue", async () => {
  const previous = globalThis.game;
  let flags = normalizeProgress({ huntCycle: { activeMonsterId: "alpha", deferredMonsterIds: ["beta"] } });
  const player = { id: "p", getFlag: () => structuredClone(flags), setFlag: async (_m, _k, value) => { flags = structuredClone(value); return value; } };
  globalThis.game = { user: { id: "gm", isGM: true }, users: { get: id => id === "p" ? player : null } };
  try {
    await deferActiveQuarry("p", "alpha", { maxDeferred: 2 });
    assert.equal(flags.huntCycle.activeMonsterId, null);
    assert.deepEqual(flags.huntCycle.deferredMonsterIds, ["beta", "alpha"]);
    await activateDeferredQuarry("p", "beta", { maxDeferred: 2 });
    assert.equal(flags.huntCycle.activeMonsterId, "beta");
    assert.deepEqual(flags.huntCycle.deferredMonsterIds, ["alpha"]);
    flags.huntCycle.activeMonsterId = "gamma";
    await activateDeferredQuarry("p", "alpha", { maxDeferred: 2 });
    assert.equal(flags.huntCycle.activeMonsterId, "alpha");
    assert.deepEqual(flags.huntCycle.deferredMonsterIds, ["gamma"]);
  } finally { globalThis.game = previous; }
});

test("Hunt editor uses a lazy capped result list instead of pre-rendering all monster options", async () => {
  const [source, template, css] = await Promise.all([
    readFile(new URL("../scripts/apps/hunt-editor.mjs", import.meta.url), "utf8"),
    readFile(new URL("../templates/hunt-editor.hbs", import.meta.url), "utf8"),
    readFile(new URL("../styles/runyth-hunters-bestiary.css", import.meta.url), "utf8")
  ]);
  assert.match(source, /choices\.slice\(0, 80\)/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(template, /data-hb-fast-select/);
  assert.doesNotMatch(template, /<select name="monsterId" class="hb-hunt-monster-select"/);
  assert.match(css, /\.hb-fast-select-results/);
  assert.match(css, /contain: content/);
});
