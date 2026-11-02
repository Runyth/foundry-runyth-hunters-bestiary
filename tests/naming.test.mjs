// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ComplementaryModuleRegistry,
  getCanonicalModuleName,
  getNamingConvention,
  getNamingWarningDecision,
  validateComplementaryModuleName
} from "../scripts/naming.mjs";

test("canonical core title", () => {
  assert.equal(getCanonicalModuleName({ moduleId: "runyth-hunters-bestiary", type: "core" }), "Runyth Hunter's Bestiary");
});

test("canonical system-layer title", () => {
  assert.equal(getCanonicalModuleName({ type: "system-layer", gameSystem: "D&D 5e 2024" }), "Runyth Hunter's Bestiary - D&D 5e 2024");
});

test("canonical subject title", () => {
  assert.equal(getCanonicalModuleName({ type: "subject", subject: "Aquatic Ecology" }), "Runyth Hunter's Bestiary: Aquatic Ecology");
});

test("canonical subject-system title", () => {
  assert.equal(getCanonicalModuleName({ type: "subject-system-layer", subject: "Aquatic Ecology", gameSystem: "D&D 5e 2024" }), "Runyth Hunter's Bestiary: Aquatic Ecology - D&D 5e 2024");
});

test("naming convention documents exact separators", () => {
  assert.deepEqual(getNamingConvention().separators, { subject: ": ", gameSystem: " - " });
});

test("invalid apostrophe and separator return structured problems", () => {
  const apostrophe = validateComplementaryModuleName({ moduleId: "bad-a", type: "subject", subject: "Forest Ecology", currentTitle: "Hunter’s Bestiary: Forest Ecology" });
  const separator = validateComplementaryModuleName({ moduleId: "bad-b", type: "subject", subject: "Forest Ecology", currentTitle: "Runyth Hunter's Bestiary - Forest Ecology" });
  assert.equal(apostrophe.valid, false);
  assert.ok(apostrophe.problems.some(problem => problem.code === "INVALID_APOSTROPHE"));
  assert.ok(separator.problems.some(problem => problem.code === "INVALID_SUBJECT_SEPARATOR"));
  assert.equal(separator.expectedName, "Runyth Hunter's Bestiary: Forest Ecology");
});

test("reversed subject and system order is rejected", () => {
  const result = validateComplementaryModuleName({ moduleId: "bad", type: "subject-system-layer", subject: "Forest Ecology", gameSystem: "Pathfinder Second Edition", currentTitle: "Runyth Hunter's Bestiary: Pathfinder Second Edition - Forest Ecology" });
  assert.ok(result.problems.some(problem => problem.code === "REVERSED_SUBJECT_SYSTEM_ORDER"));
});

test("startup warning registry deduplicates per module", () => {
  const registry = new ComplementaryModuleRegistry();
  registry.register({ moduleId: "example", type: "subject", subject: "Forest Ecology", currentTitle: "Wrong" });
  assert.equal(registry.shouldWarnAtStartup("example"), true);
  assert.equal(registry.shouldWarnAtStartup("example"), false);
});


test("compliant module names produce a valid structured result", () => {
  const result = validateComplementaryModuleName({
    moduleId: "forest-ecology",
    type: "subject",
    subject: "Forest Ecology",
    currentTitle: "Runyth Hunter's Bestiary: Forest Ecology"
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.problems, []);
});

test("missing family prefix is reported explicitly", () => {
  const result = validateComplementaryModuleName({
    moduleId: "forest-ecology",
    type: "subject",
    subject: "Forest Ecology",
    currentTitle: "Forest Ecology"
  });
  assert.ok(result.problems.some(problem => problem.code === "INVALID_FAMILY_PREFIX"));
});

test("disabled startup modules and compliant modules never warn", () => {
  const invalid = validateComplementaryModuleName({ moduleId: "bad", type: "subject", subject: "Forest Ecology", currentTitle: "Bad" });
  const valid = validateComplementaryModuleName({ moduleId: "good", type: "subject", subject: "Forest Ecology", currentTitle: "Runyth Hunter's Bestiary: Forest Ecology" });
  assert.deepEqual(getNamingWarningDecision({ active: false, reason: "startup", validation: invalid }), { warn: false, reason: "disabled" });
  assert.deepEqual(getNamingWarningDecision({ active: true, reason: "startup", validation: valid }), { warn: false, reason: "valid" });
});
