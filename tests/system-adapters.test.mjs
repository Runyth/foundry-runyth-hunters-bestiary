import test from "node:test";
import assert from "node:assert/strict";
import {
  registerSystemAdapter,
  unregisterSystemAdapter,
  getSystemAdapters,
  getActiveSystemAdapterDescriptor,
  systemActorAvailability,
  buildSystemActorData,
  rollFieldCheckWithSystemAdapter
} from "../scripts/system-adapters.mjs";
import { actorProvisioningStatus } from "../scripts/actors.mjs";

function installGame(systemId = "dnd5e") {
  globalThis.game = { system: { id: systemId }, i18n: { lang: "en" } };
}

test("system adapters require a system and a real capability", () => {
  assert.throws(() => registerSystemAdapter("empty", { systemId: "dnd5e" }), /capability/);
  assert.throws(() => registerSystemAdapter("missing-system", { buildActorData: () => ({}) }), /systemId/);
});

test("active system adapters provide Actors for system-neutral monsters", async () => {
  installGame();
  registerSystemAdapter("dnd5e-reference", {
    systemId: "dnd5e",
    primary: true,
    supportsMonster: monster => monster.id === "ashback-troll",
    buildActorData: ({ monster }) => ({ name: monster.name.en, type: "npc", system: {} })
  });
  try {
    const monster = {
      id: "ashback-troll",
      name: { en: "Ashback Troll", de: "Aschrückentroll" },
      actorSource: { mode: "none", reason: "The core catalogue is intentionally system neutral." }
    };
    const status = actorProvisioningStatus(monster, { systemId: "dnd5e" });
    assert.equal(status.available, true);
    assert.equal(status.sourceMode, "system-adapter");
    const data = await buildSystemActorData(monster);
    assert.equal(data.type, "npc");
  } finally {
    unregisterSystemAdapter("dnd5e-reference");
  }
});

test("field checks are delegated and normalized", async () => {
  installGame();
  registerSystemAdapter("dnd5e-checks", {
    systemId: "dnd5e",
    rollFieldCheck: async ({ modifier }) => ({ roll: { total: 17 }, modifier, skillLabel: "Survival" })
  });
  try {
    const result = await rollFieldCheckWithSystemAdapter({ modifier: 5 });
    assert.equal(result.total, 17);
    assert.equal(result.modifier, 5);
    assert.equal(result.adapterId, "dnd5e-checks");
    assert.equal(getActiveSystemAdapterDescriptor().systemId, "dnd5e");
    assert.equal(getSystemAdapters().length, 1);
  } finally {
    unregisterSystemAdapter("dnd5e-checks");
  }
});

test("adapters for other systems remain inactive", () => {
  installGame("pf2e");
  registerSystemAdapter("dnd5e-only", { systemId: "dnd5e", buildActorData: () => ({ type: "npc" }) });
  try {
    assert.equal(systemActorAvailability({ id: "x" }, { systemId: "pf2e" }), null);
  } finally {
    unregisterSystemAdapter("dnd5e-only");
  }
});
