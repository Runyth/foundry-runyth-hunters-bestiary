// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("hunt creation no longer preselects an outcome and final resolution is player-driven", async () => {
  const editor = await readFile(new URL("templates/hunt-editor.hbs", root), "utf8");
  const main = await readFile(new URL("templates/main.hbs", root), "utf8");
  assert.doesNotMatch(editor, /name="outcome"/);
  assert.match(main, /data-action="requestResolution"/);
  assert.match(main, /data-action="attemptResolution"/);
  assert.match(main, /data-action="gmResolveOutcome"/);
  assert.match(main, /data-action="gmRejectResolution"/);
});

test("GM dashboard exposes hunt rules while heavy per-monster override controls live in a separate app", async () => {
  const main = await readFile(new URL("templates/main.hbs", root), "utf8");
  const globalRules = await readFile(new URL("templates/hunt-rules.hbs", root), "utf8");
  const overrides = await readFile(new URL("templates/monster-hunt-rules.hbs", root), "utf8");
  assert.match(main, /data-action="openHuntRules"/);
  assert.match(globalRules, /data-hb-search="quarry-pool"/);
  assert.match(globalRules, /data-action="editOverride"/);
  assert.match(overrides, /saveOverride/);
});

test("player bestiary metadata uses the disclosure model instead of raw knowledge-level fields", async () => {
  const mainApp = await readFile(new URL("scripts/apps/main-app.mjs", root), "utf8");
  const api = await readFile(new URL("scripts/api.mjs", root), "utf8");
  assert.match(mainApp, /disclosedFieldsFor/);
  assert.match(api, /disclosedFieldsFor/);
  assert.doesNotMatch(api, /KNOWLEDGE_FIELDS\[/);
});

test("large hunt-rule monster lists use stable search and browser containment hints", async () => {
  const app = await readFile(new URL("scripts/apps/hunt-rules-app.mjs", root), "utf8");
  const css = await readFile(new URL("styles/runyth-hunters-bestiary.css", root), "utf8");
  assert.match(app, /bindStableSearch/);
  assert.match(app, /new Set\(rules\.quarryPool\)/);
  assert.match(css, /content-visibility:\s*auto/);
  assert.match(css, /contain-intrinsic-size/);
});
