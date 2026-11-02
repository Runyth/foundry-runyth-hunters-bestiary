// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("GM approvals are visible outside the GM tab and fieldwork exposes selected-player context", async () => {
  const template = await readFile(new URL("templates/main.hbs", root), "utf8");
  assert.match(template, /showApprovalInbox/);
  assert.match(template, /HB\.Approvals\.GM\.PendingBanner/);
  assert.match(template, /isFieldwork[\s\S]*HB\.Approvals\.GM\.FieldworkQueueTitle/);
  assert.match(template, /HB\.Approvals\.GM\.SelectedHunter/);
  assert.match(template, /selectedPlayerRecentRequests/);
});

test("fieldwork setting propagation has both Foundry onChange and module-local refresh paths", async () => {
  const settings = await readFile(new URL("scripts/settings.mjs", root), "utf8");
  const fieldwork = await readFile(new URL("scripts/fieldwork.mjs", root), "utf8");
  const integrations = await readFile(new URL("scripts/integrations.mjs", root), "utf8");
  assert.match(settings, /onChange: value => globalThis\.Hooks\?\.callAll\?\.\(`\$\{MODULE_ID\}\.fieldworkChanged`/);
  assert.match(fieldwork, /fieldworkChanged/);
  assert.match(integrations, /Hooks\.on\(`\$\{MODULE_ID\}\.fieldworkChanged`, rerenderFieldwork\)/);
  assert.match(integrations, /requestAnimationFrame/);
});
