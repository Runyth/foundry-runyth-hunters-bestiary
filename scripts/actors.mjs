import { MODULE_ID, FLAGS } from "./constants.mjs";
import { clone, localizeText, nowIso, slugify } from "./utils.mjs";
import { getWorldData, setWorldData, appendAudit } from "./state.mjs";
import { validateActorSource } from "./providers.mjs";
import { systemActorAvailability, buildSystemActorData } from "./system-adapters.mjs";
import { applyMonsterImageToActorData } from "./images.mjs";
import { mapWithConcurrency } from "./ui-toolkit.mjs";

const actorAdapters = new Map();
const OWNERSHIP_NONE = 0;

export function registerActorAdapter(adapterId, adapter) {
  const id = slugify(adapterId);
  if (!id) throw new Error("An Actor adapter id is required.");
  if (!adapter || typeof adapter.buildActorData !== "function") {
    throw new Error("An Actor adapter must provide buildActorData(context).");
  }
  actorAdapters.set(id, adapter);
  return { adapterId: id, systemId: adapter.systemId ?? null };
}

export function unregisterActorAdapter(adapterId) {
  return actorAdapters.delete(slugify(adapterId));
}

export function getActorAdapters() {
  return [...actorAdapters.entries()].map(([adapterId, adapter]) => ({
    adapterId,
    systemId: adapter.systemId ?? null,
    label: adapter.label ?? adapterId
  }));
}

export function actorProvisioningStatus(monster, { systemId = globalThis.game?.system?.id } = {}) {
  const source = monster?.actorSource;
  const validation = validateActorSource(source);
  if (!validation.complete) return { status: "invalid", available: false, errors: validation.errors };
  if (source.mode === "none") {
    return systemActorAvailability(monster, { systemId })
      ?? { status: "not-required", available: false, reason: source.reason };
  }
  if (source.systemId && source.systemId !== systemId) {
    return { status: "incompatible-system", available: false, expectedSystemId: source.systemId, systemId };
  }
  if (source.mode === "adapter" && !actorAdapters.has(slugify(source.adapterId))) {
    return { status: "missing-adapter", available: false, adapterId: slugify(source.adapterId) };
  }
  return { status: monster.actorUuid ? "linked" : "available", available: true };
}

