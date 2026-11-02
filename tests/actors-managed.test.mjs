// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { reconcileManagedEmbedded } from "../scripts/actors.mjs";

function item({ id, name, managed = false, legacy = false }) {
  return {
    id,
    documentName: "Item",
    type: "weapon",
    name,
    flags: managed ? { "runyth-hunters-bestiary": { managedEmbedded: true, managedEmbeddedKey: name.toLowerCase() } } : {},
    system: { source: legacy ? { book: "Runyth Hunter's Bestiary", rules: "2024" } : { book: "Campaign" } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; }
  };
}

test("managed Actor refresh preserves unrelated embedded Items", async () => {
  const unrelated = item({ id: "custom", name: "GM Custom Feature" });
  const legacy = item({ id: "legacy", name: "Bite", legacy: true });
  const stale = item({ id: "stale", name: "Old Managed", managed: true });
  const actor = {
    items: { contents: [unrelated, legacy, stale] },
    effects: { contents: [] },
    getFlag: () => "quarry-id",
    updated: [], deleted: [], created: [],
    async updateEmbeddedDocuments(_type, records) { this.updated.push(...records); },
    async deleteEmbeddedDocuments(_type, ids) { this.deleted.push(...ids); },
    async createEmbeddedDocuments(_type, records) { this.created.push(...records); }
  };
  const incoming = [{
    name: "Bite",
    type: "weapon",
    system: { source: { book: "Runyth Hunter's Bestiary", rules: "2024" } },
    flags: { "runyth-hunters-bestiary": { managedEmbedded: true, managedEmbeddedKey: "bite" } }
  }];
  await reconcileManagedEmbedded(actor, "Item", incoming);
  assert.deepEqual(actor.updated.map(record => record._id), ["legacy"]);
  assert.deepEqual(actor.deleted, ["stale"]);
  assert.equal(actor.created.length, 0);
  assert.ok(!actor.deleted.includes("custom"));
});
