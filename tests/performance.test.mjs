// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency, saveGeometry } from "../scripts/ui-toolkit.mjs";

test("bounded concurrency preserves order and never exceeds its limit", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], async value => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  }, { concurrency: 3 });
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
  assert.ok(peak > 1);
  assert.ok(peak <= 3);
});

test("concurrent mapped geometry writes retain every application entry", async () => {
  const previousGame = globalThis.game;
  let stored = {};
  globalThis.game = {
    settings: {
      get: () => stored,
      set: async (_moduleId, _settingKey, value) => {
        await new Promise(resolve => setTimeout(resolve, 2));
        stored = structuredClone(value);
        return value;
      }
    }
  };
  try {
    await Promise.all([
      saveGeometry({ moduleId: "test", settingKey: "windows", applicationId: "one", mapped: true, geometry: { width: 500, height: 400 } }),
      saveGeometry({ moduleId: "test", settingKey: "windows", applicationId: "two", mapped: true, geometry: { width: 600, height: 450 } })
    ]);
    assert.equal(stored.one.width, 500);
    assert.equal(stored.two.width, 600);
  } finally {
    globalThis.game = previousGame;
  }
});
