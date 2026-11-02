// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, MODULE_VERSION, SCHEMA_VERSION, SETTINGS, FLAGS } from "./constants.mjs";
import { clone, downloadJson, nowIso, slugify } from "./utils.mjs";
import { getProgress, normalizeProgress, normalizeMonsterProgress, setProgress, getWorldData, getHunts, setWorldData, setHunts, appendAudit } from "./state.mjs";
import { validateSeed } from "./bootstrap.mjs";


export const PORTABLE_SETTING_KEYS = Object.freeze([
  SETTINGS.HUNT_RULES,
  SETTINGS.HUNT_DISPLAY_COLORS,
  SETTINGS.PLAYER_CAN_ATTEMPT,
  SETTINGS.PLAYER_CAN_ADD_NOTES,
  SETTINGS.PLAYER_CAN_SHARE,
  SETTINGS.AUTO_AWARD,
  SETTINGS.REQUIRE_FIELDWORK_APPROVAL,
  SETTINGS.ROLL_MODE,
  SETTINGS.DEFAULT_FORMULA,
  SETTINGS.SCENE_CONTROL,
  SETTINGS.TOKEN_HUD,
  SETTINGS.DIRECTORY_BUTTONS,
  SETTINGS.ONBOARDING,
  SETTINGS.JOURNAL_SYNC,
  SETTINGS.ALLOW_PARTIAL_PROVIDER_CONTENT,
  SETTINGS.WINDOW_STATES,
  SETTINGS.ONBOARDING_SEEN
]);

export function buildSettingsExport() {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may export Runyth Hunter's Bestiary settings.");
  return {
    format: "hunters-bestiary-settings",
    moduleVersion: MODULE_VERSION,
    exportedAt: nowIso(),
    settings: Object.fromEntries(PORTABLE_SETTING_KEYS.map(key => [key, clone(globalThis.game.settings.get(MODULE_ID, key))]))
  };
}

export function downloadSettingsExport() {
  const payload = buildSettingsExport();
  downloadJson(`hunters-bestiary-settings-${new Date().toISOString().slice(0, 10)}.json`, payload);
  return payload;
}

export function validateSettingsExport(payload) {
  if (!payload || typeof payload !== "object" || payload.format !== "hunters-bestiary-settings") throw new Error("This is not a Runyth Hunter's Bestiary settings export.");
  if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) throw new Error("The settings export has no settings object.");
  return true;
}

export async function importSettingsExport(payload) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may import Runyth Hunter's Bestiary settings.");
  validateSettingsExport(payload);
  const imported = [];
  for (const key of PORTABLE_SETTING_KEYS) {
    if (!(key in payload.settings)) continue;
    await globalThis.game.settings.set(MODULE_ID, key, clone(payload.settings[key]));
    imported.push(key);
  }
  return { imported };
}

export async function buildExport({ userIds = [game.user.id], includeWorld = false, includeAudit = false } = {}) {
  if (!game.user.isGM) {
    userIds = [game.user.id];
    includeWorld = false;
    includeAudit = false;
  }
  const users = {};
  const selectedUsers = Array.from(new Set(userIds)).map(userId => game.users.get(userId)).filter(Boolean);
  const progressRecords = await Promise.all(selectedUsers.map(async user => ({
    user,
    progress: await getProgress(user.id)
  })));
  for (const { user, progress } of progressRecords) {
    users[user.id] = { id: user.id, name: user.name, progress };
  }
  const payload = {
    format: "hunters-bestiary-export",
    schemaVersion: SCHEMA_VERSION,
    moduleVersion: MODULE_VERSION,
    exportedAt: nowIso(),
    worldId: game.world?.id ?? null,
    exportedBy: { id: game.user.id, name: game.user.name },
    users
  };
  if (includeWorld) {
    payload.world = {
      data: getWorldData(),
      hunts: getHunts()
    };
  }
  if (includeAudit) payload.auditLog = clone(game.settings.get(MODULE_ID, SETTINGS.AUDIT_LOG) ?? []);
  return payload;
}

export async function downloadExport(options = {}) {
  const payload = await buildExport(options);
  const scope = Object.keys(payload.users).length === 1 ? slugify(Object.values(payload.users)[0].name) : "selected-players";
  downloadJson(`hunters-bestiary-${scope}-${new Date().toISOString().slice(0, 10)}.json`, payload);
  return payload;
}

export function validateExport(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Import data must be a JSON object.");
  if (payload.format !== "hunters-bestiary-export") throw new Error("This is not a Runyth Hunter's Bestiary export.");
  if (!payload.users || typeof payload.users !== "object") throw new Error("The export has no user progress section.");
  for (const entry of Object.values(payload.users)) normalizeProgress(entry.progress);
  if (payload.world?.data) validateSeed(payload.world.data);
  return true;
}

