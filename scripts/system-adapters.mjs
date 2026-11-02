// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, FLAGS } from "./constants.mjs";
import { clone, localizeText, nowIso, slugify } from "./utils.mjs";
import { getWorldData, appendAudit } from "./state.mjs";

const adapters = new Map();
const OWNERSHIP_NONE = 0;

const CAPABILITY_METHODS = Object.freeze({
  actorProvisioning: "buildActorData",
  fieldChecks: "rollFieldCheck",
  harvestItems: "buildHarvestItemData",
  encounterProfiles: "buildEncounterProfile"
});

export function registerSystemAdapter(adapterId, adapter) {
  if (!String(adapterId ?? "").trim()) throw new Error("A system adapter id is required.");
  const id = slugify(adapterId);
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) throw new Error("A system adapter object is required.");
  const systemId = String(adapter.systemId ?? "").trim();
  if (!systemId) throw new Error("A system adapter must declare systemId.");

  const capabilities = normalizeCapabilities(adapter);
  if (!Object.values(capabilities).some(Boolean)) {
    throw new Error("A system adapter must implement at least one supported capability.");
  }

  const registration = {
    ...adapter,
    adapterId: id,
    systemId,
    label: String(adapter.label ?? id),
    version: String(adapter.version ?? "0.0.0"),
    capabilities
  };
  adapters.set(id, registration);
  globalThis.Hooks?.callAll?.(`${MODULE_ID}.systemAdapterChanged`, {
    type: "registered",
    adapter: describeAdapter(id, registration)
  });
  return describeAdapter(id, registration);
}

export function unregisterSystemAdapter(adapterId) {
  const id = slugify(adapterId);
  const removed = adapters.delete(id);
  if (removed) globalThis.Hooks?.callAll?.(`${MODULE_ID}.systemAdapterChanged`, { type: "unregistered", adapterId: id });
  return removed;
}

export function getSystemAdapters() {
  return [...adapters.entries()].map(([id, adapter]) => describeAdapter(id, adapter));
}

export function getActiveSystemAdapter(systemId = globalThis.game?.system?.id) {
  if (!systemId) return null;
  const candidates = [...adapters.entries()]
    .filter(([, adapter]) => adapter.systemId === systemId)
    .sort((a, b) => Number(Boolean(b[1].primary)) - Number(Boolean(a[1].primary)) || a[0].localeCompare(b[0]));
  if (!candidates.length) return null;
  const [adapterId, adapter] = candidates[0];
  return { adapterId, adapter };
}

export function getActiveSystemAdapterDescriptor(systemId = globalThis.game?.system?.id) {
  const active = getActiveSystemAdapter(systemId);
  return active ? describeAdapter(active.adapterId, active.adapter) : null;
}

export function systemActorAvailability(monster, { systemId = globalThis.game?.system?.id } = {}) {
  const active = getActiveSystemAdapter(systemId);
  if (!active?.adapter?.capabilities?.actorProvisioning) return null;
  if (!supportsMonster(active.adapter, monster)) return null;
  return {
    status: monster?.actorUuid ? "linked" : "available",
    available: true,
    sourceMode: "system-adapter",
    adapterId: active.adapterId,
    systemId
  };
}

export async function buildSystemActorData(monster, { source = null, systemId = globalThis.game?.system?.id } = {}) {
  const active = getActiveSystemAdapter(systemId);
  if (!active?.adapter?.capabilities?.actorProvisioning) throw new Error(`No Actor-provisioning system adapter is registered for '${systemId}'.`);
  if (!supportsMonster(active.adapter, monster)) throw new Error(`System adapter '${active.adapterId}' does not support monster '${monster?.id ?? "unknown"}'.`);
  const data = await active.adapter.buildActorData(buildContext({ monster, source, adapterId: active.adapterId, systemId }));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`System adapter '${active.adapterId}' did not return Actor data.`);
  return clone(data);
}

export async function rollFieldCheckWithSystemAdapter(context) {
  const active = getActiveSystemAdapter();
  if (!active?.adapter?.capabilities?.fieldChecks) return null;
  const result = await active.adapter.rollFieldCheck({
    ...clone(context),
    adapterId: active.adapterId,
    systemId: active.adapter.systemId
  });
  if (result == null) return null;
  if (!result.roll || !Number.isFinite(Number(result.total ?? result.roll.total))) {
    throw new Error(`System adapter '${active.adapterId}' returned an invalid field-check result.`);
  }
  return {
    ...result,
    total: Number(result.total ?? result.roll.total),
    modifier: Number(result.modifier ?? context.modifier ?? 0),
    skillLabel: result.skillLabel ? String(result.skillLabel) : null,
    adapterId: active.adapterId
  };
}

