// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("dashboard retains quick guide and adds role-specific detailed guides", async () => {
  const template = await readFile(new URL("templates/main.hbs", root), "utf8");
  for (const key of [
    "HB.Guide.Step1Title",
    "HB.Guide.Step4Title",
    "HB.Guide.GM.Title",
    "HB.Guide.GM.WorkflowTitle",
    "HB.Guide.Player.Title",
    "HB.Guide.Player.WorkflowTitle"
  ]) assert.match(template, new RegExp(key.replaceAll(".", "\\.")));
  assert.match(template, /\{\{#if isGM\}\}[\s\S]*HB\.Guide\.GM\.Title[\s\S]*\{\{else\}\}[\s\S]*HB\.Guide\.Player\.Title/);
});

test("player guide is spoiler-safe and GM guide documents authority boundaries", async () => {
  const player = await readFile(new URL("docs/PLAYER-GUIDE.md", root), "utf8");
  const gm = await readFile(new URL("docs/GM-GUIDE.md", root), "utf8");
  assert.match(player, /one-use GM approval/i);
  assert.match(player, /does not reveal hidden GM-only information/i);
  assert.doesNotMatch(player, /gmSecrets|rumor truth labels/i);
  assert.match(gm, /Responsibility model/);
  assert.match(gm, /approval queue/i);
  assert.match(gm, /Do not approve a second identical attempt until something meaningful changed/i);
});


test("progression safeguards are explicit in production source", async () => {
  const socket = await readFile(new URL("scripts/socket.mjs", root), "utf8");
  const app = await readFile(new URL("scripts/apps/main-app.mjs", root), "utf8");
  assert.match(socket, /shared-insight:\$\{originUserId\}:level-\$\{senderLevel\}/);
  assert.match(socket, /discoveries\.some\(entry => entry\.source === source\)/);
  assert.match(app, /EvidenceSavedNoGM/);
  assert.match(app, /requestGm\("request-fieldwork"/);
});
