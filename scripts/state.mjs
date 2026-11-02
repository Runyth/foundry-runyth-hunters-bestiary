// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, MODULE_VERSION, SCHEMA_VERSION, SETTINGS, FLAGS } from "./constants.mjs";
import { clone, nowIso, randomId, getUser, boundedInteger } from "./utils.mjs";

const progressMutationQueues = new Map();

export function emptyProgress() {
  return {
    schemaVersion: SCHEMA_VERSION,
    moduleVersion: MODULE_VERSION,
    monsters: {},
    booksRead: [],
    fieldLog: [],
    huntCycle: { activeMonsterId: null, deferredMonsterIds: [], lastCompletedMonsterId: null, lastCompletedHuntId: null },
    statistics: {
      checksAttempted: 0,
      checksSucceeded: 0,
      huntsJoined: 0,
      huntsResolved: 0
    },
    updatedAt: nowIso()
  };
}

export function normalizeProgress(input) {
  const base = emptyProgress();
  if (!input || typeof input !== "object") return base;
  const output = {
    ...base,
    ...clone(input),
    monsters: clone(input.monsters ?? {}),
    booksRead: Array.from(new Set(input.booksRead ?? [])),
    fieldLog: Array.isArray(input.fieldLog) ? clone(input.fieldLog).slice(-500) : [],
    huntCycle: normalizeHuntCycle(input.huntCycle),
    statistics: { ...base.statistics, ...(input.statistics ?? {}) },
    schemaVersion: SCHEMA_VERSION,
    moduleVersion: MODULE_VERSION,
    updatedAt: input.updatedAt ?? nowIso()
  };
  for (const [monsterId, record] of Object.entries(output.monsters)) {
    output.monsters[monsterId] = normalizeMonsterProgress(record);
  }
  // Backfill successful track totals from the authoritative legacy field log.
  const legacyTrackCounts = new Map();
  for (const entry of output.fieldLog) {
    if (entry?.type !== "knowledge" || entry?.source !== "track" || !entry?.monsterId) continue;
    legacyTrackCounts.set(entry.monsterId, (legacyTrackCounts.get(entry.monsterId) ?? 0) + 1);
  }
  for (const [monsterId, count] of legacyTrackCounts) {
    const record = output.monsters[monsterId] ?? normalizeMonsterProgress();
    record.tracksSucceeded = Math.max(record.tracksSucceeded, count);
    output.monsters[monsterId] = record;
  }
  return output;
}

export function normalizeMonsterProgress(input = null) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const existedBeforeDisclosureModel = Boolean(input && typeof input === "object" && !Array.isArray(input) && !Array.isArray(input.unlockedFields));
  return {
    points: boundedInteger(source.points, 0, 9999, 0),
    rumorsSucceeded: boundedInteger(source.rumorsSucceeded, 0, 9999, 0),
    tracksSucceeded: boundedInteger(source.tracksSucceeded, 0, 9999, 0),
    fieldworkUnlocks: Array.from(new Set(Array.isArray(source.fieldworkUnlocks) ? source.fieldworkUnlocks.map(String) : [])).slice(0, 20),
    unlockedFields: Array.from(new Set(Array.isArray(source.unlockedFields) ? source.unlockedFields.map(String) : [])).slice(0, 100),
    legacyDisclosure: source.legacyDisclosure == null ? existedBeforeDisclosureModel : Boolean(source.legacyDisclosure),
    sightings: Array.isArray(source.sightings) ? clone(source.sightings).slice(-100) : [],
    notes: Array.isArray(source.notes) ? clone(source.notes).slice(-100) : [],
    trophies: Array.isArray(source.trophies) ? clone(source.trophies).slice(-100) : [],
    discoveries: Array.isArray(source.discoveries) ? clone(source.discoveries).slice(-200) : [],
    hunts: Array.isArray(source.hunts) ? clone(source.hunts).slice(-100) : [],
    manualLevel: Number.isInteger(source.manualLevel) ? Math.min(5, Math.max(0, source.manualLevel)) : null,
    updatedAt: source.updatedAt ?? nowIso()
  };
}

function normalizeHuntCycle(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    activeMonsterId: source.activeMonsterId ? String(source.activeMonsterId) : null,
    deferredMonsterIds: Array.from(new Set(Array.isArray(source.deferredMonsterIds) ? source.deferredMonsterIds.map(String).filter(Boolean) : [])).slice(0, 20),
    lastCompletedMonsterId: source.lastCompletedMonsterId ? String(source.lastCompletedMonsterId) : null,
    lastCompletedHuntId: source.lastCompletedHuntId ? String(source.lastCompletedHuntId) : null
  };
}

