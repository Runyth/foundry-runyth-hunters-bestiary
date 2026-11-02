import test from "node:test";
import assert from "node:assert/strict";
import {
  FIELDWORK_TYPES,
  createFieldworkRequest,
  consumeFieldworkRequest,
  getFieldworkRequests,
  resolveFieldworkRequest,
  resetFieldworkStateForTests
} from "../scripts/fieldwork.mjs";

function createHarness() {
  const settings = new Map();
  settings.set("worldData", {
    knowledgeLevels: [
      { level: 0, threshold: 0 },
      { level: 1, threshold: 1 }
    ],
    monsters: [{ id: "wolf" }]
  });
  settings.set("hunts", [{
    id: "hunt-1",
    monsterId: "wolf",
    participantUserIds: ["player"],
    steps: [{ id: "step-1", status: "active" }]
  }]);
  settings.set("fieldworkRequests", []);
  settings.set("autoAwardKnowledge", true);

  const flags = new Map();
  const player = {
    id: "player",
    name: "Player",
    isGM: false,
    getFlag: () => flags.get("progress") ?? { monsters: { wolf: { points: 1 } } },
    setFlag: async (_module, _key, value) => { flags.set("progress", structuredClone(value)); return value; }
  };
  const gm = { id: "gm", name: "GM", isGM: true, getFlag: () => null, setFlag: async () => null };
  const users = new Map([[gm.id, gm], [player.id, player]]);

  globalThis.game = {
    user: gm,
    users,
    settings: {
      get: (_module, key) => structuredClone(settings.get(key)),
      set: async (_module, key, value) => { settings.set(key, structuredClone(value)); return value; }
    }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
  resetFieldworkStateForTests();
  return { settings, flags, player, gm };
}

test("repeatable fieldwork requests coalesce while unresolved and consume once", async () => {
  createHarness();
  const first = await createFieldworkRequest({ userId: "player", type: FIELDWORK_TYPES.RUMOR, monsterId: "wolf" });
  const duplicate = await createFieldworkRequest({ userId: "player", type: FIELDWORK_TYPES.RUMOR, monsterId: "wolf" });
  assert.equal(duplicate.id, first.id);
  assert.equal(getFieldworkRequests().length, 1);

  const approved = await resolveFieldworkRequest(first.id, "approve");
  assert.equal(approved.status, "approved");
  const consumed = await consumeFieldworkRequest(first.id, { userId: "player", type: FIELDWORK_TYPES.RUMOR });
  assert.equal(consumed.status, "consumed");
  await assert.rejects(() => consumeFieldworkRequest(first.id, { userId: "player", type: FIELDWORK_TYPES.RUMOR }), /not available/i);
});

test("hunt attempts require an active assigned step", async () => {
  createHarness();
  const request = await createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.HUNT_ATTEMPT,
    huntId: "hunt-1",
    stepId: "step-1"
  });
  assert.equal(request.huntId, "hunt-1");
  await assert.rejects(() => createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.HUNT_ATTEMPT,
    huntId: "hunt-1",
    stepId: "missing"
  }), /not active/i);
});

test("evidence credit is GM-reviewed and duplicate unresolved evidence is coalesced", async () => {
  const { flags } = createHarness();
  const first = await createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.SIGHTING_CREDIT,
    monsterId: "wolf",
    recordId: "sighting-1",
    detail: "North ridge"
  });
  const second = await createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.SIGHTING_CREDIT,
    monsterId: "wolf",
    recordId: "sighting-2",
    detail: "North ridge again"
  });
  assert.equal(second.id, first.id);
  const resolved = await resolveFieldworkRequest(first.id, "approve");
  assert.equal(resolved.status, "consumed");
  const progress = flags.get("progress");
  assert.equal(progress.monsters.wolf.points, 2);
  assert.match(progress.monsters.wolf.discoveries.at(-1).source, /^sighting-credit:/);
});

test("track requests require a known quarry or assigned hunt", async () => {
  createHarness();
  await assert.rejects(() => createFieldworkRequest({ userId: "player", type: FIELDWORK_TYPES.TRACK }), /known quarry|assigned hunt/i);
  const request = await createFieldworkRequest({ userId: "player", type: FIELDWORK_TYPES.TRACK, monsterId: "wolf" });
  assert.equal(request.monsterId, "wolf");
});


test("track requests reject a quarry that does not match the assigned hunt", async () => {
  const { settings } = createHarness();
  settings.get("worldData").monsters.push({ id: "boar" });
  await assert.rejects(() => createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.TRACK,
    monsterId: "boar",
    huntId: "hunt-1"
  }), /does not match the assigned hunt/i);
});

