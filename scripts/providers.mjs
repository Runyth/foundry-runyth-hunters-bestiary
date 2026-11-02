// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { clone, slugify } from "./utils.mjs";

export const PROVIDER_COLLECTIONS = Object.freeze([
  "monsters",
  "tracks",
  "rumors",
  "books",
  "trailTemplates",
  "complications"
]);

const BUNDLE_COLLECTIONS = Object.freeze([
  ["rumors", "rumorIds"],
  ["tracks", "trackIds"],
  ["books", "bookIds"],
  ["trailTemplates", "trailTemplateIds"],
  ["complications", "complicationIds"]
]);

const REQUIRED_LOCALIZABLE_MONSTER_FIELDS = Object.freeze([
  "name",
  "summary",
  "rumor",
  "ecology",
  "behavior",
  "defenses",
  "weaknesses",
  "harvest",
  "gmSecrets"
]);

export class ProviderContentValidationError extends Error {
  constructor(providerId, reports) {
    const failures = reports
      .filter(report => !report.complete)
      .map(report => `${report.monsterId}: ${report.errors.join("; ")}`)
      .join(" | ");
    super(`Provider '${providerId}' contains incomplete monster packages. ${failures}`);
    this.name = "ProviderContentValidationError";
    this.providerId = providerId;
    this.reports = clone(reports);
  }
}

export function normalizeProviderRegistration(providerId, content = {}, { worldData = {}, allowPartial = false } = {}) {
  const source = slugify(providerId);
  if (!source) throw new Error("A provider id is required.");

  const staged = Object.fromEntries(PROVIDER_COLLECTIONS.map(key => [key, []]));
  for (const collection of PROVIDER_COLLECTIONS) {
    for (const rawEntry of content[collection] ?? []) {
      upsert(staged[collection], prepareEntry(rawEntry, collection, source));
    }
  }

  const bundles = Array.isArray(content.monsterBundles) ? content.monsterBundles : [];
  for (const [bundleIndex, rawBundle] of bundles.entries()) {
    flattenBundle(staged, rawBundle, source, bundleIndex);
  }

  const combined = combineCatalogue(worldData, staged, source);
  const reports = staged.monsters.map(monster => evaluateMonsterCompleteness(monster, combined));
  const warnings = reports.flatMap(report => report.warnings.map(message => ({ monsterId: report.monsterId, message })));

  if (!allowPartial && reports.some(report => !report.complete)) {
    throw new ProviderContentValidationError(source, reports);
  }

  return {
    providerId: source,
    content: staged,
    reports,
    warnings,
    complete: reports.every(report => report.complete),
    counts: Object.fromEntries(PROVIDER_COLLECTIONS.map(key => [key, staged[key].length]))
  };
}

export function evaluateMonsterCompleteness(monster, catalogue) {
  const errors = [];
  const warnings = [];
  const monsterId = monster?.id ?? "unknown-monster";

  if (!monster || typeof monster !== "object") {
    return { monsterId, complete: false, errors: ["Monster record is missing."], warnings, related: {} };
  }

  if (!/^[a-z0-9-]+$/.test(String(monster.id ?? ""))) errors.push("Monster id must use lowercase letters, numbers, and hyphens.");
  for (const field of REQUIRED_LOCALIZABLE_MONSTER_FIELDS) {
    if (!hasLocalizableText(monster[field])) errors.push(`Missing localizable monster field '${field}'.`);
  }
  if (!Array.isArray(monster.habitats) || monster.habitats.length < 1 || monster.habitats.some(entry => !hasLocalizableText(entry))) {
    errors.push("At least one localizable habitat is required.");
  }
  if (!Array.isArray(monster.signs) || monster.signs.length < 2 || monster.signs.some(entry => !hasLocalizableText(entry))) {
    errors.push("At least two localizable monster-specific signs are required.");
  }
  if (!Array.isArray(monster.preferredSkills) || monster.preferredSkills.length < 1) errors.push("At least one preferred fieldwork skill is required.");

  const related = {};
  for (const [collection, linkField] of BUNDLE_COLLECTIONS) {
    related[collection] = relatedEntries(monster, catalogue[collection] ?? [], linkField);
    if (!related[collection].length) errors.push(`At least one linked ${humanizeCollection(collection)} entry is required.`);
  }

  const actorResult = validateActorSource(monster.actorSource);
  errors.push(...actorResult.errors);
  warnings.push(...actorResult.warnings);

  return {
    monsterId,
    providerId: monster.providerId ?? null,
    complete: errors.length === 0,
    errors,
    warnings,
    actorMode: monster.actorSource?.mode ?? "missing",
    related: Object.fromEntries(Object.entries(related).map(([key, entries]) => [key, entries.map(entry => entry.id)]))
  };
}

export function buildProviderReports(worldData = {}) {
  const providers = new Map();
  for (const monster of worldData.monsters ?? []) {
    const providerId = monster.providerId ?? "core";
    if (!providers.has(providerId)) providers.set(providerId, []);
    providers.get(providerId).push(evaluateMonsterCompleteness(monster, worldData));
  }
  return [...providers.entries()].map(([providerId, monsters]) => ({
    providerId,
    monsterCount: monsters.length,
    completeCount: monsters.filter(entry => entry.complete).length,
    incompleteCount: monsters.filter(entry => !entry.complete).length,
    complete: monsters.every(entry => entry.complete),
    monsters
  }));
}

