import test from "node:test";
import assert from "node:assert/strict";
import { recordAttempt } from "../scripts/hunts.mjs";

function settingsStore(initialHunts) {
  const values = new Map([
    ["hunts", structuredClone(initialHunts)],
    ["auditLog", []]
  ]);
  return {
    get: (_module, key) => structuredClone(values.get(key)),
    set: async (_module, key, value) => {
      values.set(key, structuredClone(value));
      return value;
    },
    values
  };
}

test("the same Chat message cannot mutate a hunt twice", async () => {
  const previous = { game: globalThis.game };
  const settings = settingsStore([{
    id: "hunt-1",
    title: "Hunt",
    monsterId: "quarry-1",
    status: "active",
    participantUserIds: [],
    steps: [{ id: "step-1", name: "Trail", dc: 12, skills: ["sur"], status: "active", attempts: [] }],
    currentStep: 0,
    complications: [],
    contributions: []
  }]);
  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings,
    users: { get: () => null }
  };
  try {
    await recordAttempt({
      huntId: "hunt-1",
      stepId: "step-1",
      userId: "player",
      actorName: "Hunter",
      skillId: "sur",
      total: 5,
      dc: 12,
      success: false,
      messageId: "message-1"
    });
    await assert.rejects(() => recordAttempt({
      huntId: "hunt-1",
      stepId: "step-1",
      userId: "player",
      actorName: "Hunter",
      skillId: "sur",
      total: 5,
      dc: 12,
      success: false,
      messageId: "message-1"
    }), /already been applied/);
    const stored = settings.values.get("hunts")[0];
    assert.equal(stored.steps[0].attempts.length, 1);
    assert.equal(stored.contributions.length, 1);
  } finally {
    globalThis.game = previous.game;
  }
});