test("fieldwork mutations emit a local change event after persistence", async () => {
  const previousHooks = globalThis.Hooks;
  const events = [];
  globalThis.Hooks = { callAll: (name, value) => events.push([name, value]) };
  try {
    createHarness();
    globalThis.Hooks = { callAll: (name, value) => events.push([name, value]) };
    await createFieldworkRequest({ userId: "player", type: FIELDWORK_TYPES.RUMOR, monsterId: "wolf" });
    assert.equal(events.length, 1);
    assert.equal(events[0][0], "runyth-hunters-bestiary.fieldworkChanged");
    assert.equal(events[0][1][0].status, "pending");
  } finally {
    globalThis.Hooks = previousHooks;
  }
});

test("GM-approved discovery reveal unlocks the requested field exactly once", async () => {
  const { flags } = createHarness();
  const request = await createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.DISCOVERY_REVEAL,
    monsterId: "wolf",
    recordId: "weaknesses",
    detail: "weaknesses"
  });
  const resolved = await resolveFieldworkRequest(request.id, "approve");
  assert.equal(resolved.status, "consumed");
  const progress = flags.get("progress");
  assert.ok(progress.monsters.wolf.unlockedFields.includes("weaknesses"));
  assert.equal(progress.monsters.wolf.discoveries.filter(entry => entry.field === "weaknesses").length, 1);
  await assert.rejects(() => resolveFieldworkRequest(request.id, "approve"), /pending/i);
});

test("approved Hunt proposals create one participant Hunt with player intent while preserving GM outcome authority", async () => {
  const { settings, flags } = createHarness();
  settings.set("hunts", []);
  const world = settings.get("worldData");
  world.trailTemplates = [{
    id: "trail-standard",
    name: "Standard",
    steps: [{ id: "step-1", name: "Locate", type: "field", dc: 10, skills: ["sur"] }]
  }];
  settings.set("worldData", world);
  settings.set("huntRules", {
    minimumHuntLevel: 1,
    fieldwork: { huntStart: { requireDifficulty: true }, maxDeferredQuarries: 2, maxActiveHunts: 1 }
  });
  flags.set("progress", {
    huntCycle: { activeMonsterId: "wolf", deferredMonsterIds: [], lastCompletedMonsterId: null },
    monsters: {
      wolf: {
        points: 1,
        manualLevel: 1,
        sightings: [], notes: [], trophies: [], discoveries: [], hunts: [],
        unlockedFields: ["difficulty"], fieldworkUnlocks: ["sighting"]
      }
    }
  });

  const request = await createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.HUNT_PROPOSAL,
    monsterId: "wolf",
    detail: "Capture the wolf alive",
    payload: {
      title: "Bring It Back Alive",
      region: "North wood",
      stakes: "Protect the road",
      templateId: "trail-standard",
      plannedOutcome: "captured",
      playerNotes: "Use snares; avoid lethal force."
    }
  });
  assert.equal(request.status, "pending");
  assert.equal(request.payload.plannedOutcome, "captured");

  const approved = await resolveFieldworkRequest(request.id, "approve");
  assert.equal(approved.status, "consumed");
  assert.ok(approved.huntId);
  const hunts = settings.get("hunts");
  assert.equal(hunts.length, 1);
  assert.equal(hunts[0].monsterId, "wolf");
  assert.deepEqual(hunts[0].participantUserIds, ["player"]);
  assert.equal(hunts[0].plannedOutcome, "captured");
  assert.equal(hunts[0].outcome, null);
  assert.equal(hunts[0].visibility, "participants");
});

test("Hunt proposals are rejected until configured danger knowledge is revealed", async () => {
  const { settings, flags } = createHarness();
  settings.set("hunts", []);
  const world = settings.get("worldData");
  world.trailTemplates = [{ id: "trail-standard", name: "Standard", steps: [{ id: "step-1", name: "Locate", type: "field", dc: 10, skills: ["sur"] }] }];
  settings.set("worldData", world);
  settings.set("huntRules", { minimumHuntLevel: 1, fieldwork: { huntStart: { requireDifficulty: true }, maxDeferredQuarries: 2, maxActiveHunts: 1 } });
  flags.set("progress", {
    huntCycle: { activeMonsterId: "wolf", deferredMonsterIds: [], lastCompletedMonsterId: null },
    monsters: { wolf: { points: 1, manualLevel: 1, sightings: [], notes: [], trophies: [], discoveries: [], hunts: [], unlockedFields: [] } }
  });

  await assert.rejects(() => createFieldworkRequest({
    userId: "player",
    type: FIELDWORK_TYPES.HUNT_PROPOSAL,
    monsterId: "wolf",
    payload: { title: "Too Soon", templateId: "trail-standard", plannedOutcome: "observed" }
  }), /requirements.*not yet met/i);
});
