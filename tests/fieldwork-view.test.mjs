import test from "node:test";
import assert from "node:assert/strict";
import { selectActorPlayerOwner } from "../scripts/fieldwork-view.mjs";

test("selected player context follows the active owner of the controlled Actor", () => {
  const users = [
    { id: "gm", isGM: true, active: true },
    { id: "offline", isGM: false, active: false },
    { id: "player", isGM: false, active: true }
  ];
  const actor = { ownership: { offline: 3, player: 3 } };
  assert.equal(selectActorPlayerOwner(actor, users, 3)?.id, "player");
});

test("selected player context supports Foundry permission checks and ignores non-owners", () => {
  const users = [
    { id: "viewer", isGM: false, active: true },
    { id: "owner", isGM: false, active: false }
  ];
  const actor = { testUserPermission: user => user.id === "owner" };
  assert.equal(selectActorPlayerOwner(actor, users, 3)?.id, "owner");
});


test("assigned player Character is preferred even when ownership metadata is unusual", () => {
  const actor = { id: "actor-1", uuid: "Actor.actor-1", ownership: { player: 1 } };
  const users = [{ id: "player", isGM: false, active: true, character: { id: "actor-1", uuid: "Actor.actor-1" } }];
  assert.equal(selectActorPlayerOwner(actor, users, 3)?.id, "player");
});
