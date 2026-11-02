// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import {
  injectDirectoryButton,
  injectTokenHudButton,
  registerKeybinding,
  registerApplicationLaunchers,
  registerRerenderHooks,
  registerSceneControls,
  resetIntegrationRegistrationStateForTests
} from "../scripts/integrations.mjs";

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
  }
  append(child) { this.children.push(child); child.parent = this; }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelector(selector) {
    if (selector.includes("data-hb-launcher")) {
      const match = selector.match(/data-hb-launcher="([^"]+)"/);
      return this.find(child => child.dataset.hbLauncher === match?.[1]);
    }
    if (["[data-position=\"right\"]", ".col.right", ".right", ".col", ".directory-header .header-actions", ".directory-header", ":scope > header"].includes(selector)) {
      return this.host ?? null;
    }
    return null;
  }
  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find?.(predicate);
      if (nested) return nested;
    }
    return null;
  }
}

test("Token HUD and directory rerenders insert one control with one listener", () => {
  const previous = { HTMLElement: globalThis.HTMLElement, document: globalThis.document, game: globalThis.game, CONST: globalThis.CONST };
  globalThis.HTMLElement = FakeElement;
  globalThis.document = { createElement: tag => new FakeElement(tag) };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings: { get: () => true },
    i18n: { localize: key => key }
  };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  const api = { open: () => undefined, monsterIdForActor: () => "quarry" };
  const actor = { documentName: "Actor", isOwner: true };
  try {
    const root = new FakeElement();
    root.host = new FakeElement();
    root.append(root.host);
    assert.equal(injectTokenHudButton(api, { object: { actor } }, root), true);
    assert.equal(injectTokenHudButton(api, { object: { actor } }, root), false);
    assert.equal(root.host.children.length, 1);
    assert.equal(root.host.children[0].listeners.get("click").length, 1);

    const directory = new FakeElement();
    directory.host = new FakeElement();
    directory.append(directory.host);
    assert.equal(injectDirectoryButton(api, directory, "actor"), true);
    assert.equal(injectDirectoryButton(api, directory, "actor"), false);
    assert.equal(directory.host.children.length, 1);
    assert.equal(directory.host.children[0].listeners.get("click").length, 1);
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("Scene Controls and launcher hooks register once with Foundry v13 record shape", () => {
  const previous = { Hooks: globalThis.Hooks, game: globalThis.game };
  const hooks = [];
  globalThis.Hooks = { on: (name, callback) => hooks.push({ name, callback }) };
  globalThis.game = { settings: { get: () => true } };
  const api = { open: () => undefined };
  try {
    resetIntegrationRegistrationStateForTests();
    assert.equal(registerSceneControls(api), true);
    assert.equal(registerSceneControls(api), false);
    assert.equal(registerApplicationLaunchers(api), true);
    assert.equal(registerApplicationLaunchers(api), false);
    assert.deepEqual(hooks.map(entry => entry.name), [
      "getSceneControlButtons",
      "renderTokenHUD",
      "renderActorDirectory",
      "renderJournalDirectory"
    ]);
    const sceneHook = hooks[0].callback;
    const controls = { tokens: { tools: { select: {} } } };
    sceneHook(controls);
    sceneHook(controls);
    assert.equal(Object.keys(controls.tokens.tools).filter(key => key === "huntersBestiary").length, 1);
    const legacyArray = [];
    sceneHook(legacyArray);
    assert.equal(legacyArray.length, 0);
  } finally {
    resetIntegrationRegistrationStateForTests();
    globalThis.Hooks = previous.Hooks;
    globalThis.game = previous.game;
  }
});


test("keybinding registration is idempotent", () => {
  const previous = { game: globalThis.game, CONST: globalThis.CONST };
  const registrations = [];
  globalThis.game = { keybindings: { register: (...args) => registrations.push(args) } };
  globalThis.CONST = { KEYBINDING_PRECEDENCE: { NORMAL: 0 } };
  try {
    resetIntegrationRegistrationStateForTests();
    const api = { open: () => undefined };
    assert.equal(registerKeybinding(api), true);
    assert.equal(registerKeybinding(api), false);
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0][1], "openControlCentre");
  } finally {
    resetIntegrationRegistrationStateForTests();
    globalThis.game = previous.game;
    globalThis.CONST = previous.CONST;
  }
});


test("fieldwork changes refresh open GM dashboards once per render frame", () => {
  const previous = { Hooks: globalThis.Hooks, game: globalThis.game, foundry: globalThis.foundry, requestAnimationFrame: globalThis.requestAnimationFrame };
  const hooks = new Map();
  const frames = [];
  const renders = { control: 0, admin: 0, transfer: 0 };
  const instances = new Map([
    ["hunters-bestiary-control-centre", { rendered: true, render: () => { renders.control += 1; } }],
    ["hunters-bestiary-administration", { rendered: true, render: () => { renders.admin += 1; } }],
    ["hunters-bestiary-transfer", { rendered: true, render: () => { renders.transfer += 1; } }]
  ]);
  globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
  globalThis.game = { user: { id: "gm", isGM: true } };
  globalThis.foundry = { applications: { instances } };
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  try {
    resetIntegrationRegistrationStateForTests();
    assert.equal(registerRerenderHooks(), true);
    hooks.get("runyth-hunters-bestiary.fieldworkChanged")?.();
    hooks.get("updateSetting")?.({ key: "hunters-bestiary.fieldworkRequests" });
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(renders, { control: 1, admin: 1, transfer: 0 });
  } finally {
    resetIntegrationRegistrationStateForTests();
    globalThis.Hooks = previous.Hooks;
    globalThis.game = previous.game;
    globalThis.foundry = previous.foundry;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
  }
});
