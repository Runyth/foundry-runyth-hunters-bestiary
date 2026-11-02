import test from "node:test";
import assert from "node:assert/strict";

test("GM API unlinks only the expected managed Actor UUID", async () => {
  const previous = { game: globalThis.game, Hooks: globalThis.Hooks, foundry: globalThis.foundry };
  const settings = new Map([
    ["worldData", { monsters: [{ id: "quarry", actorUuid: "Actor.expected" }] }],
    ["auditLog", []]
  ]);
  globalThis.foundry = { utils: { deepClone: structuredClone }, applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base }, instances: new Map() } };
  globalThis.Hooks = { callAll: () => undefined };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings: {
      get: (_module, key) => settings.get(key),
      set: async (_module, key, value) => { settings.set(key, value); return value; }
    },
    modules: new Map([["hunters-bestiary", { version: "1.4.2" }]])
  };
  try {
    const { HuntersBestiaryAPI } = await import(`../scripts/api.mjs?unlink=${Date.now()}`);
    const api = new HuntersBestiaryAPI();
    const mismatch = await api.unlinkActor("quarry", { actorUuid: "Actor.other" });
    assert.equal(mismatch.unlinked, false);
    assert.equal(settings.get("worldData").monsters[0].actorUuid, "Actor.expected");
    const result = await api.unlinkActor("quarry", { actorUuid: "Actor.expected" });
    assert.equal(result.unlinked, true);
    assert.equal(settings.get("worldData").monsters[0].actorUuid, undefined);
  } finally {
    globalThis.game = previous.game;
    globalThis.Hooks = previous.Hooks;
    globalThis.foundry = previous.foundry;
  }
});
