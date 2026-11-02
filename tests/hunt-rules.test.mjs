// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultHuntRules,
  normalizeHuntRules,
  chooseQuarryMonsterId,
  rollDisclosureOpportunities,
  disclosedFieldsFor,
  minimumHuntKnowledgeLevel,
  isResolutionStage,
  resolutionRuleFor
} from "../scripts/hunt-rules.mjs";

const monsters = ["alpha", "beta", "gamma"];

test("default discovery model hides identity until repeated successful rumors", () => {
  const rules = defaultHuntRules(monsters);
  assert.equal(rules.disclosure.name.minRumors, 5);
  assert.equal(rules.disclosure.name.minPoints, 5);
  assert.equal(rules.disclosure.weaknesses.minRumors, 40);
  assert.equal(rules.disclosure.weaknesses.minLevel, 5);
  assert.equal(rules.disclosure.weaknesses.gmApproval, true);
});

test("quarry pool is configurable and avoids immediate repeats when possible", () => {
  const rules = normalizeHuntRules({ quarryPool: ["alpha", "beta"], avoidImmediateRepeat: true }, monsters);
  assert.equal(chooseQuarryMonsterId({ rules, monsterIds: monsters, lastMonsterId: "alpha", rng: () => 0 }), "beta");
  const single = normalizeHuntRules({ quarryPool: ["alpha"], avoidImmediateRepeat: true }, monsters);
  assert.equal(chooseQuarryMonsterId({ rules: single, monsterIds: monsters, lastMonsterId: "alpha", rng: () => 0.9 }), "alpha");
});

test("per-monster minimum hunt knowledge overrides the global rule", () => {
  const rules = normalizeHuntRules({ minimumHuntLevel: 2, monsterOverrides: { beta: { minimumHuntLevel: 4 } } }, monsters);
  assert.equal(minimumHuntKnowledgeLevel(rules, "alpha", monsters), 2);
  assert.equal(minimumHuntKnowledgeLevel(rules, "beta", monsters), 4);
});

test("new records reveal only explicitly unlocked fields and legacy records preserve old visibility", () => {
  const rules = defaultHuntRules(monsters);
  const fresh = disclosedFieldsFor({ record: { unlockedFields: ["rumor"], legacyDisclosure: false }, level: 3, rules, monsterId: "alpha", monsterIds: monsters });
  assert.deepEqual([...fresh], ["rumor"]);
  const legacy = disclosedFieldsFor({ record: { unlockedFields: [], legacyDisclosure: true }, level: 3, rules, monsterId: "alpha", monsterIds: monsters });
  assert.ok(legacy.has("name"));
  assert.ok(legacy.has("defenses"));
  assert.equal(legacy.has("weaknesses"), false);
});

test("eligible rumor discoveries honor chance and GM approval", () => {
  const rules = normalizeHuntRules({ disclosure: {
    name: { minLevel: 1, minPoints: 5, minRumors: 5, chance: 100, gmApproval: false },
    weaknesses: { minLevel: 5, minPoints: 40, minRumors: 40, chance: 100, gmApproval: true }
  } }, monsters);
  const result = rollDisclosureOpportunities({ record: { points: 40, rumorsSucceeded: 40, unlockedFields: [] }, level: 5, rules, monsterId: "alpha", monsterIds: monsters, rng: () => 0 });
  assert.ok(result.automatic.includes("name"));
  assert.ok(result.approvals.includes("weaknesses"));
});

test("resolution defaults distinguish automatic, check-plus-GM, and GM-only outcomes", () => {
  const rules = defaultHuntRules(monsters);
  assert.equal(resolutionRuleFor(rules, "released", monsters).mode, "auto");
  assert.equal(resolutionRuleFor(rules, "evaded", monsters).mode, "check-gm");
  assert.equal(resolutionRuleFor(rules, "captured", monsters).mode, "gm");
});

test("conclusion step marks the hunt as being at its resolution stage", () => {
  assert.equal(isResolutionStage({ status: "active", steps: [{ kind: "track", status: "completed" }, { kind: "conclusion", status: "active" }] }), true);
  assert.equal(isResolutionStage({ status: "active", steps: [{ kind: "track", status: "active" }, { kind: "conclusion", status: "locked" }] }), false);
});