export async function buildHarvestItemData(monsterId, options = {}) {
  const monster = getWorldData().monsters?.find(entry => entry.id === monsterId);
  if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
  const active = getActiveSystemAdapter();
  if (!active?.adapter?.capabilities?.harvestItems) throw new Error(`No harvest-Item adapter is registered for '${globalThis.game?.system?.id ?? "unknown"}'.`);
  const records = await active.adapter.buildHarvestItemData(buildContext({
    monster,
    adapterId: active.adapterId,
    systemId: active.adapter.systemId,
    options
  }));
  const normalized = Array.isArray(records) ? records : records ? [records] : [];
  for (const record of normalized) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`System adapter '${active.adapterId}' returned invalid Item data.`);
    if (!String(record.name ?? "").trim()) throw new Error(`System adapter '${active.adapterId}' returned an Item without a name.`);
    if (!String(record.type ?? "").trim()) throw new Error(`System adapter '${active.adapterId}' returned an Item without a type.`);
  }
  return clone(normalized);
}

export async function createHarvestItems({ monsterId, folderName = "Runyth Hunter's Bestiary: Harvest Items", ownership = null, options = {} } = {}) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may create harvest Items.");
  const records = await buildHarvestItemData(monsterId, options);
  if (!records.length) return [];
  const ItemClass = globalThis.CONFIG?.Item?.documentClass ?? globalThis.Item;
  if (!ItemClass?.createDocuments) throw new Error("Foundry Item document class is unavailable.");
  const folder = await ensureItemFolder(folderName);
  const data = records.map(record => prepareItemData(record, monsterId, folder.id, ownership));
  const created = await ItemClass.createDocuments(data, { renderSheet: false });
  await appendAudit({ type: "harvest-items-create", monsterId, count: created.length, adapterId: getActiveSystemAdapter()?.adapterId ?? null });
  return created;
}

export async function getEncounterProfile(monsterId, options = {}) {
  const monster = getWorldData().monsters?.find(entry => entry.id === monsterId);
  if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
  const active = getActiveSystemAdapter();
  if (!active?.adapter?.capabilities?.encounterProfiles) return null;
  const profile = await active.adapter.buildEncounterProfile(buildContext({
    monster,
    adapterId: active.adapterId,
    systemId: active.adapter.systemId,
    options
  }));
  return profile == null ? null : clone(profile);
}

function normalizeCapabilities(adapter) {
  const declared = adapter.capabilities && typeof adapter.capabilities === "object" ? adapter.capabilities : {};
  return Object.fromEntries(Object.entries(CAPABILITY_METHODS).map(([capability, method]) => [
    capability,
    Boolean(declared[capability] ?? (typeof adapter[method] === "function")) && typeof adapter[method] === "function"
  ]));
}

function supportsMonster(adapter, monster) {
  if (typeof adapter.supportsMonster !== "function") return true;
  try {
    return adapter.supportsMonster(clone(monster)) !== false;
  } catch (error) {
    console.warn(`${MODULE_ID} | System adapter '${adapter.adapterId ?? adapter.label}' supportsMonster failed`, error);
    return false;
  }
}

function buildContext({ monster, source = null, adapterId, systemId, options = {} }) {
  return {
    monster: clone(monster),
    source: clone(source),
    options: clone(options),
    adapterId,
    systemId,
    language: globalThis.game?.i18n?.lang ?? "en",
    localizedName: localizeText(monster?.name),
    moduleId: MODULE_ID
  };
}

function describeAdapter(adapterId, adapter) {
  return {
    adapterId,
    systemId: adapter.systemId,
    label: adapter.label,
    version: adapter.version,
    primary: Boolean(adapter.primary),
    capabilities: clone(adapter.capabilities)
  };
}

async function ensureItemFolder(name) {
  const existing = globalThis.game?.folders?.find(folder => folder.name === name && folder.type === "Item");
  if (existing) return existing;
  const FolderClass = globalThis.CONFIG?.Folder?.documentClass ?? globalThis.Folder;
  if (!FolderClass?.create) throw new Error("Foundry Folder document class is unavailable.");
  return FolderClass.create({ name, type: "Item", sorting: "a", color: "#6d4b2f" });
}

function prepareItemData(input, monsterId, folderId, ownership) {
  const data = clone(input);
  delete data._id;
  delete data._stats;
  delete data._key;
  data.folder = folderId;
  data.ownership ??= ownership ?? { default: OWNERSHIP_NONE };
  data.flags ??= {};
  data.flags[MODULE_ID] = {
    ...(data.flags[MODULE_ID] ?? {}),
    [FLAGS.SOURCE]: `harvest:${monsterId}`,
    monsterId,
    provisionedAt: nowIso()
  };
  return data;
}
