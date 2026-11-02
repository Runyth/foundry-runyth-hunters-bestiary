// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { registerSettings } from "../scripts/settings.mjs";

test("core settings register once", () => {
  const previous = globalThis.game;
  const calls = [];
  globalThis.game = { settings: {
    registerMenu: (...args) => calls.push(["menu", ...args]),
    register: (...args) => calls.push(["setting", ...args])
  } };
  try {
    assert.equal(registerSettings({ MainApp: class {}, AdminApp: class {}, TransferApp: class {} }), true);
    assert.equal(registerSettings({ MainApp: class {}, AdminApp: class {}, TransferApp: class {} }), false);
    assert.ok(calls.length > 0);
    const settings = new Map(calls.filter(([kind]) => kind === "setting").map(([, , key, config]) => [key, config]));
    assert.equal(settings.get("requireFieldworkApproval")?.default, true);
    assert.equal(settings.get("requireFieldworkApproval")?.config, true);
    assert.equal(settings.get("fieldworkRequests")?.config, false);
    assert.equal(settings.get("fieldworkRequests")?.scope, "world");
    assert.deepEqual(settings.get("fieldworkRequests")?.default, []);
    assert.equal(typeof settings.get("fieldworkRequests")?.onChange, "function");
    assert.equal(settings.get("huntDisplayColors")?.scope, "world");
    assert.equal(settings.get("huntDisplayColors")?.config, false);
    assert.equal(typeof settings.get("huntDisplayColors")?.onChange, "function");
    const previousHooks = globalThis.Hooks;
    const hookCalls = [];
    globalThis.Hooks = { callAll: (...args) => hookCalls.push(args) };
    settings.get("fieldworkRequests").onChange([{ id: "request" }]);
    assert.deepEqual(hookCalls, [["runyth-hunters-bestiary.fieldworkChanged", [{ id: "request" }]]]);
    globalThis.Hooks = previousHooks;
    const firstCount = calls.length;
    assert.equal(calls.length, firstCount);
  } finally {
    globalThis.game = previous;
  }
});