export async function provisionActors({ monsterIds = null, updateExisting = false, folderName = "Hunter's Bestiary: Quarry Actors", onProgress = null } = {}) {
  if (!game.user.isGM) throw new Error("Only a GM may provision quarry Actors.");
  const world = getWorldData();
  const selectedIds = monsterIds ? new Set(monsterIds) : null;
  const result = {
    created: [],
    updated: [],
    linked: [],
    skipped: [],
    failed: []
  };

  const selectedMonsters = (world.monsters ?? []).filter(monster => !selectedIds || selectedIds.has(monster.id));
  const managedActorsByMonsterId = new Map();
  for (const actor of game.actors?.contents ?? []) {
    const monsterId = actor.getFlag?.(MODULE_ID, FLAGS.ACTOR_MONSTER_ID);
    if (monsterId) managedActorsByMonsterId.set(monsterId, actor);
  }
  let folderPromise = null;
  let current = 0;
  const getFolder = () => (folderPromise ??= ensureActorFolder(folderName));
  const reportProgress = monster => onProgress?.({
    current,
    total: selectedMonsters.length,
    label: localizeText(monster.name),
    phase: updateExisting ? "update" : "import",
    success: result.created.length + result.updated.length + result.linked.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
    errors: result.failed
  });

  await mapWithConcurrency(selectedMonsters, async monster => {
    const status = actorProvisioningStatus(monster);
    if (!status.available) {
      result.skipped.push({ monsterId: monster.id, status: status.status, detail: status.reason ?? status.adapterId ?? status.expectedSystemId ?? "" });
      return;
    }

    try {
      const directWorldActor = await resolveDirectWorldActor(monster);
      if (directWorldActor) {
        await directWorldActor.update({
          [`flags.${MODULE_ID}.${FLAGS.ACTOR_MONSTER_ID}`]: monster.id,
          [`flags.${MODULE_ID}.${FLAGS.ACTOR_PROVIDER_ID}`]: monster.providerId ?? "core"
        });
        monster.actorUuid = directWorldActor.uuid;
        result.linked.push({ monsterId: monster.id, actorUuid: directWorldActor.uuid });
        return;
      }

      const existing = await findManagedActor(monster, managedActorsByMonsterId);
      if (existing && !updateExisting) {
        monster.actorUuid = existing.uuid;
        result.linked.push({ monsterId: monster.id, actorUuid: existing.uuid });
        return;
      }

      const [sourceData, folder] = await Promise.all([resolveActorData(monster), getFolder()]);
      const actorData = prepareActorData(monster, sourceData, folder.id, existing, world);
      let actor;
      if (existing) {
        await updateManagedActor(existing, actorData);
        actor = existing;
        result.updated.push({ monsterId: monster.id, actorUuid: actor.uuid });
      } else {
        const ActorClass = globalThis.CONFIG?.Actor?.documentClass ?? globalThis.Actor;
        if (!ActorClass?.create) throw new Error("Foundry Actor document class is unavailable.");
        actor = await ActorClass.create(actorData, { renderSheet: false, render: false });
        result.created.push({ monsterId: monster.id, actorUuid: actor.uuid });
      }
      monster.actorUuid = actor.uuid;
      managedActorsByMonsterId.set(monster.id, actor);
    } catch (error) {
      result.failed.push({ monsterId: monster.id, message: error.message, error });
    }
  }, {
    concurrency: 3,
    yieldEvery: 6,
    onSettled: (_value, index) => {
      current += 1;
      reportProgress(selectedMonsters[index]);
    }
  });

  await Promise.all([
    setWorldData(world),
    appendAudit({
      type: "actor-provision",
      updateExisting,
      created: result.created.length,
      updated: result.updated.length,
      linked: result.linked.length,
      skipped: result.skipped.length,
      failed: result.failed.length
    })
  ]);
  Hooks.callAll(`${MODULE_ID}.catalogChanged`, { type: "actor-provision", result: clone(result) });
  return result;
}

async function resolveDirectWorldActor(monster) {
  if (monster.actorSource?.mode !== "uuid") return null;
  const document = await fromUuid(monster.actorSource.uuid).catch(() => null);
  if (!document || document.documentName !== "Actor" || document.pack) return null;
  return document;
}

