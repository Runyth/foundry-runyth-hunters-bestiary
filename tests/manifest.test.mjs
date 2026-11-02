import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));

test("Foundry v13 manifest omits unsupported top-level system key", () => {
  assert.equal(Object.hasOwn(manifest, "system"), false);
  assert.equal(manifest.id, "hunters-bestiary");
  assert.equal(manifest.version, "1.8.0");
  assert.deepEqual(manifest.compatibility, { minimum: "13.341", verified: "13.351", maximum: "13.351" });
});