export function knowledgeLevel(points, levels, manualLevel = null) {
  if (Number.isInteger(manualLevel)) return Math.min(5, Math.max(0, manualLevel));
  const source = Array.isArray(levels) ? levels : [];
  let ordered = source;
  for (let index = 1; index < source.length; index += 1) {
    if (Number(source[index - 1]?.threshold) > Number(source[index]?.threshold)) {
      ordered = [...source].sort((a, b) => Number(a.threshold) - Number(b.threshold));
      break;
    }
  }
  let level = 0;
  for (const entry of ordered) {
    if (points >= entry.threshold) level = entry.level;
  }
  return level;
}

export async function getProgress(userId = globalThis.game?.user?.id) {
  const user = getUser(userId);
  if (!user) return emptyProgress();
  return normalizeProgress(user.getFlag(MODULE_ID, FLAGS.PROGRESS));
}

export async function setProgress(userId, progress) {
  const user = getUser(userId);
  if (!user) throw new Error(`Unknown user: ${userId}`);
  if (!globalThis.game?.user?.isGM && userId !== globalThis.game?.user?.id) {
    throw new Error("Players may only modify their own bestiary progress.");
  }
  const normalized = normalizeProgress(progress);
  normalized.updatedAt = nowIso();
  await user.setFlag(MODULE_ID, FLAGS.PROGRESS, normalized);
  return normalized;
}

export async function mutateProgress(userId, mutator) {
  const queueKey = String(userId);
  const previous = progressMutationQueues.get(queueKey) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const progress = await getProgress(userId);
    const result = await mutator(progress) ?? progress;
    return setProgress(userId, result);
  });
  progressMutationQueues.set(queueKey, current);
  void current.finally(() => {
    if (progressMutationQueues.get(queueKey) === current) progressMutationQueues.delete(queueKey);
  });
  return current;
}

function ensureMonster(progress, monsterId) {
  progress.monsters[monsterId] = normalizeMonsterProgress(progress.monsters[monsterId]);
  return progress.monsters[monsterId];
}

export async function awardKnowledge(userId, monsterId, points, source, detail = "") {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    const amount = boundedInteger(points, -999, 999, 0);
    record.points = Math.max(0, record.points + amount);
    record.discoveries.push({ id: randomId(), source, detail: String(detail).slice(0, 1000), points: amount, at: nowIso() });
    record.updatedAt = nowIso();
    progress.fieldLog.push({ id: randomId(), type: "knowledge", monsterId, source, detail: String(detail).slice(0, 1000), points: amount, at: nowIso() });
    return progress;
  });
}

export async function recordRumorSuccess(userId, monsterId, { points = 1, detail = "", setActiveQuarry = true } = {}) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    const amount = boundedInteger(points, 0, 999, 1);
    record.points = Math.max(0, record.points + amount);
    record.rumorsSucceeded = Math.max(0, Number(record.rumorsSucceeded ?? 0) + 1);
    record.discoveries.push({ id: randomId(), source: "rumor", detail: String(detail).slice(0, 1000), points: amount, at: nowIso() });
    record.updatedAt = nowIso();
    progress.fieldLog.push({ id: randomId(), type: "knowledge", monsterId, source: "rumor", detail: String(detail).slice(0, 1000), points: amount, at: nowIso() });
    if (setActiveQuarry && !progress.huntCycle.activeMonsterId) progress.huntCycle.activeMonsterId = monsterId;
    return progress;
  });
}

export async function recordTrackSuccess(userId, monsterId, { points = 1, detail = "" } = {}) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    const amount = boundedInteger(points, 0, 999, 1);
    record.points = Math.max(0, record.points + amount);
    record.tracksSucceeded = Math.max(0, Number(record.tracksSucceeded ?? 0) + 1);
    record.discoveries.push({ id: randomId(), source: "track", detail: String(detail).slice(0, 1000), points: amount, at: nowIso() });
    record.updatedAt = nowIso();
    progress.fieldLog.push({ id: randomId(), type: "knowledge", monsterId, source: "track", detail: String(detail).slice(0, 1000), points: amount, at: nowIso() });
    return progress;
  });
}

export async function unlockFieldworkCapabilities(userId, monsterId, capabilities = [], source = "fieldwork-unlock") {
  const requested = Array.from(new Set((capabilities ?? []).map(String).filter(Boolean))).slice(0, 20);
  if (!requested.length) return getProgress(userId);
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    const unlocked = new Set(record.fieldworkUnlocks ?? []);
    for (const capability of requested) {
      if (unlocked.has(capability)) continue;
      unlocked.add(capability);
      record.discoveries.push({ id: randomId(), source, detail: capability, points: 0, capability, at: nowIso() });
    }
    record.fieldworkUnlocks = [...unlocked];
    record.updatedAt = nowIso();
    return progress;
  });
}