async function resolveActorData(monster) {
  const source = monster.actorSource;
  if (source.mode === "none") return buildSystemActorData(monster, { source });
  if (source.mode === "data") return clone(source.data);
  if (source.mode === "uuid") {
    const document = await fromUuid(source.uuid);
    if (!document || document.documentName !== "Actor") throw new Error(`Actor source UUID did not resolve to an Actor: ${source.uuid}`);
    const data = document.toObject();
    delete data._id;
    return data;
  }
  if (source.mode === "adapter") {
    const adapterId = slugify(source.adapterId);
    const adapter = actorAdapters.get(adapterId);
    if (!adapter) throw new Error(`Actor adapter is not registered: ${adapterId}`);
    if (adapter.systemId && adapter.systemId !== game.system.id) throw new Error(`Actor adapter '${adapterId}' supports '${adapter.systemId}', not '${game.system.id}'.`);
    if (typeof adapter.validateSource === "function") {
      const validation = await adapter.validateSource({ monster: clone(monster), source: clone(source), systemId: game.system.id });
      if (validation === false) throw new Error(`Actor adapter '${adapterId}' rejected the source data.`);
      if (typeof validation === "string") throw new Error(validation);
    }
    const data = await adapter.buildActorData({ monster: clone(monster), source: clone(source), systemId: game.system.id });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Actor adapter '${adapterId}' did not return Actor data.`);
    return clone(data);
  }
  throw new Error(`Actor source mode '${source.mode}' cannot be provisioned.`);
}

function prepareActorData(monster, input, folderId, existing, worldData) {
  const data = applyMonsterImageToActorData(monster, input, worldData);
  delete data._id;
  delete data._stats;
  delete data._key;
  delete data.pack;
  const supportedTypes = globalThis.game?.system?.documentTypes?.Actor ?? [];
  if (!data.type) throw new Error("Actor data must define a system-supported Actor type.");
  if (supportedTypes.length && !supportedTypes.includes(data.type)) {
    throw new Error(`Actor type '${data.type}' is not supported by system '${game.system.id}'.`);
  }

  data.name = String(data.name ?? localizeText(monster.name)).trim();
  if (!data.name) throw new Error("Actor data requires a name.");
  data.folder = existing?.folder?.id ?? existing?.folder ?? folderId;
  data.ownership = existing?.ownership ?? data.ownership ?? { default: OWNERSHIP_NONE };
  data.flags = clone(data.flags ?? {});
  data.flags[MODULE_ID] = {
    ...(data.flags[MODULE_ID] ?? {}),
    [FLAGS.ACTOR_MONSTER_ID]: monster.id,
    [FLAGS.SOURCE]: `actor:${monster.id}`,
    [FLAGS.ACTOR_PROVIDER_ID]: monster.providerId ?? "core",
    provisionedAt: nowIso()
  };
  if (Object.hasOwn(data, "items")) {
    data.items = (data.items ?? []).map((item, index) => prepareManagedEmbeddedData(item, monster, "Item", index));
  }
  if (Object.hasOwn(data, "effects")) {
    data.effects = (data.effects ?? []).map((effect, index) => prepareManagedEmbeddedData(effect, monster, "ActiveEffect", index));
  }
  return data;
}

async function updateManagedActor(actor, actorData) {
  const updateData = clone(actorData);
  const hasItems = Object.hasOwn(updateData, "items");
  const hasEffects = Object.hasOwn(updateData, "effects");
  const items = hasItems ? clone(updateData.items ?? []) : null;
  const effects = hasEffects ? clone(updateData.effects ?? []) : null;
  delete updateData.items;
  delete updateData.effects;
  await actor.update({ ...updateData, _id: actor.id });

  if (hasItems) await reconcileManagedEmbedded(actor, "Item", items);
  if (hasEffects) await reconcileManagedEmbedded(actor, "ActiveEffect", effects);
}

export async function reconcileManagedEmbedded(actor, documentName, incoming) {
  const collection = documentName === "Item" ? actor.items : actor.effects;
  const existing = collection?.contents ?? Array.from(collection ?? []);
  const managed = existing.filter(document => isManagedEmbeddedDocument(document, { actor, documentName }));
  const remaining = new Map(managed.map(document => [managedEmbeddedKey(document), document]));
  const legacyBySignature = new Map();
  for (const document of managed) {
    const signature = legacyEmbeddedSignature(document);
    const bucket = legacyBySignature.get(signature) ?? [];
    bucket.push(document);
    legacyBySignature.set(signature, bucket);
  }
  const updates = [];
  const creates = [];

  for (const raw of incoming.map(cleanEmbeddedData)) {
    const key = managedEmbeddedKey(raw);
    let current = remaining.get(key);
    if (!current) {
      const bucket = legacyBySignature.get(legacyEmbeddedSignature(raw));
      current = bucket?.find(document => remaining.has(managedEmbeddedKey(document)));
      if (current) remaining.delete(managedEmbeddedKey(current));
    } else {
      remaining.delete(key);
    }
    if (current) updates.push({ ...raw, _id: current.id });
    else creates.push(raw);
  }

  if (updates.length) await actor.updateEmbeddedDocuments(documentName, updates);
  const deleteIds = [...remaining.values()].map(document => document.id);
  if (deleteIds.length) await actor.deleteEmbeddedDocuments(documentName, deleteIds);
  if (creates.length) await actor.createEmbeddedDocuments(documentName, creates);
}

function prepareManagedEmbeddedData(input, monster, documentName, index) {
  const data = cleanEmbeddedData(input);
  data.flags = clone(data.flags ?? {});
  const existing = data.flags[MODULE_ID] ?? {};
  const explicitKey = existing[FLAGS.MANAGED_EMBEDDED_KEY]
    ?? data.flags?.["hunters-bestiary-dnd5e-2024"]?.managedKey
    ?? data.flags?.["hunters-bestiary-dnd5e-2024"]?.statblockItemId;
  const key = slugify(explicitKey ?? `${documentName}-${data.type ?? "document"}-${data.name ?? index}-${index}`);
  data.flags[MODULE_ID] = {
    ...existing,
    [FLAGS.MANAGED_EMBEDDED]: true,
    [FLAGS.MANAGED_EMBEDDED_KEY]: key,
    [FLAGS.ACTOR_MONSTER_ID]: monster.id,
    [FLAGS.ACTOR_PROVIDER_ID]: monster.providerId ?? "core",
    [FLAGS.SOURCE]: `actor-embedded:${monster.id}:${documentName}:${key}`
  };
  return data;
}

export function isManagedEmbeddedDocument(document, { actor = null, documentName = document?.documentName } = {}) {
  const core = document?.flags?.[MODULE_ID]
    ?? (document?.getFlag?.(MODULE_ID, FLAGS.MANAGED_EMBEDDED) ? { [FLAGS.MANAGED_EMBEDDED]: true } : null);
  if (core?.[FLAGS.MANAGED_EMBEDDED] === true) return true;
  if (String(core?.[FLAGS.SOURCE] ?? "").startsWith("actor-embedded:")) return true;

  // Compatibility with v1.2.0 D&D-generated embedded Items, which predate core markers.
  if (documentName === "Item" && actor?.getFlag?.(MODULE_ID, FLAGS.ACTOR_MONSTER_ID)) {
    const source = document?.system?.source ?? {};
    return ["Hunter's Bestiary", "The Hunter's Bestiary"].includes(source.book) && source.rules === "2024";
  }
  return false;
}

export function managedEmbeddedKey(document) {
  return document?.flags?.[MODULE_ID]?.[FLAGS.MANAGED_EMBEDDED_KEY]
    ?? document?.getFlag?.(MODULE_ID, FLAGS.MANAGED_EMBEDDED_KEY)
    ?? slugify(`${document?.documentName ?? "Document"}-${document?.type ?? "document"}-${document?.name ?? document?.id ?? "unknown"}`);
}

function legacyEmbeddedSignature(document) {
  return JSON.stringify([
    document?.type ?? null,
    String(document?.name ?? ""),
    String(document?.system?.source?.book ?? "")
  ]);
}

function cleanEmbeddedData(input) {
  const data = clone(input ?? {});
  delete data._id;
  delete data._stats;
  delete data._key;
  return data;
}

async function findManagedActor(monster, managedActorsByMonsterId = null) {
  if (monster.actorUuid) {
    const linked = await fromUuid(monster.actorUuid).catch(() => null);
    if (linked?.documentName === "Actor" && !linked.pack) return linked;
  }
  if (managedActorsByMonsterId) return managedActorsByMonsterId.get(monster.id) ?? null;
  return game.actors?.contents?.find(actor => actor.getFlag(MODULE_ID, FLAGS.ACTOR_MONSTER_ID) === monster.id) ?? null;
}

async function ensureActorFolder(name) {
  const existing = game.folders?.find(folder => folder.name === name && folder.type === "Actor");
  if (existing) return existing;
  const FolderClass = globalThis.CONFIG?.Folder?.documentClass ?? globalThis.Folder;
  if (!FolderClass?.create) throw new Error("Foundry Folder document class is unavailable.");
  return FolderClass.create({ name, type: "Actor", sorting: "a", color: "#5c2c2c" });
}
