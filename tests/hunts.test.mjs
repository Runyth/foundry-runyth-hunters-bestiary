// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { createHuntFromTemplate, normalizeHunt } from "../scripts/hunts.mjs";

globalThis.game = { user: { id: "gm" } };

const template = {
  id: "test-trail",
  steps: [
    { id: "one", name: { en: "One", de: "Eins" }, dc: 10, skills: ["sur"] },
    { id: "two", name: { en: "Two", de: "Zwei" }, dc: 12, skills: ["nat"] }
  ]
};

test("template hunts start active and unlock steps sequentially", () => {
  const hunt = createHuntFromTemplate({
    title: "Test Hunt",
    monsterId: "beast",
    region: "Fen",
    participantUserIds: ["player", "player"],
    template
  });
  assert.equal(hunt.status, "active");
  assert.deepEqual(hunt.participantUserIds, ["player"]);
  assert.equal(hunt.steps[0].status, "active");
  assert.equal(hunt.steps[1].status, "locked");
});

test("hunt normalization bounds unsafe values", () => {
  const hunt = normalizeHunt({ title: "X", currentStep: 999, steps: template.steps, status: "invalid" });
  assert.equal(hunt.currentStep, 1);
  assert.equal(hunt.status, "draft");
});

test("player desired outcome can differ from GM actual outcome and escaped quarry remains active", async () => {
  const previousGame = globalThis.game;
  const previousFoundry = globalThis.foundry;
  const settings = new Map([
    ["worldData", { knowledgeLevels: [{ level: 0, threshold: 0 }, { level: 1, threshold: 1 }, { level: 2, threshold: 3 }], monsters: [{ id: "wolf" }] }],
    ["huntRules", { version: 1, minimumHuntLevel: 2, quarryPool: ["wolf"], avoidImmediateRepeat: true }],
    ["hunts", [{ id: "hunt-final", title: "Bring It Back", monsterId: "wolf", status: "active", participantUserIds: ["player"], steps: [{ id: "resolve", name: "Resolve", kind: "conclusion", status: "active", dc: 0, skills: [] }], resolution: { status: "awaiting-choice" } }]],
    ["auditLog", []]
  ]);
  let progress = {
    monsters: { wolf: { points: 3, rumorsSucceeded: 5, unlockedFields: ["rumor"], legacyDisclosure: false } },
    huntCycle: { activeMonsterId: "wolf", lastCompletedMonsterId: null, lastCompletedHuntId: null }
  };
  const gm = { id: "gm", name: "GM", isGM: true, getFlag: () => null, setFlag: async () => null };
  const player = {
    id: "player", name: "Player", isGM: false,
    getFlag: () => structuredClone(progress),
    setFlag: async (_module, _key, value) => { progress = structuredClone(value); return value; }
  };
  const users = new Map([[gm.id, gm], [player.id, player]]);
  globalThis.game = {
    user: gm,
    users,
    settings: {
      get: (_module, key) => structuredClone(settings.get(key)),
      set: async (_module, key, value) => { settings.set(key, structuredClone(value)); return value; }
    }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "test-id" } };
  try {
    const { requestHuntResolution, decideHuntResolution } = await import(`../scripts/hunts.mjs?resolution=${Date.now()}`);
    const requested = await requestHuntResolution({ huntId: "hunt-final", userId: "player", outcome: "captured" });
    assert.equal(requested.hunt.resolution.status, "pending-gm");
    assert.equal(requested.hunt.resolution.requestedOutcome, "captured");
    assert.equal(requested.hunt.outcome, null);

    const decided = await decideHuntResolution("hunt-final", "escaped", "It broke the net and fled.");
    assert.equal(decided.status, "failed");
    assert.equal(decided.outcome, "escaped");
    assert.equal(decided.resolution.requestedOutcome, "captured");
    assert.equal(progress.huntCycle.activeMonsterId, "wolf");
    assert.equal(progress.monsters.wolf.hunts.at(-1).outcome, "escaped");
  } finally {
    globalThis.game = previousGame;
    globalThis.foundry = previousFoundry;
  }
});
