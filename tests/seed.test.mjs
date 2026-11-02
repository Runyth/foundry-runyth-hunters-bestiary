import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSeed } from "../scripts/bootstrap.mjs";

const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));

test("seed catalogue satisfies the module contract", () => {
  assert.equal(validateSeed(seed), true);
  assert.ok(seed.monsters.length >= 12);
  assert.ok(seed.tracks.length >= 20);
  assert.ok(seed.rumors.length >= 20);
  assert.ok(seed.books.length >= 8);
  assert.ok(seed.trailTemplates.length >= 4);
  assert.ok(seed.complications.length >= 20);
});

test("all shipped monster content uses standard Foundry localization keys", async () => {
  const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  const de = JSON.parse(await readFile(new URL("../lang/de.json", import.meta.url), "utf8"));
  const localizable = ["name", "summary", "rumor", "ecology", "behavior", "defenses", "weaknesses", "harvest", "gmSecrets"];
  const assertKey = (value, label) => {
    assert.equal(typeof value, "string", `${label} must be a localization key`);
    assert.match(value, /^HB\.Content\./, `${label} must use the HB.Content namespace`);
    assert.equal(typeof en[value], "string", `${label} missing from English dictionary`);
    assert.equal(typeof de[value], "string", `${label} missing from German dictionary`);
    assert.ok(en[value].length > 0, `${label} English translation must not be empty`);
    assert.ok(de[value].length > 0, `${label} German translation must not be empty`);
  };

  for (const monster of seed.monsters) {
    assert.match(monster.id, /^[a-z0-9-]+$/);
    for (const field of localizable) assertKey(monster[field], `${monster.id}.${field}`);
    for (const [index, habitat] of monster.habitats.entries()) assertKey(habitat, `${monster.id}.habitats[${index}]`);
    for (const [index, sign] of monster.signs.entries()) assertKey(sign, `${monster.id}.signs[${index}]`);
    assert.ok(monster.preferredSkills.length > 0);
    assert.equal(monster.actorSource?.mode, "none");
    assertKey(monster.actorSource.reason, `${monster.id}.actorSource.reason`);
    for (const field of ["rumorIds", "trackIds", "bookIds", "trailTemplateIds", "complicationIds"]) {
      assert.ok(monster.contentLinks?.[field]?.length > 0, `${monster.id}.${field}`);
    }
  }

  for (const complication of seed.complications) {
    assert.match(complication.id, /^[a-z0-9-]+$/);
    assertKey(complication.key, `${complication.id}.key`);
  }
});

test("trail templates provide playable sequential checks", () => {
  for (const template of seed.trailTemplates) {
    assert.ok(template.steps.length >= 4, `${template.id} has too few steps`);
    for (const step of template.steps) {
      if (step.kind !== "conclusion") {
        assert.ok(step.skills.length > 0, `${template.id}/${step.id} has no skills`);
        assert.ok(step.dc >= 5 && step.dc <= 30);
      } else {
        assert.equal(step.dc, 0);
      }
    }
  }
});
