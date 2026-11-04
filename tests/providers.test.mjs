// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ProviderContentValidationError,
  normalizeProviderRegistration,
  evaluateMonsterCompleteness,
  validateActorSource
} from "../scripts/providers.mjs";
import { actorProvisioningStatus, registerActorAdapter, unregisterActorAdapter } from "../scripts/actors.mjs";

function monster() {
  return {
    id: "marsh-hound",
    name: { en: "Marsh Hound", de: "Sumpfhund" },
    type: "beast",
    tier: 2,
    tags: ["marsh"],
    habitats: [{ en: "Reed marshes", de: "Schilfsümpfe" }],
    summary: { en: "A patient pack hunter.", de: "Ein geduldiger Rudeljäger." },
    rumor: { en: "It follows patrol bells.", de: "Er folgt Patrouillenglocken." },
    signs: [
      { en: "Webbed tracks", de: "Schwimmhäutige Abdrücke" },
      { en: "Twisted reed beds", de: "Verdrehte Schilfbetten" }
    ],
    ecology: { en: "It controls rat populations.", de: "Er begrenzt Rattenpopulationen." },
    behavior: { en: "It circles before attacking.", de: "Er kreist vor dem Angriff." },
    defenses: { en: "Dense waterproof coat.", de: "Dichtes wasserfestes Fell." },
    weaknesses: { en: "Strong smoke scents.", de: "Starke Rauchgerüche." },
    harvest: { en: "Oil-rich hide.", de: "Ölreiche Haut." },
    gmSecrets: { en: "Trained by smugglers.", de: "Von Schmugglern abgerichtet." },
    preferredSkills: ["sur", "ani"]
  };
}

function completeBundle() {
  return {
    monster: monster(),
    actor: {
      mode: "none",
      reason: "This investigation-only quarry intentionally has no combat statistics."
    },
    rumors: [{
      id: "marsh-hound-bells",
      text: { en: "Bells draw it near.", de: "Glocken locken ihn an." },
      truth: "true",
      regions: ["marsh"],
      weight: 1
    }],
    tracks: [{
      id: "marsh-hound-webbed-print",
      name: { en: "Webbed print", de: "Schwimmhäutiger Abdruck" },
      description: { en: "A broad canine print.", de: "Ein breiter hundeartiger Abdruck." },
      baseDc: 12,
      freshnessHours: [1, 6, 24],
      tags: ["marsh"]
    }],
    books: [{
      id: "marsh-hound-notes",
      name: { en: "Notes on Marsh Hounds", de: "Notizen zu Sumpfhunden" },
      author: { en: "Warden Pell", de: "Wächter Pell" },
      tier: 1,
      tags: ["marsh"],
      summary: { en: "Field observations.", de: "Feldbeobachtungen." },
      unlock: { points: 1, tags: ["marsh"] },
      chapters: [{
        title: { en: "Bell Response", de: "Reaktion auf Glocken" },
        body: { en: "They investigate repeated bells.", de: "Sie untersuchen wiederholte Glockenschläge." }
      }]
    }],
    trailTemplates: [{
      id: "marsh-hound-trail",
      name: { en: "Marsh Hound Trail", de: "Sumpfhundfährte" },
      tags: ["marsh"],
      steps: [{
        id: "conclusion",
        name: { en: "Resolve", de: "Beenden" },
        kind: "conclusion",
        dc: 0,
        skills: [],
        success: { en: "Resolve the hunt.", de: "Beendet die Jagd." },
        failure: { en: "The hunt continues.", de: "Die Jagd geht weiter." }
      }]
    }],
    complications: [{
      id: "marsh-hound-flood",
      en: "Floodwater erases the trail.",
      de: "Hochwasser verwischt die Fährte."
    }]
  };
}

