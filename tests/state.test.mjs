// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { applyHuntProgress, awardKnowledge, knowledgeLevel, normalizeProgress } from "../scripts/state.mjs";

const levels = [
  { level: 0, threshold: 0 },
  { level: 1, threshold: 1 },
  { level: 2, threshold: 3 },
  { level: 3, threshold: 6 },
  { level: 4, threshold: 10 },
  { level: 5, threshold: 15 }
];

test("knowledge thresholds and manual overrides are deterministic", () => {
  assert.equal(knowledgeLevel(0, levels), 0);
  assert.equal(knowledgeLevel(1, levels), 1);
  assert.equal(knowledgeLevel(5, levels), 2);
  assert.equal(knowledgeLevel(15, levels), 5);
  assert.equal(knowledgeLevel(0, levels, 4), 4);
  assert.equal(knowledgeLevel(999, levels, 1), 1);
});

test("progress normalization bounds values and de-duplicates books", () => {
  const progress = normalizeProgress({
    booksRead: ["one", "one", "two"],
    monsters: { beast: { points: -10, manualLevel: 99 } },
    statistics: { checksAttempted: 3 }
  });
  assert.deepEqual(progress.booksRead, ["one", "two"]);
  assert.equal(progress.monsters.beast.points, 0);
  assert.equal(progress.monsters.beast.manualLevel, 5);
  assert.equal(progress.statistics.checksAttempted, 3);
  assert.equal(progress.statistics.checksSucceeded, 0);
});


test("hunt progress is recorded and resolved idempotently", () => {
  const joined = applyHuntProgress(normalizeProgress({}), {
    id: "hunt-one",
    monsterId: "ashback-troll",
    title: "Smoke in the Coppice",
    status: "active",
    outcome: null
  });
  assert.equal(joined.statistics.huntsJoined, 1);
  assert.equal(joined.statistics.huntsResolved, 0);
  assert.equal(joined.monsters["ashback-troll"].hunts.length, 1);

  const resolved = applyHuntProgress(joined, {
    id: "hunt-one",
    monsterId: "ashback-troll",
    title: "Smoke in the Coppice",
    status: "resolved",
    outcome: "relocated"
  });
  assert.equal(resolved.statistics.huntsJoined, 1);
  assert.equal(resolved.statistics.huntsResolved, 1);
  assert.equal(resolved.monsters["ashback-troll"].hunts[0].outcome, "relocated");

  const repeated = applyHuntProgress(resolved, {
    id: "hunt-one",
    monsterId: "ashback-troll",
    title: "Smoke in the Coppice",
    status: "resolved",
    outcome: "observed"
  });
  assert.equal(repeated.statistics.huntsJoined, 1);
  assert.equal(repeated.statistics.huntsResolved, 1);
  assert.equal(repeated.monsters["ashback-troll"].hunts.length, 1);
  assert.equal(repeated.monsters["ashback-troll"].hunts[0].outcome, "observed");
});


test("same-user progress mutations serialize while different users can proceed independently", async () => {
  const previousGame = globalThis.game;
  const flags = new Map([["u1", normalizeProgress({})], ["u2", normalizeProgress({})]]);
  let active = 0;
  let peak = 0;
  const users = new Map(["u1", "u2"].map(id => [id, {
    id,
    getFlag: () => flags.get(id),
    async setFlag(_moduleId, _key, value) {
      active += 1; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 3));
      flags.set(id, structuredClone(value));
      active -= 1;
    }
  }]));
  globalThis.game = { user: { isGM: true }, users: { get: id => users.get(id), contents: [...users.values()] } };
  try {
    await Promise.all([
      awardKnowledge("u1", "beast", 1, "test"),
      awardKnowledge("u1", "beast", 1, "test"),
      awardKnowledge("u2", "beast", 1, "test")
    ]);
    assert.equal(flags.get("u1").monsters.beast.points, 2);
    assert.equal(flags.get("u2").monsters.beast.points, 1);
    assert.ok(peak >= 2, "different users should not share one global write queue");
  } finally { globalThis.game = previousGame; }
});

test("fresh monster progress uses explicit disclosure while legacy records preserve prior visibility", () => {
  const fresh = normalizeProgress({ monsters: { fresh: { points: 1, unlockedFields: ["rumor"] } } });
  const legacy = normalizeProgress({ monsters: { legacy: { points: 6 } } });
  assert.equal(fresh.monsters.fresh.legacyDisclosure, false);
  assert.deepEqual(fresh.monsters.fresh.unlockedFields, ["rumor"]);
  assert.equal(legacy.monsters.legacy.legacyDisclosure, true);
});

test("terminal hunts clear the rumor quarry while escaped hunts keep it active", () => {
  const base = normalizeProgress({ huntCycle: { activeMonsterId: "beast" } });
  const resolved = applyHuntProgress(base, { id: "resolved", monsterId: "beast", title: "Resolved", status: "resolved", outcome: "captured" });
  assert.equal(resolved.huntCycle.activeMonsterId, null);
  assert.equal(resolved.huntCycle.lastCompletedMonsterId, "beast");
  assert.equal(resolved.huntCycle.lastCompletedHuntId, "resolved");

  const escaped = applyHuntProgress(normalizeProgress({ huntCycle: { activeMonsterId: "beast" } }), { id: "escaped", monsterId: "beast", title: "Escaped", status: "failed", outcome: "escaped" });
  assert.equal(escaped.huntCycle.activeMonsterId, "beast");
  assert.equal(escaped.huntCycle.lastCompletedMonsterId, null);
});
