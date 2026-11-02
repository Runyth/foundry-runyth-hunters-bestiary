// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, FLAGS, SETTINGS } from "./constants.mjs";
import { MainApp, AdminApp, openPlayerPerspectiveDashboard } from "./apps/main-app.mjs";
import { TransferApp } from "./apps/transfer-app.mjs";
import { getWorldData, getProgress, awardKnowledge, setWorldData, appendAudit, normalizeProgress, knowledgeLevel } from "./state.mjs";
import { getHuntRules, setHuntRules, disclosedFieldsFor, difficultyBandFor } from "./hunt-rules.mjs";
import { saveHunt, createHuntFromTemplate, visibleHuntsFor, resolveHunt } from "./hunts.mjs";
import { buildExport, importExport } from "./transfer.mjs";
import { installReferenceLibrary, publishPersonalBestiary } from "./content.mjs";
import { localizeRecord, clone, slugify } from "./utils.mjs";
import { selectControlledPlayerPerspectiveTarget } from "./fieldwork-view.mjs";
import { normalizeProviderRegistration, buildProviderReports } from "./providers.mjs";
import { ComplementaryModuleRegistry, getCanonicalModuleName, getNamingConvention, getNamingWarningDecision, validateComplementaryModuleName } from "./naming.mjs";
import { createDashboardToolkit } from "./ui-toolkit.mjs";
import { resolveMonsterImage, setMonsterImage, resetMonsterImage, openMonsterImagePicker, imageOverrideFor } from "./images.mjs";
import { registerActorAdapter, unregisterActorAdapter, getActorAdapters, provisionActors } from "./actors.mjs";
import {
  registerSystemAdapter,
  unregisterSystemAdapter,
  getSystemAdapters,
  getActiveSystemAdapterDescriptor,
  buildHarvestItemData,
  createHarvestItems,
  getEncounterProfile
} from "./system-adapters.mjs";

function openApplication(AppClass, id, options = {}) {
  const existing = foundry.applications.instances.get(id);
  if (existing) {
    let viewChanged = false;
    if (existing.view && options.initialTab && existing.view.tab !== options.initialTab) { existing.view.tab = options.initialTab; viewChanged = true; }
    if (existing.view && options.monsterId && existing.view.monsterId !== options.monsterId) { existing.view.monsterId = options.monsterId; viewChanged = true; }
    if (existing.view && options.huntId && existing.view.huntId !== options.huntId) { existing.view.huntId = options.huntId; viewChanged = true; }
    if (!existing.rendered || viewChanged) existing.render({ force: true });
    else existing.bringToFront();
    return existing;
  }
  const app = new AppClass(options);
  app.render({ force: true });
  return app;
}

