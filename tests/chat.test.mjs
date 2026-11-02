import test from "node:test";
import assert from "node:assert/strict";
import { performFieldCheck } from "../scripts/rolls.mjs";

test("one field-check action creates exactly one Chat card", async () => {
  const previous = { game: globalThis.game, Roll: globalThis.Roll, ChatMessage: globalThis.ChatMessage, CONFIG: globalThis.CONFIG, Hooks: globalThis.Hooks };
  let created = 0;
  class MockRoll {
    constructor() { this.total = 15; }
    async evaluate() { return this; }
  }
  globalThis.game = {
    system: { id: "test" },
    user: { id: "player" },
    users: { contents: [{ id: "gm", isGM: true }] },
    settings: { get: (_module, key) => key === "rollMode" ? "publicroll" : "1d20 + @mod" },
    i18n: { localize: key => key, has: () => false }
  };
  globalThis.Roll = MockRoll;
  globalThis.CONFIG = {};
  globalThis.Hooks = { callAll: () => undefined };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ alias: "Hunter" }),
    async create(data) {
      created += 1;
      assert.equal(data.flags["hunters-bestiary"].actorUuid, "Actor.hunter");
      return { id: "message-1" };
    }
  };
  const actor = { id: "hunter", uuid: "Actor.hunter", name: "Hunter", system: { skills: { sur: { mod: 5 } } } };
  try {
    const result = await performFieldCheck({ actor, skillId: "sur", dc: 12, label: "Track" });
    assert.equal(result.messageId, "message-1");
    assert.equal(created, 1);
  } finally {
    Object.assign(globalThis, previous);
  }
});
