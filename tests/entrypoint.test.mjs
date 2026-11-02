// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";

test("Foundry v13 entrypoint imports against the expected public application shape", async () => {
  const previous = {
    foundry: globalThis.foundry,
    Hooks: globalThis.Hooks
  };

  class MockApplicationV2 {}
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: MockApplicationV2,
        HandlebarsApplicationMixin: Base => Base,
        DialogV2: class MockDialogV2 {}
      },
      instances: new Map()
    },
    utils: {}
  };
  const registrations = [];
  globalThis.Hooks = {
    once: (hook, callback) => registrations.push({ type: "once", hook, callback }),
    on: (hook, callback) => registrations.push({ type: "on", hook, callback }),
    callAll: () => undefined
  };

  try {
    await import(`../scripts/main.mjs?entrypoint-smoke=${Date.now()}`);
    assert.deepEqual(registrations.filter(entry => entry.type === "once").map(entry => entry.hook), ["init", "ready"]);
  } finally {
    globalThis.foundry = previous.foundry;
    globalThis.Hooks = previous.Hooks;
  }
});
