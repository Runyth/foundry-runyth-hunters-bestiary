import test from "node:test";
import assert from "node:assert/strict";
import { clampGeometry, collectOperationFailures, createDashboardOptions, createDashboardToolkit, operationHasFailures, runProgressOperation, summarizeOperationResult, summarizeOperations } from "../scripts/ui-toolkit.mjs";

test("dashboard options require ApplicationV2-resizable window behavior", () => {
  const options = createDashboardOptions({ id: "example", width: 900, height: 700 });
  assert.equal(options.window.resizable, true);
  assert.equal(options.window.positioned, true);
  assert.equal(options.position.width, 900);
  assert.equal(options.position.minWidth, undefined);
  assert.equal(options.hbGeometry.minWidth, 480);
});

test("geometry is clamped into the active viewport", () => {
  assert.deepEqual(clampGeometry({ left: 5000, top: 5000, width: 2000, height: 2000 }, { width: 1080, height: 760, minWidth: 720, minHeight: 520 }, { width: 800, height: 600 }), { width: 760, height: 560, left: 40, top: 40 });
});

test("operation summaries distinguish success, skipped, and failure", () => {
  assert.deepEqual(summarizeOperations([{ operation: "imported" }, { operation: "skipped" }, { operation: "failed", error: new Error("x") }]), { processed: 3, success: 1, skipped: 1, failed: 1 });
});


test("dashboard naming validation runs once for every intentional open call", () => {
  const calls = [];
  const toolkit = createDashboardToolkit({ namingApi: {
    warnForInvalidComplementaryModuleName(metadata, options) { calls.push({ metadata, options }); return { warned: true }; }
  } });
  toolkit.validateDashboardModuleName({ moduleId: "example" });
  toolkit.validateDashboardModuleName({ moduleId: "example" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.options.reason), ["dashboard", "dashboard"]);
});


test("shared progress dialogs use fixed width and preserve structured failures", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/ui-toolkit.mjs", import.meta.url), "utf8"));
  assert.match(source, /width = 520/);
  assert.match(source, /position: \{ width: fixedWidth \}/);
  assert.match(source, /resizable: false/);
  const failures = collectOperationFailures({ operation: "import-everything", results: [{ failed: [{ message: "Actor failed" }] }, { failed: [] }] });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].message, "Actor failed");
});


test("operation-result inspection treats Foundry-like class instances and compatibility getters as opaque", () => {
  let getterReads = 0;
  class FoundryLikeDocument {
    constructor() {
      Object.defineProperty(this, "legacySense", {
        enumerable: true,
        get() {
          getterReads += 1;
          throw new Error("deprecated compatibility getter was accessed");
        }
      });
    }
  }
  const document = new FoundryLikeDocument();
  const result = {
    operation: "import-actors",
    created: [document],
    updated: [],
    skipped: [],
    failed: [],
    results: [{ operation: "imported", document }]
  };
  assert.deepEqual(collectOperationFailures(result), []);
  assert.equal(operationHasFailures(result), false);
  assert.equal(summarizeOperationResult(result).success, 1);
  assert.equal(getterReads, 0);
});


test("operation-result inspection ignores accessor properties even on plain records", () => {
  let getterReads = 0;
  const dangerous = { operation: "imported" };
  Object.defineProperty(dangerous, "error", {
    enumerable: true,
    get() {
      getterReads += 1;
      throw new Error("getter should remain opaque");
    }
  });
  assert.equal(operationHasFailures([dangerous]), false);
  assert.equal(getterReads, 0);
});


test("explicit nested operation failures remain detectable through the result schema", () => {
  const result = {
    operation: "import-everything",
    results: [
      { operation: "actors", created: [{ id: "a" }], failed: [] },
      { operation: "items", failures: [{ recordId: "item-2", rule: "create", message: "Item failed" }] }
    ]
  };
  const failures = collectOperationFailures(result);
  assert.equal(operationHasFailures(result), true);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].recordId, "item-2");
  assert.equal(failures[0].message, "Item failed");
});


test("progress operations can auto-close clean success and retain failed windows", async () => {
  const previousFoundry = globalThis.foundry;
  const previousGame = globalThis.game;
  const previousInnerWidth = globalThis.innerWidth;
  let latestDialog;
  class FakeDialog {
    constructor(options) {
      this.options = options;
      this.rendered = false;
      this.frontCount = 0;
      this.closed = null;
      const nodes = new Map();
      const node = selector => {
        if (!nodes.has(selector)) nodes.set(selector, { disabled: false, hidden: false, textContent: "", max: 1, value: 0 });
        return nodes.get(selector);
      };
      this.element = { querySelector: node };
      latestDialog = this;
    }
    async render() { this.rendered = true; return this; }
    setPosition() {}
    bringToFront() { this.frontCount += 1; }
    async close(options) { this.closed = options; this.rendered = false; }
  }
  globalThis.foundry = { applications: { api: { DialogV2: FakeDialog } }, utils: { escapeHTML: value => String(value) } };
  globalThis.game = { i18n: { localize: key => key } };
  globalThis.innerWidth = 1200;
  const root = { classList: { toggle() {} }, setAttribute() {}, querySelectorAll: () => [] };
  try {
    await runProgressOperation({
      title: "Success",
      root,
      autoCloseOnSuccess: true,
      runner: update => {
        update({ current: 1, total: 1, success: 1 });
        return [{ operation: "imported" }];
      }
    });
    assert.deepEqual(latestDialog.closed, { animate: false });

    await runProgressOperation({
      title: "Failure",
      root,
      autoCloseOnSuccess: true,
      foregroundOnFailure: true,
      runner: update => {
        update({ current: 1, total: 1, failed: 1, errors: [{ message: "failed" }] });
        return [{ operation: "failed", message: "failed" }];
      }
    });
    assert.equal(latestDialog.closed, null);
    assert.ok(latestDialog.frontCount >= 1);
  } finally {
    globalThis.foundry = previousFoundry;
    globalThis.game = previousGame;
    globalThis.innerWidth = previousInnerWidth;
  }
});