function visibleCatalogueForCurrentUser(data) {
  const progress = normalizeProgress(game.user?.getFlag?.(MODULE_ID, FLAGS.PROGRESS));
  const monsterIds = (data.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  return (data.monsters ?? [])
    .map(monster => visibleMonster(monster, data.knowledgeLevels, progress, rules, monsterIds))
    .filter(Boolean);
}

function visibleMonsterForCurrentUser(monster, data) {
  if (!monster) return null;
  const progress = normalizeProgress(game.user?.getFlag?.(MODULE_ID, FLAGS.PROGRESS));
  const monsterIds = (data.monsters ?? []).map(entry => entry.id);
  return visibleMonster(monster, data.knowledgeLevels, progress, getHuntRules(monsterIds), monsterIds);
}

function visibleMonster(monster, levels, progress, rules, monsterIds) {
  const record = progress.monsters?.[monster.id];
  if (!record) return null;
  const level = knowledgeLevel(record.points, levels, record.manualLevel);
  if (level <= 0 && record.points <= 0 && record.manualLevel == null) return null;
  const allowed = disclosedFieldsFor({ record, level, rules, monsterId: monster.id, isGM: false, monsterIds });
  const output = { id: monster.id, knowledgeLevel: level, knowledgePoints: record.points ?? 0 };
  for (const field of allowed) {
    if (field === "tier" || field === "difficulty") continue;
    if (Object.hasOwn(monster, field)) output[field] = clone(monster[field]);
  }
  if (allowed.has("tier") || allowed.has("difficulty")) {
    const band = difficultyBandFor(rules, monster.id, monster, monsterIds);
    output.difficultyLabel = band.customLabel || globalThis.game?.i18n?.localize?.(band.localizationKey) || band.localizationKey;
  }
  if (allowed.has("name") && monster.img) output.img = monster.img;
  return output;
}

export class HuntersBestiaryAPI {
  #readyResolve;
  #readyPromise;
  #initializationStatus = { ok: false, failures: [], ready: false };
  #complementaryModules = new ComplementaryModuleRegistry();

  constructor() {
    this.#readyPromise = new Promise(resolve => {
      this.#readyResolve = resolve;
    });
    this.ui = createDashboardToolkit({ namingApi: this });
  }

  get version() {
    return game.modules.get(MODULE_ID)?.version ?? "0.0.0";
  }

  whenReady() {
    return this.#readyPromise;
  }

  get initializationStatus() {
    return clone(this.#initializationStatus);
  }

  getNamingConvention() {
    return getNamingConvention();
  }

  getCanonicalModuleName(metadata = {}) {
    return getCanonicalModuleName(metadata);
  }

  validateComplementaryModuleName(metadata = {}, actualName) {
    if (typeof metadata === "string") {
      const registered = this.#complementaryModules.get(metadata);
      if (registered) return validateComplementaryModuleName(registered, actualName);
      const module = game.modules.get(metadata);
      return validateComplementaryModuleName({ moduleId: metadata, currentTitle: module?.title ?? actualName }, actualName);
    }
    return validateComplementaryModuleName(metadata, actualName);
  }

  validateComplementaryModuleRegistration(metadata = {}, declaration = {}) {
    const naming = this.validateComplementaryModuleName(metadata);
    const problems = [...naming.problems];
    const type = metadata.type ?? naming.metadata?.type;
    const requiredApi = String(metadata.apiCompatibilityVersion ?? "").trim();
    const supportedMajor = Number(String(this.ui.version).split(".")[0]);
    const requestedMajor = Number(requiredApi.split(".")[0]);
    if (requiredApi && Number.isFinite(requestedMajor) && requestedMajor > supportedMajor) {
      problems.push({ code: "INCOMPATIBLE_DASHBOARD_API", message: `Dashboard API ${requiredApi} is newer than supported ${this.ui.version}.` });
    }
    if (type !== "provider" && !String(metadata.dashboardApplicationId ?? "").trim()) {
      problems.push({ code: "MISSING_DASHBOARD_DECLARATION", message: "A dashboard application ID is required for this complementary-module type." });
    }
    if (!String(metadata.providerId ?? "").trim()) problems.push({ code: "MISSING_PROVIDER_ID", message: "A provider ID is required." });
    if (declaration.localizationPresent === false) problems.push({ code: "MISSING_LOCALIZATION", message: "The supplied declaration reports missing localization." });
    if (declaration.settingsPresent === false) problems.push({ code: "MISSING_SETTINGS", message: "The supplied declaration reports missing required dashboard settings." });
    if (declaration.usesInvalidGlobalHooks === true) problems.push({ code: "INVALID_GLOBAL_HOOKS", message: "The supplied declaration reports broad global hooks." });
    return Object.freeze({ ...naming, valid: problems.length === 0, problems: Object.freeze(problems.map(entry => Object.freeze({ ...entry }))), declaration: Object.freeze({ ...declaration }) });
  }

  registerComplementaryModule(metadata = {}) {
    const module = game.modules.get(metadata.moduleId);
    const record = this.#complementaryModules.register({
      ...metadata,
      currentTitle: metadata.currentTitle ?? module?.title ?? "",
      version: metadata.version ?? module?.version ?? ""
    });
    Hooks.callAll(`${MODULE_ID}.complementaryModuleRegistered`, record);
    if (globalThis.game?.ready && module?.active) queueMicrotask(() => this.warnForInvalidComplementaryModuleName(record, { reason: "startup" }));
    return record;
  }

  unregisterComplementaryModule(moduleId) {
    const removed = this.#complementaryModules.unregister(moduleId);
    if (removed) Hooks.callAll(`${MODULE_ID}.complementaryModuleUnregistered`, { moduleId });
    return removed;
  }

  getRegisteredComplementaryModules() {
    return this.#complementaryModules.list();
  }

  warnForInvalidComplementaryModuleName(moduleIdOrMetadata, { reason = "manual", force = false } = {}) {
    const registered = typeof moduleIdOrMetadata === "string" ? this.#complementaryModules.get(moduleIdOrMetadata) : null;
    const metadata = registered ?? moduleIdOrMetadata;
    const moduleId = typeof moduleIdOrMetadata === "string" ? moduleIdOrMetadata : metadata?.moduleId;
    const module = game.modules.get(moduleId);
    const validation = this.validateComplementaryModuleName(metadata ?? { moduleId, currentTitle: module?.title });
    const startupAllowed = reason !== "startup" || force || !module?.active || validation.valid
      ? true
      : this.#complementaryModules.shouldWarnAtStartup(moduleId);
    const decision = getNamingWarningDecision({ active: Boolean(module?.active), reason, validation, startupAllowed });
    if (!decision.warn) return { warned: false, reason: decision.reason, validation };
    const message = game.i18n?.format?.("HB.Naming.Warning", {
      actualName: validation.actualName || module?.title || moduleId,
      expectedName: validation.expectedName,
      moduleId
    }) ?? `Runyth Hunter's Bestiary naming warning: “${validation.actualName}” does not follow the complementary-module naming standard. Expected: “${validation.expectedName}”. The module remains usable; see docs/NAMING-STANDARD.md and docs/COMPLEMENTARY-MODULE-GUIDE.md.`;
    ui.notifications?.warn?.(message);
    console.warn(`${MODULE_ID} | Complementary module naming warning`, { moduleId, reason, validation });
    return { warned: true, reason, validation };
  }

  warnForEnabledComplementaryModuleNames() {
    return this.#complementaryModules.list().map(record => this.warnForInvalidComplementaryModuleName(record, { reason: "startup" }));
  }

  markReady(status = { ok: true, failures: [] }) {
    this.#initializationStatus = {
      ok: status?.ok !== false,
      failures: clone(status?.failures ?? []),
      ready: true
    };
    this.#readyResolve?.(this);
    this.#readyResolve = null;
  }

  open(options = {}) {
    return openApplication(MainApp, "hunters-bestiary-control-centre", options);
  }

  openAdministration(options = {}) {
    if (!game.user.isGM) throw new Error("Only a GM may open Runyth Hunter's Bestiary administration.");
    return openApplication(AdminApp, "hunters-bestiary-administration", { ...options, initialTab: "gm" });
  }

  openPlayerPerspective({ userId = null, actor = null } = {}) {
    if (!game.user.isGM) throw new Error("Only a GM may open a player-perspective dashboard.");
    let user = userId ? game.users.get(userId) : null;
    if (!user) {
      const target = selectControlledPlayerPerspectiveTarget(
        globalThis.canvas?.tokens?.controlled ?? [],
        game.users?.contents ?? [],
        globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3
      );
      user = target?.user ?? null;
      actor ??= target?.actor ?? null;
    }
    if (!user || user.isGM) throw new Error("Select exactly one player-owned token or provide a non-GM userId.");
    return openPlayerPerspectiveDashboard({ user, actor: actor ?? user.character ?? null });
  }

  openTransfer(options = {}) {
    return openApplication(TransferApp, "hunters-bestiary-transfer", options);
  }

  getCatalogue({ localized = false } = {}) {
    const data = getWorldData();
    const monsters = game.user.isGM
      ? clone(data.monsters ?? [])
      : visibleCatalogueForCurrentUser(data);
    return localized ? monsters.map(localizeRecord) : monsters;
  }

  getMonster(monsterId, { localized = false } = {}) {
    const data = getWorldData();
    const monster = data.monsters?.find(entry => entry.id === monsterId) ?? null;
    const visible = game.user.isGM ? clone(monster) : visibleMonsterForCurrentUser(monster, data);
    return visible && localized ? localizeRecord(visible) : visible;
  }

  getMonsterImage(monsterId) {
    const world = getWorldData();
    const monster = world.monsters?.find(entry => entry.id === monsterId);
    if (!monster) return null;
    return { imagePath: resolveMonsterImage(monster, world), override: imageOverrideFor(monsterId, world), packaged: monster.img ?? null };
  }

  setMonsterImage(monsterId, imagePath, options = {}) {
    return setMonsterImage(monsterId, imagePath, options);
  }

  resetMonsterImage(monsterId, options = {}) {
    return resetMonsterImage(monsterId, options);
  }

  openMonsterImagePicker(monsterId, options = {}) {
    return openMonsterImagePicker(monsterId, options);
  }

  getHunts(user = game.user) {
    return visibleHuntsFor(user);
  }

  getHuntRules() {
    const world = getWorldData();
    return getHuntRules((world.monsters ?? []).map(entry => entry.id));
  }

  setHuntRules(rules) {
    if (!game.user.isGM) throw new Error("Only a GM may change hunt rules through the public API.");
    const world = getWorldData();
    return setHuntRules(rules, (world.monsters ?? []).map(entry => entry.id));
  }

  getProgress(userId = game.user.id) {
    if (!game.user.isGM && userId !== game.user.id) throw new Error("Players may only read their own Bestiary progress through the public API.");
    return getProgress(userId);
  }

  async awardKnowledge({ userId, monsterId, points = 1, source = "api", detail = "" }) {
    if (!game.user.isGM) throw new Error("Only a GM may award knowledge through the public API.");
    return awardKnowledge(userId, monsterId, points, source, detail);
  }

  async createHunt(data) {
    if (!game.user.isGM) throw new Error("Only a GM may create hunts.");
    const world = getWorldData();
    const template = world.trailTemplates?.find(entry => entry.id === data.templateId) ?? world.trailTemplates?.[0];
    const hunt = createHuntFromTemplate({ ...data, template });
    return saveHunt(hunt);
  }

  resolveHunt(huntId, outcome, notes = "") {
    return resolveHunt(huntId, outcome, notes);
  }

  buildExport(options = {}) {
    return buildExport(options);
  }

  importExport(payload, options = {}) {
    return importExport(payload, options);
  }

  installReferenceLibrary(options = {}) {
    return installReferenceLibrary(options);
  }

  publishPersonalBestiary(userId = game.user.id) {
    return publishPersonalBestiary(userId);
  }

  async linkActor(actor, monsterId) {
    if (!actor || actor.documentName !== "Actor") throw new Error("An Actor is required.");
    if (!game.user.isGM && !actor.isOwner) throw new Error("You do not own this Actor.");
    const world = getWorldData();
    const monster = world.monsters?.find(entry => entry.id === monsterId);
    if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
    await actor.setFlag(MODULE_ID, FLAGS.ACTOR_MONSTER_ID, monsterId);
    await actor.setFlag(MODULE_ID, FLAGS.ACTOR_PROVIDER_ID, monster.providerId ?? "core");
    if (game.user.isGM) {
      monster.actorUuid = actor.uuid;
      monster.actorSource ??= { mode: "uuid", uuid: actor.uuid };
      await setWorldData(world);
      await appendAudit({ type: "actor-link", monsterId, actorUuid: actor.uuid });
      Hooks.callAll(`${MODULE_ID}.catalogChanged`, { type: "actor-link", monsterId, actorUuid: actor.uuid });
    }
    return actor;
  }

  async unlinkActor(monsterId, { actorUuid = null } = {}) {
    if (!game.user.isGM) throw new Error("Only a GM may unlink a quarry Actor.");
    const world = getWorldData();
    const monster = world.monsters?.find(entry => entry.id === monsterId);
    if (!monster) throw new Error(`Unknown monster id: ${monsterId}`);
    if (actorUuid && monster.actorUuid && monster.actorUuid !== actorUuid) {
      return { monsterId, unlinked: false, reason: "actor-mismatch", actorUuid: monster.actorUuid };
    }
    const previousActorUuid = monster.actorUuid ?? null;
    delete monster.actorUuid;
    await setWorldData(world);
    await appendAudit({ type: "actor-unlink", monsterId, actorUuid: previousActorUuid });
    Hooks.callAll(`${MODULE_ID}.catalogChanged`, { type: "actor-unlink", monsterId, actorUuid: previousActorUuid });
    return { monsterId, unlinked: Boolean(previousActorUuid), actorUuid: previousActorUuid };
  }

  monsterIdForActor(actor) {
    if (!actor) return null;
    const linked = actor.getFlag(MODULE_ID, FLAGS.ACTOR_MONSTER_ID);
    if (linked) return linked;
    return getWorldData().monsters?.find(entry => entry.actorUuid === actor.uuid)?.id ?? null;
  }

  validateContent(providerId, content = {}, { allowPartial = false } = {}) {
    return normalizeProviderRegistration(providerId, content, {
      worldData: getWorldData(),
      allowPartial
    });
  }

  getProviderReports() {
    return buildProviderReports(getWorldData());
  }

  registerActorAdapter(adapterId, adapter) {
    return registerActorAdapter(adapterId, adapter);
  }

  unregisterActorAdapter(adapterId) {
    return unregisterActorAdapter(adapterId);
  }

  getActorAdapters() {
    return getActorAdapters();
  }

  async provisionActors(options = {}) {
    if (!game.user.isGM) throw new Error("Only a GM may provision quarry Actors.");
    return provisionActors(options);
  }

  registerSystemAdapter(adapterId, adapter) {
    return registerSystemAdapter(adapterId, adapter);
  }

  unregisterSystemAdapter(adapterId) {
    return unregisterSystemAdapter(adapterId);
  }

  getSystemAdapters() {
    return getSystemAdapters();
  }

  getActiveSystemAdapter() {
    return getActiveSystemAdapterDescriptor();
  }

  buildHarvestItemData(monsterId, options = {}) {
    return buildHarvestItemData(monsterId, options);
  }

  createHarvestItems(options = {}) {
    return createHarvestItems(options);
  }

  getEncounterProfile(monsterId, options = {}) {
    return getEncounterProfile(monsterId, options);
  }

  async registerContent(providerId, content = {}, { replaceProviderContent = true, allowPartial = null } = {}) {
    if (!game.user.isGM) throw new Error("Only a GM may register complementary Runyth Hunter's Bestiary content.");
    const source = slugify(providerId);
    if (!source) throw new Error("A provider id is required.");
    const partialAllowed = allowPartial ?? game.settings.get(MODULE_ID, SETTINGS.ALLOW_PARTIAL_PROVIDER_CONTENT);
    const world = getWorldData();
    const normalized = normalizeProviderRegistration(source, content, {
      worldData: world,
      allowPartial: partialAllowed
    });

    const collections = ["monsters", "tracks", "rumors", "books", "trailTemplates", "complications"];
    for (const collection of collections) {
      const retained = replaceProviderContent
        ? (world[collection] ?? []).filter(entry => entry.providerId !== source)
        : [...(world[collection] ?? [])];
      const indexById = new Map(retained.map((entry, index) => [entry.id, index]));
      for (const entry of normalized.content[collection]) {
        const next = clone(entry);
        const index = indexById.get(next.id);
        if (index === undefined) {
          indexById.set(next.id, retained.length);
          retained.push(next);
        } else retained[index] = next;
      }
      world[collection] = retained;
    }
    await Promise.all([
      setWorldData(world),
      appendAudit({
      type: "content-provider-register",
      providerId: source,
      complete: normalized.complete,
      partialAllowed,
      counts: normalized.counts,
      incompleteMonsterIds: normalized.reports.filter(report => !report.complete).map(report => report.monsterId)
      })
    ]);
    Hooks.callAll(`${MODULE_ID}.catalogChanged`, {
      providerId: source,
      complete: normalized.complete,
      reports: clone(normalized.reports)
    });
    return {
      providerId: source,
      counts: normalized.counts,
      complete: normalized.complete,
      partialAllowed,
      reports: clone(normalized.reports),
      warnings: clone(normalized.warnings)
    };
  }
}
