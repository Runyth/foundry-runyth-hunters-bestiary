// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, FLAGS } from "./constants.mjs";
import { getWorldData, setWorldData, appendAudit } from "./state.mjs";
import { clone, nowIso } from "./utils.mjs";
import { moduleLog } from "./utils.mjs";

export const DEFAULT_MONSTER_IMAGE = `modules/${MODULE_ID}/assets/hunters-bestiary.svg`;
export const LEGACY_IMAGE_PREFIX = "modules/hunters-bestiary/";
export const REBRANDED_IMAGE_PREFIX = `modules/${MODULE_ID}/`;

export function normalizeImagePath(value) {
  const path = String(value ?? "").trim();
  if (!path || path.startsWith("javascript:") || path.startsWith("data:text/html")) return "";
  return path;
}

export function resolveMonsterImage(monster, worldData = {}, { fallback = DEFAULT_MONSTER_IMAGE } = {}) {
  const override = normalizeImagePath(worldData?.imageOverrides?.[monster?.id]);
  const packaged = normalizeImagePath(monster?.img);
  return override || packaged || fallback;
}

export function imageOverrideFor(monsterId, worldData = getWorldData()) {
  return normalizeImagePath(worldData?.imageOverrides?.[monsterId]);
}

export async function setMonsterImage(monsterId, imagePath, { syncActor = true } = {}) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may change quarry images.");
  const path = normalizeImagePath(imagePath);
  if (!path) throw new Error("A valid image path is required.");
  const world = getWorldData();
  const monster = world.monsters?.find(entry => entry.id === monsterId);
  if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
  world.imageOverrides ??= {};
  world.imageOverrides[monsterId] = path;
  await setWorldData(world);
  const actor = syncActor ? await findLinkedActor(monster) : null;
  if (actor?.update) await actor.update({ img: path, "prototypeToken.texture.src": path });
  await appendAudit({ type: "monster-image-set", monsterId, imagePath: path, actorUuid: actor?.uuid ?? null });
  globalThis.Hooks?.callAll?.(`${MODULE_ID}.monsterImageChanged`, { monsterId, imagePath: path, actorUuid: actor?.uuid ?? null, reset: false });
  globalThis.Hooks?.callAll?.(`${MODULE_ID}.catalogChanged`, { type: "monster-image", monsterId, imagePath: path });
  return { monsterId, imagePath: path, actorUuid: actor?.uuid ?? null, updatedAt: nowIso() };
}

export async function resetMonsterImage(monsterId, { syncActor = true } = {}) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may reset quarry images.");
  const world = getWorldData();
  const monster = world.monsters?.find(entry => entry.id === monsterId);
  if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
  world.imageOverrides ??= {};
  delete world.imageOverrides[monsterId];
  const imagePath = resolveMonsterImage(monster, world);
  await setWorldData(world);
  const actor = syncActor ? await findLinkedActor(monster) : null;
  if (actor?.update) await actor.update({ img: imagePath, "prototypeToken.texture.src": imagePath });
  await appendAudit({ type: "monster-image-reset", monsterId, imagePath, actorUuid: actor?.uuid ?? null });
  globalThis.Hooks?.callAll?.(`${MODULE_ID}.monsterImageChanged`, { monsterId, imagePath, actorUuid: actor?.uuid ?? null, reset: true });
  globalThis.Hooks?.callAll?.(`${MODULE_ID}.catalogChanged`, { type: "monster-image", monsterId, imagePath, reset: true });
  return { monsterId, imagePath, actorUuid: actor?.uuid ?? null, reset: true };
}

export function openMonsterImagePicker(monsterId, { current = null, syncActor = true, onSelected = null } = {}) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may change quarry images.");
  const world = getWorldData();
  const monster = world.monsters?.find(entry => entry.id === monsterId);
  if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
  const PickerClass = globalThis.foundry?.applications?.apps?.["File" + "Picker"]?.implementation;
  if (!PickerClass) throw new Error("Foundry file picker is unavailable.");
  const picker = new PickerClass({
    type: "image",
    current: normalizeImagePath(current) || resolveMonsterImage(monster, world),
    callback: async selected => {
      const result = await setMonsterImage(monsterId, selected, { syncActor });
      await onSelected?.(clone(result));
    }
  });
  picker.render({ force: true });
  return picker;
}

export function applyMonsterImageToActorData(monster, actorData, worldData = getWorldData()) {
  const output = clone(actorData ?? {});
  const imagePath = resolveMonsterImage(monster, worldData, { fallback: normalizeImagePath(output.img) || DEFAULT_MONSTER_IMAGE });
  output.img = imagePath;
  output.prototypeToken = clone(output.prototypeToken ?? {});
  output.prototypeToken.texture = clone(output.prototypeToken.texture ?? {});
  output.prototypeToken.texture.src = imagePath;
  return output;
}

async function findLinkedActor(monster) {
  if (monster?.actorUuid && typeof globalThis.fromUuid === "function") {
    const linked = await globalThis.fromUuid(monster.actorUuid).catch(() => null);
    if (linked?.documentName === "Actor" && !linked.pack) return linked;
  }
  return globalThis.game?.actors?.contents?.find?.(actor => actor.getFlag?.(MODULE_ID, FLAGS.ACTOR_MONSTER_ID) === monster?.id) ?? null;
}

// 1.8.3 schema-3 repair: pre-rebrand worlds carry the legacy module id in the
// core image fields of provisioned Actors. Rewrites them through the public
// update path; only rows that still carry the legacy prefix are touched.
export async function migrateProvisionedImagePaths() {
  const findings = [];
  for (const actor of game.actors.contents ?? []) {
    const monsterId = actor?.getFlag?.(MODULE_ID, FLAGS.ACTOR_MONSTER_ID);
    if (!monsterId) continue;
    const updates = {};
    if (typeof actor.img === "string" && actor.img.startsWith(LEGACY_IMAGE_PREFIX)) {
      updates.img = `${REBRANDED_IMAGE_PREFIX}${actor.img.slice(LEGACY_IMAGE_PREFIX.length)}`;
    }
    const texture = actor.prototypeToken?.texture?.src;
    if (typeof texture === "string" && texture.startsWith(LEGACY_IMAGE_PREFIX)) {
      updates["prototypeToken.texture.src"] = `${REBRANDED_IMAGE_PREFIX}${texture.slice(LEGACY_IMAGE_PREFIX.length)}`;
    }
    if (Object.keys(updates).length === 0) continue;
    try {
      await actor.update(updates);
      findings.push({ monsterId, actorId: actor.id, updated: Object.keys(updates) });
    } catch (error) {
      console.error(`${MODULE_ID} | Actor image migration failed for ${actor.name}`, error);
    }
  }
  if (findings.length) {
    moduleLog(`Rewrote legacy image paths on ${findings.length} provisioned Actor(s).`);
  }
  return findings;
}
