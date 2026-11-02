import test from "node:test";
import assert from "node:assert/strict";

async function createApi({ isGM, progress }) {
  const previous = { foundry: globalThis.foundry, game: globalThis.game };
  class MockApplicationV2 {}
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2: MockApplicationV2, HandlebarsApplicationMixin: Base => Base, DialogV2: class {} },
      instances: new Map()
    },
    utils: { deepClone: structuredClone }
  };
  const world = {
    knowledgeLevels: [
      { level: 0, threshold: 0 },
      { level: 1, threshold: 1 },
      { level: 2, threshold: 3 },
      { level: 3, threshold: 6 },
      { level: 4, threshold: 10 },
      { level: 5, threshold: 15 }
    ],
    monsters: [{
      id: "quarry",
      name: { en: "Quarry", de: "Beute" },
      tier: 1,
      summary: { en: "Known summary", de: "Bekannte Zusammenfassung" },
      rumor: { en: "Rumor", de: "Gerücht" },
      habitats: ["forest"],
      signs: ["tracks"],
      ecology: { en: "Ecology", de: "Ökologie" },
      gmSecrets: { en: "Secret", de: "Geheimnis" },
      actorSource: { mode: "data", data: { hidden: true } },
      actorUuid: "Actor.secret"
    }]
  };
  const user = { id: "player", isGM, getFlag: () => progress };
  globalThis.game = {
    user,
    i18n: { localize: key => ({ "HB.Difficulty.Tier.1": "Low Threat" }[key] ?? key) },
    settings: { get: (_module, key) => key === "worldData" ? world : [] },
    modules: new Map([["runyth-hunters-bestiary", { version: "1.8.0" }]])
  };
  const { HuntersBestiaryAPI } = await import(`../scripts/api.mjs?permissions=${Date.now()}-${isGM}`);
  return { api: new HuntersBestiaryAPI(), previous };
}

test("player API catalogue is knowledge-gated and never returns GM secrets", async () => {
  const progress = { monsters: { quarry: { points: 3, sightings: [], notes: [], trophies: [], discoveries: [], hunts: [], manualLevel: null } } };
  const { api, previous } = await createApi({ isGM: false, progress });
  try {
    const monster = api.getMonster("quarry");
    assert.equal(monster.id, "quarry");
    assert.equal(monster.knowledgeLevel, 2);
    assert.ok(monster.habitats);
    assert.equal(monster.tier, undefined);
    assert.equal(monster.difficultyLabel, "Low Threat");
    assert.equal(monster.ecology, undefined);
    assert.equal(monster.gmSecrets, undefined);
    assert.equal(monster.actorSource, undefined);
    assert.equal(monster.actorUuid, undefined);
  } finally {
    globalThis.foundry = previous.foundry;
    globalThis.game = previous.game;
  }
});

test("GM API catalogue retains complete records", async () => {
  const { api, previous } = await createApi({ isGM: true, progress: {} });
  try {
    const monster = api.getMonster("quarry");
    assert.ok(monster.gmSecrets);
    assert.ok(monster.actorSource);
  } finally {
    globalThis.foundry = previous.foundry;
    globalThis.game = previous.game;
  }
});