export async function deferActiveQuarry(userId, monsterId, { maxDeferred = 2 } = {}) {
  return mutateProgress(userId, progress => {
    const id = String(monsterId ?? "");
    if (!id || progress.huntCycle.activeMonsterId !== id) throw new Error("Only the active quarry can be deferred.");
    const deferred = Array.from(new Set(progress.huntCycle.deferredMonsterIds ?? [])).filter(entry => entry !== id);
    if (deferred.length >= Math.max(0, Number(maxDeferred) || 0)) throw new Error("The deferred-quarry limit has been reached.");
    deferred.push(id);
    progress.huntCycle.activeMonsterId = null;
    progress.huntCycle.deferredMonsterIds = deferred;
    progress.fieldLog.push({ id: randomId(), type: "quarry-deferred", monsterId: id, at: nowIso() });
    return progress;
  });
}

export async function activateDeferredQuarry(userId, monsterId, { maxDeferred = 2 } = {}) {
  return mutateProgress(userId, progress => {
    const id = String(monsterId ?? "");
    const deferred = Array.from(new Set(progress.huntCycle.deferredMonsterIds ?? []));
    if (!deferred.includes(id)) throw new Error("That quarry is not deferred.");
    const current = progress.huntCycle.activeMonsterId;
    const nextDeferred = deferred.filter(entry => entry !== id);
    if (current && current !== id) {
      if (nextDeferred.length >= Math.max(0, Number(maxDeferred) || 0)) throw new Error("The deferred-quarry limit has been reached.");
      nextDeferred.push(current);
    }
    progress.huntCycle.activeMonsterId = id;
    progress.huntCycle.deferredMonsterIds = nextDeferred;
    progress.fieldLog.push({ id: randomId(), type: "quarry-reactivated", monsterId: id, detail: current ?? "", at: nowIso() });
    return progress;
  });
}

export async function unlockMonsterFields(userId, monsterId, fields = [], source = "discovery") {
  const requested = Array.from(new Set((fields ?? []).map(String).filter(Boolean))).slice(0, 100);
  if (!requested.length) return getProgress(userId);
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    const unlocked = new Set(record.unlockedFields ?? []);
    for (const field of requested) {
      if (unlocked.has(field)) continue;
      unlocked.add(field);
      record.discoveries.push({ id: randomId(), source, detail: field, points: 0, field, at: nowIso() });
    }
    record.unlockedFields = [...unlocked];
    record.updatedAt = nowIso();
    return progress;
  });
}

export async function setActiveRumorQuarry(userId, monsterId) {
  return mutateProgress(userId, progress => {
    const next = monsterId ? String(monsterId) : null;
    progress.huntCycle.activeMonsterId = next;
    if (next) progress.huntCycle.deferredMonsterIds = (progress.huntCycle.deferredMonsterIds ?? []).filter(id => id !== next);
    return progress;
  });
}

export async function setManualKnowledgeLevel(userId, monsterId, manualLevel) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    record.manualLevel = manualLevel === null ? null : boundedInteger(manualLevel, 0, 5, 0);
    record.updatedAt = nowIso();
    return progress;
  });
}

export async function addPersonalNote(userId, monsterId, text) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    record.notes.push({ id: randomId(), text: String(text).trim().slice(0, 5000), at: nowIso(), authorId: globalThis.game?.user?.id });
    record.updatedAt = nowIso();
    progress.fieldLog.push({ id: randomId(), type: "note", monsterId, detail: String(text).trim().slice(0, 500), at: nowIso() });
    return progress;
  });
}

export async function removePersonalNote(userId, monsterId, noteId) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    record.notes = record.notes.filter(note => note.id !== noteId);
    record.updatedAt = nowIso();
    return progress;
  });
}

export async function addSighting(userId, monsterId, data = {}) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    record.sightings.push({
      id: data.id ?? randomId(),
      sceneId: data.sceneId ?? globalThis.canvas?.scene?.id ?? null,
      location: String(data.location ?? globalThis.canvas?.scene?.name ?? "").slice(0, 300),
      detail: String(data.detail ?? "").slice(0, 2000),
      at: data.at ?? nowIso()
    });
    record.updatedAt = nowIso();
    progress.fieldLog.push({ id: randomId(), type: "sighting", monsterId, detail: String(data.detail ?? "").slice(0, 500), at: nowIso() });
    return progress;
  });
}