test("complete monster bundles are flattened and linked", () => {
  const result = normalizeProviderRegistration("Example Beasts", { monsterBundles: [completeBundle()] });
  assert.equal(result.complete, true);
  assert.equal(result.providerId, "example-beasts");
  assert.equal(result.content.monsters.length, 1);
  assert.deepEqual(result.content.monsters[0].contentLinks, {
    rumorIds: ["marsh-hound-bells"],
    trackIds: ["marsh-hound-webbed-print"],
    bookIds: ["marsh-hound-notes"],
    trailTemplateIds: ["marsh-hound-trail"],
    complicationIds: ["marsh-hound-flood"]
  });
  assert.deepEqual(result.content.rumors[0].monsterIds, ["marsh-hound"]);
  assert.equal(result.reports[0].complete, true);
});

test("incomplete monster registration is rejected by default", () => {
  assert.throws(
    () => normalizeProviderRegistration("Partial Beasts", { monsters: [monster()] }),
    error => error instanceof ProviderContentValidationError && error.reports[0].errors.length >= 6
  );
});

test("partial registration is accepted only when explicitly allowed", () => {
  const result = normalizeProviderRegistration("Partial Beasts", { monsters: [monster()] }, { allowPartial: true });
  assert.equal(result.complete, false);
  assert.equal(result.reports[0].complete, false);
  assert.match(result.reports[0].errors.join(" "), /Actor source declaration/);
});

test("actor source declarations are deliberate and system-aware", () => {
  assert.equal(validateActorSource({ mode: "none", reason: "No combat statistics are intended for this quarry." }).complete, true);
  assert.equal(validateActorSource({ mode: "none", reason: "none" }).complete, false);
  assert.equal(actorProvisioningStatus({ actorSource: { mode: "data", systemId: "dnd5e", data: { type: "npc" } } }, { systemId: "pf2e" }).status, "incompatible-system");
});

test("registered Actor adapters make adapter sources provisionable", () => {
  registerActorAdapter("Example Adapter", {
    systemId: "dnd5e",
    buildActorData: () => ({ name: "Test", type: "npc", system: {} })
  });
  try {
    const status = actorProvisioningStatus({
      actorSource: { mode: "adapter", systemId: "dnd5e", adapterId: "example-adapter", data: {} }
    }, { systemId: "dnd5e" });
    assert.equal(status.status, "available");
  } finally {
    unregisterActorAdapter("Example Adapter");
  }
});

test("completeness reports support linked shared content", () => {
  const normalized = normalizeProviderRegistration("Example Beasts", { monsterBundles: [completeBundle()] });
  const catalogue = normalized.content;
  const report = evaluateMonsterCompleteness(catalogue.monsters[0], catalogue);
  assert.equal(report.complete, true);
  assert.equal(report.related.books.length, 1);
});

test("schema-v2 migration preserves edited core content and adds package metadata", async () => {
  const { migrateWorldData } = await import("../scripts/bootstrap.mjs");
  const seed = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
  const legacy = structuredClone(seed);
  legacy.schemaVersion = 1;
  legacy.moduleVersion = "1.0.0";
  legacy.monsters[0].summary = "Edited campaign summary.";
  delete legacy.monsters[0].contentLinks;
  delete legacy.monsters[0].actorSource;
  delete legacy.complications[0].id;

  legacy.imageOverrides = { [legacy.monsters[0].id]: "modules/hunters-bestiary/assets/hunters-bestiary.svg" };
  const migrated = migrateWorldData(legacy, seed);
  assert.equal(migrated.imageOverrides[legacy.monsters[0].id], "modules/runyth-hunters-bestiary/assets/hunters-bestiary.svg");
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.moduleVersion, "1.8.0");
  assert.equal(migrated.monsters[0].summary, "Edited campaign summary.");
  assert.ok(migrated.monsters[0].contentLinks.rumorIds.length > 0);
  assert.equal(migrated.monsters[0].actorSource.mode, "none");
  assert.ok(migrated.complications[0].id);
});