export function validateActorSource(source) {
  const errors = [];
  const warnings = [];
  if (!source || typeof source !== "object") {
    errors.push("An explicit Actor source declaration is required: data, uuid, adapter, or none with a reason.");
    return { complete: false, errors, warnings };
  }

  const mode = String(source.mode ?? "");
  if (mode === "none") {
    if (String(source.reason ?? "").trim().length < 10) errors.push("Actor mode 'none' requires a meaningful reason.");
  } else if (mode === "uuid") {
    if (!String(source.uuid ?? "").trim()) errors.push("Actor UUID source requires a UUID.");
  } else if (mode === "data") {
    if (!String(source.systemId ?? "").trim()) errors.push("Raw Actor data requires a Foundry game-system id.");
    if (!source.data || typeof source.data !== "object" || Array.isArray(source.data)) errors.push("Raw Actor data requires a data object.");
  } else if (mode === "adapter") {
    if (!String(source.systemId ?? "").trim()) errors.push("Actor adapter source requires a Foundry game-system id.");
    if (!String(source.adapterId ?? "").trim()) errors.push("Actor adapter source requires an adapter id.");
    if (source.data !== undefined && (typeof source.data !== "object" || Array.isArray(source.data))) errors.push("Actor adapter data must be an object when provided.");
  } else {
    errors.push("Actor source mode must be one of: data, uuid, adapter, none.");
  }

  return { complete: errors.length === 0, errors, warnings };
}

function flattenBundle(staged, rawBundle, providerId, bundleIndex) {
  const bundle = clone(rawBundle ?? {});
  if (!bundle.monster || typeof bundle.monster !== "object") {
    const placeholderId = `${providerId}-invalid-bundle-${bundleIndex + 1}`;
    upsert(staged.monsters, {
      id: placeholderId,
      providerId,
      actorSource: bundle.actor,
      contentLinks: {},
      __bundleError: "Monster bundle is missing its monster record."
    });
    return;
  }

  const monster = prepareEntry(bundle.monster, "monsters", providerId);
  monster.contentLinks = clone(monster.contentLinks ?? {});
  monster.actorSource = clone(bundle.actor ?? monster.actorSource);

  for (const [collection, linkField] of BUNDLE_COLLECTIONS) {
    const references = [];
    for (const [entryIndex, rawEntry] of (bundle[collection] ?? []).entries()) {
      if (typeof rawEntry === "string") {
        references.push(rawEntry);
        continue;
      }
      const entry = prepareEntry(rawEntry, collection, providerId, `${monster.id}-${entryIndex + 1}`);
      entry.monsterIds = Array.from(new Set([...(entry.monsterIds ?? []), monster.id]));
      upsert(staged[collection], entry, { mergeMonsterIds: true });
      references.push(entry.id);
    }
    for (const reference of bundle[linkField] ?? []) references.push(String(reference));
    monster.contentLinks[linkField] = Array.from(new Set([...(monster.contentLinks[linkField] ?? []), ...references]));
  }

  upsert(staged.monsters, monster);
}

function prepareEntry(rawEntry, collection, providerId, fallbackSuffix = "") {
  const entry = clone(rawEntry ?? {});
  const label = firstText(entry.name)
    ?? firstText(entry.text)
    ?? firstText(entry)
    ?? fallbackSuffix
    ?? collection;
  entry.id = String(entry.id ?? `${providerId}-${slugify(label)}`);
  entry.providerId = providerId;
  return entry;
}

function combineCatalogue(worldData, staged, providerId) {
  const combined = {};
  for (const collection of PROVIDER_COLLECTIONS) {
    const retained = clone(worldData[collection] ?? []).filter(entry => entry.providerId !== providerId);
    combined[collection] = retained;
    for (const entry of staged[collection]) upsert(combined[collection], clone(entry), { mergeMonsterIds: true });
  }
  return combined;
}

function relatedEntries(monster, entries, linkField) {
  const linkedIds = new Set(monster.contentLinks?.[linkField] ?? []);
  return entries.filter(entry => linkedIds.has(entry.id) || (entry.monsterIds ?? []).includes(monster.id));
}

function upsert(collection, entry, { mergeMonsterIds = false } = {}) {
  const index = collection.findIndex(existing => existing.id === entry.id);
  if (index < 0) {
    collection.push(entry);
    return;
  }
  if (mergeMonsterIds) {
    entry.monsterIds = Array.from(new Set([...(collection[index].monsterIds ?? []), ...(entry.monsterIds ?? [])]));
  }
  collection[index] = entry;
}

function firstText(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.key === "string" && value.key.trim()) return value.key.trim();
  return Object.values(value).find(entry => typeof entry === "string" && entry.trim())?.trim() ?? null;
}

function hasLocalizableText(value) {
  return Boolean(firstText(value));
}

function humanizeCollection(collection) {
  return ({
    rumors: "rumor",
    tracks: "track or spoor",
    books: "research book",
    trailTemplates: "hunt structure",
    complications: "investigation complication"
  })[collection] ?? collection;
}