export async function importExport(payload, { userMapping = {}, merge = true, importWorld = false } = {}) {
  validateExport(payload);
  const assignments = [];
  for (const [sourceUserId, entry] of Object.entries(payload.users)) {
    let targetUserId = userMapping[sourceUserId] ?? sourceUserId;
    if (!game.user.isGM) targetUserId = game.user.id;
    if (!game.users.get(targetUserId)) continue;
    assignments.push({ targetUserId, entry });
    if (!game.user.isGM) break;
  }
  const importedUsers = (await Promise.all(assignments.map(async ({ targetUserId, entry }) => {
    const incoming = normalizeProgress(entry.progress);
    const result = merge ? mergeProgress(await getProgress(targetUserId), incoming) : incoming;
    await setProgress(targetUserId, result);
    return targetUserId;
  })));
  if (importWorld) {
    if (!game.user.isGM) throw new Error("Only a GM may import world catalogue data and hunts.");
    await Promise.all([
      payload.world?.data ? setWorldData(payload.world.data) : Promise.resolve(),
      payload.world?.hunts ? setHunts(payload.world.hunts) : Promise.resolve()
    ]);
  }
  if (game.user.isGM) await appendAudit({ type: "import", importedUsers, importWorld: Boolean(importWorld) });
  return { importedUsers, importWorld: Boolean(importWorld) };
}

export function mergeProgress(current, incoming) {
  const output = normalizeProgress(current);
  const source = normalizeProgress(incoming);
  output.booksRead = Array.from(new Set([...output.booksRead, ...source.booksRead]));
  output.fieldLog = deduplicate([...output.fieldLog, ...source.fieldLog], "id").slice(-500);
  output.huntCycle = {
    activeMonsterId: output.huntCycle?.activeMonsterId ?? source.huntCycle?.activeMonsterId ?? null,
    deferredMonsterIds: Array.from(new Set([...(output.huntCycle?.deferredMonsterIds ?? []), ...(source.huntCycle?.deferredMonsterIds ?? [])])).slice(0, 20),
    lastCompletedMonsterId: output.huntCycle?.lastCompletedMonsterId ?? source.huntCycle?.lastCompletedMonsterId ?? null,
    lastCompletedHuntId: output.huntCycle?.lastCompletedHuntId ?? source.huntCycle?.lastCompletedHuntId ?? null
  };
  for (const [monsterId, sourceRecord] of Object.entries(source.monsters)) {
    const target = normalizeMonsterProgress(output.monsters[monsterId]);
    const incomingRecord = normalizeMonsterProgress(sourceRecord);
    output.monsters[monsterId] = normalizeMonsterProgress({
      points: Math.max(Number(target.points ?? 0), Number(incomingRecord.points ?? 0)),
      rumorsSucceeded: Math.max(Number(target.rumorsSucceeded ?? 0), Number(incomingRecord.rumorsSucceeded ?? 0)),
      tracksSucceeded: Math.max(Number(target.tracksSucceeded ?? 0), Number(incomingRecord.tracksSucceeded ?? 0)),
      fieldworkUnlocks: Array.from(new Set([...(target.fieldworkUnlocks ?? []), ...(incomingRecord.fieldworkUnlocks ?? [])])),
      unlockedFields: Array.from(new Set([...(target.unlockedFields ?? []), ...(incomingRecord.unlockedFields ?? [])])),
      legacyDisclosure: Boolean(target.legacyDisclosure || incomingRecord.legacyDisclosure),
      notes: deduplicate([...(target.notes ?? []), ...(incomingRecord.notes ?? [])], "id").slice(-100),
      sightings: deduplicate([...(target.sightings ?? []), ...(incomingRecord.sightings ?? [])], "id").slice(-100),
      trophies: deduplicate([...(target.trophies ?? []), ...(incomingRecord.trophies ?? [])], "id").slice(-100),
      discoveries: deduplicate([...(target.discoveries ?? []), ...(incomingRecord.discoveries ?? [])], "id").slice(-200),
      hunts: deduplicate([...(target.hunts ?? []), ...(incomingRecord.hunts ?? [])], "id").slice(-100),
      manualLevel: target.manualLevel ?? incomingRecord.manualLevel ?? null,
      updatedAt: [target.updatedAt, incomingRecord.updatedAt].filter(Boolean).sort().at(-1) ?? nowIso()
    });
  }
  for (const key of Object.keys(output.statistics)) {
    output.statistics[key] = Math.max(Number(output.statistics[key] ?? 0), Number(source.statistics[key] ?? 0));
  }
  output.updatedAt = nowIso();
  return output;
}

function deduplicate(items, key) {
  const seen = new Set();
  return items.filter(item => {
    const value = item?.[key] ?? JSON.stringify(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