export async function addTrophy(userId, monsterId, data = {}) {
  return mutateProgress(userId, progress => {
    const record = ensureMonster(progress, monsterId);
    record.trophies.push({
      id: data.id ?? randomId(),
      name: String(data.name ?? "Trophy").slice(0, 200),
      detail: String(data.detail ?? "").slice(0, 2000),
      quantity: boundedInteger(data.quantity, 1, 999, 1),
      at: data.at ?? nowIso()
    });
    record.updatedAt = nowIso();
    progress.fieldLog.push({ id: randomId(), type: "trophy", monsterId, detail: String(data.name ?? "Trophy").slice(0, 500), at: nowIso() });
    return progress;
  });
}

export async function markBookRead(userId, bookId) {
  return mutateProgress(userId, progress => {
    if (!progress.booksRead.includes(bookId)) progress.booksRead.push(bookId);
    progress.fieldLog.push({ id: randomId(), type: "book", bookId, at: nowIso() });
    return progress;
  });
}


export function applyHuntProgress(progressInput, hunt) {
  const progress = normalizeProgress(progressInput);
  if (!hunt?.id || !hunt?.monsterId) return progress;
  const record = ensureMonster(progress, hunt.monsterId);
  let entry = record.hunts.find(item => item.id === hunt.id);
  if (!entry) {
    entry = {
      id: hunt.id,
      title: String(hunt.title ?? "Untitled Hunt").slice(0, 200),
      status: hunt.status ?? "active",
      outcome: hunt.outcome ?? null,
      joinedAt: nowIso(),
      resolvedAt: null,
      updatedAt: nowIso()
    };
    record.hunts.push(entry);
    progress.statistics.huntsJoined += 1;
  }
  entry.title = String(hunt.title ?? entry.title ?? "Untitled Hunt").slice(0, 200);
  entry.status = hunt.status ?? entry.status ?? "active";
  entry.outcome = hunt.outcome ?? entry.outcome ?? null;
  entry.updatedAt = nowIso();
  if (hunt.status === "resolved" && !entry.resolvedAt) {
    entry.resolvedAt = nowIso();
    progress.huntCycle.deferredMonsterIds = (progress.huntCycle.deferredMonsterIds ?? []).filter(id => id !== hunt.monsterId);
    progress.statistics.huntsResolved += 1;
    if (progress.huntCycle.activeMonsterId === hunt.monsterId) {
      progress.huntCycle.lastCompletedMonsterId = hunt.monsterId;
      progress.huntCycle.lastCompletedHuntId = hunt.id;
      progress.huntCycle.activeMonsterId = null;
    }
  }
  if (hunt.status === "failed" && hunt.outcome === "escaped" && !progress.huntCycle.activeMonsterId) {
    progress.huntCycle.deferredMonsterIds = (progress.huntCycle.deferredMonsterIds ?? []).filter(id => id !== hunt.monsterId);
    progress.huntCycle.activeMonsterId = hunt.monsterId;
  }
  record.updatedAt = nowIso();
  return progress;
}

export async function recordHuntProgress(userId, hunt) {
  if (!getUser(userId)) return null;
  return mutateProgress(userId, progress => applyHuntProgress(progress, hunt));
}

export async function updateStatistics(userId, changes = {}) {
  return mutateProgress(userId, progress => {
    for (const [key, amount] of Object.entries(changes)) {
      if (!(key in progress.statistics)) continue;
      progress.statistics[key] = Math.max(0, Number(progress.statistics[key] ?? 0) + Number(amount ?? 0));
    }
    return progress;
  });
}

export function getWorldData() {
  return clone(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.WORLD_DATA) ?? {});
}

export async function setWorldData(data) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may change the world catalogue.");
  return globalThis.game.settings.set(MODULE_ID, SETTINGS.WORLD_DATA, clone(data));
}

export function getHunts() {
  return clone(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.HUNTS) ?? []);
}

export async function setHunts(hunts) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may change hunts.");
  return globalThis.game.settings.set(MODULE_ID, SETTINGS.HUNTS, clone(hunts));
}

let auditWriteQueue = Promise.resolve();

export function appendAudit(entry) {
  if (!globalThis.game?.user?.isGM) return Promise.resolve();
  const payload = clone(entry);
  auditWriteQueue = auditWriteQueue.catch(() => undefined).then(async () => {
    const current = clone(globalThis.game.settings.get(MODULE_ID, SETTINGS.AUDIT_LOG) ?? []);
    current.push({ id: randomId(), at: nowIso(), actorUserId: globalThis.game.user.id, ...payload });
    await globalThis.game.settings.set(MODULE_ID, SETTINGS.AUDIT_LOG, current.slice(-1000));
  });
  return auditWriteQueue;
}
