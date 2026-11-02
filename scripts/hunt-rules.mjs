// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { KNOWLEDGE_FIELDS, OUTCOMES, MODULE_ID, SETTINGS } from "./constants.mjs";
import { boundedInteger, clone } from "./utils.mjs";

export const DISCLOSURE_FIELDS = Object.freeze([
  "name", "tier", "summary", "rumor", "habitats", "signs", "ecology", "behavior", "defenses", "harvest", "weaknesses", "preferredSkills"
]);

export const PLAYER_RESOLUTION_OUTCOMES = Object.freeze([
  "released", "evaded", "observed", "negotiated", "driven-off", "relocated", "captured", "slain"
]);

export const DIFFICULTY_TIERS = Object.freeze([1, 2, 3, 4, 5]);

const DEFAULT_DISCLOSURE = Object.freeze({
  name: { minLevel: 1, minPoints: 5, minRumors: 5, chance: 35, gmApproval: false },
  tier: { minLevel: 2, minPoints: 6, minRumors: 6, chance: 40, gmApproval: false },
  summary: { minLevel: 2, minPoints: 8, minRumors: 8, chance: 45, gmApproval: false },
  rumor: { minLevel: 1, minPoints: 1, minRumors: 1, chance: 100, gmApproval: false },
  habitats: { minLevel: 2, minPoints: 10, minRumors: 10, chance: 45, gmApproval: false },
  signs: { minLevel: 2, minPoints: 12, minRumors: 12, chance: 45, gmApproval: false },
  behavior: { minLevel: 3, minPoints: 18, minRumors: 18, chance: 40, gmApproval: false },
  ecology: { minLevel: 3, minPoints: 22, minRumors: 22, chance: 35, gmApproval: false },
  defenses: { minLevel: 4, minPoints: 28, minRumors: 28, chance: 30, gmApproval: true },
  harvest: { minLevel: 4, minPoints: 30, minRumors: 30, chance: 35, gmApproval: true },
  weaknesses: { minLevel: 5, minPoints: 40, minRumors: 40, chance: 20, gmApproval: true },
  preferredSkills: { minLevel: 4, minPoints: 25, minRumors: 25, chance: 30, gmApproval: true }
});

const DEFAULT_FIELDWORK = Object.freeze({
  trackSearch: { minRumors: 3 },
  sighting: { minSuccessfulTracks: 5, chance: 35, gmApproval: false },
  difficulty: { minSightings: 3, chance: 35, gmApproval: false },
  huntStart: { requireDifficulty: true },
  maxDeferredQuarries: 2,
  maxActiveHunts: 1
});

const DEFAULT_DIFFICULTY_BANDS = Object.freeze(Object.fromEntries(DIFFICULTY_TIERS.map(tier => [String(tier), { customLabel: "" }])));

const DEFAULT_RESOLUTION = Object.freeze({
  released: { mode: "auto", dc: 0, skills: [] },
  evaded: { mode: "check-gm", dc: 14, skills: ["ste", "sur", "acr"] },
  observed: { mode: "check-gm", dc: 13, skills: ["prc", "ste", "inv"] },
  negotiated: { mode: "check-gm", dc: 14, skills: ["per", "ani", "ins"] },
  "driven-off": { mode: "gm", dc: 0, skills: [] },
  relocated: { mode: "gm", dc: 0, skills: [] },
  captured: { mode: "gm", dc: 0, skills: [] },
  slain: { mode: "gm", dc: 0, skills: [] },
  escaped: { mode: "gm", dc: 0, skills: [] },
  unknown: { mode: "gm", dc: 0, skills: [] }
});

export function getHuntRules(monsterIds = []) {
  return normalizeHuntRules(globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.HUNT_RULES), monsterIds);
}

export async function setHuntRules(rules, monsterIds = []) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may change hunt rules.");
  const normalized = normalizeHuntRules(rules, monsterIds);
  await globalThis.game.settings.set(MODULE_ID, SETTINGS.HUNT_RULES, normalized);
  return normalized;
}

export function defaultHuntRules(monsterIds = []) {
  return {
    version: 2,
    minimumHuntLevel: 0,
    quarryPool: [...new Set(monsterIds.filter(Boolean))],
    avoidImmediateRepeat: true,
    disclosure: clone(DEFAULT_DISCLOSURE),
    fieldwork: clone(DEFAULT_FIELDWORK),
    difficultyBands: clone(DEFAULT_DIFFICULTY_BANDS),
    resolution: clone(DEFAULT_RESOLUTION),
    monsterOverrides: {}
  };
}

export function normalizeHuntRules(input, monsterIds = []) {
  const known = new Set(monsterIds.filter(Boolean));
  const base = defaultHuntRules(monsterIds);
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const pool = Array.isArray(value.quarryPool)
    ? [...new Set(value.quarryPool.map(String).filter(id => known.has(id)))]
    : base.quarryPool;
  const overrides = {};
  if (value.monsterOverrides && typeof value.monsterOverrides === "object") {
    for (const [monsterId, override] of Object.entries(value.monsterOverrides)) {
      if (!known.has(monsterId) || !override || typeof override !== "object") continue;
      const disclosure = {};
      for (const field of DISCLOSURE_FIELDS) {
        if (!override.disclosure?.[field]) continue;
        disclosure[field] = normalizeDisclosureOverride(override.disclosure[field]);
      }
      const fieldwork = normalizeFieldworkOverride(override.fieldwork);
      const normalizedOverride = {
        minimumHuntLevel: nullableLevel(override.minimumHuntLevel),
        difficultyTier: nullableBounded(override.difficultyTier, 1, 5),
        disclosure,
        fieldwork
      };
      if (normalizedOverride.minimumHuntLevel == null) delete normalizedOverride.minimumHuntLevel;
      if (normalizedOverride.difficultyTier == null) delete normalizedOverride.difficultyTier;
      if (!Object.keys(disclosure).length) delete normalizedOverride.disclosure;
      if (!Object.keys(fieldwork).length) delete normalizedOverride.fieldwork;
      if (Object.keys(normalizedOverride).length) overrides[monsterId] = normalizedOverride;
    }
  }
  return {
    version: 2,
    minimumHuntLevel: boundedInteger(value.minimumHuntLevel, 0, 5, base.minimumHuntLevel),
    quarryPool: pool,
    avoidImmediateRepeat: value.avoidImmediateRepeat !== false,
    disclosure: Object.fromEntries(DISCLOSURE_FIELDS.map(field => [field, normalizeDisclosureRule(value.disclosure?.[field], base.disclosure[field])])),
    fieldwork: normalizeFieldworkRules(value.fieldwork, base.fieldwork),
    difficultyBands: normalizeDifficultyBands(value.difficultyBands, base.difficultyBands),
    resolution: Object.fromEntries(OUTCOMES.map(outcome => [outcome, normalizeResolutionRule(value.resolution?.[outcome], base.resolution[outcome] ?? DEFAULT_RESOLUTION.unknown)])),
    monsterOverrides: overrides
  };
}

export function effectiveMonsterRules(rules, monsterId, monsterIds = []) {
  const normalized = ensureNormalizedRules(rules, monsterIds);
  const override = normalized.monsterOverrides?.[monsterId] ?? {};
  const disclosure = {};
  for (const field of DISCLOSURE_FIELDS) {
    disclosure[field] = {
      ...normalized.disclosure[field],
      ...stripUndefined(override.disclosure?.[field] ?? {})
    };
  }
  return {
    minimumHuntLevel: Number.isInteger(override.minimumHuntLevel) ? override.minimumHuntLevel : normalized.minimumHuntLevel,
    difficultyTier: Number.isInteger(override.difficultyTier) ? override.difficultyTier : null,
    disclosure,
    fieldwork: mergeFieldworkRules(normalized.fieldwork, override.fieldwork)
  };
}

export function minimumHuntKnowledgeLevel(rules, monsterId, monsterIds = []) {
  return effectiveMonsterRules(rules, monsterId, monsterIds).minimumHuntLevel;
}

export function fieldworkRulesFor(rules, monsterId, monsterIds = []) {
  return effectiveMonsterRules(rules, monsterId, monsterIds).fieldwork;
}

export function difficultyTierFor(rules, monsterId, monster = null, monsterIds = []) {
  const effective = effectiveMonsterRules(rules, monsterId, monsterIds);
  return boundedInteger(effective.difficultyTier ?? monster?.tier, 1, 5, 1);
}

export function difficultyBandFor(rules, monsterId, monster = null, monsterIds = []) {
  const normalized = ensureNormalizedRules(rules, monsterIds);
  const tier = difficultyTierFor(normalized, monsterId, monster, monsterIds);
  const customLabel = String(normalized.difficultyBands?.[String(tier)]?.customLabel ?? "").trim().slice(0, 80);
  return { tier, customLabel, localizationKey: `HB.Difficulty.Tier.${tier}` };
}

export function fieldworkProgressStatus({ record = {}, level = 0, rules, monsterId, monsterIds = [] }) {
  const effective = fieldworkRulesFor(rules, monsterId, monsterIds);
  const rumorsSucceeded = Math.max(0, Number(record.rumorsSucceeded) || 0);
  const tracksSucceeded = Math.max(0, Number(record.tracksSucceeded) || 0);
  const sightings = Array.isArray(record.sightings) ? record.sightings.length : 0;
  const unlocks = new Set(Array.isArray(record.fieldworkUnlocks) ? record.fieldworkUnlocks : []);
  const disclosed = new Set(Array.isArray(record.unlockedFields) ? record.unlockedFields : []);
  const legacy = Boolean(record.legacyDisclosure);
  const sightingUnlocked = legacy || unlocks.has("sighting");
  const difficultyKnown = legacy || disclosed.has("difficulty");
  const minimumHuntLevel = minimumHuntKnowledgeLevel(rules, monsterId, monsterIds);
  const knowledgeReady = Number(level) >= minimumHuntLevel;
  const canSearchTracks = rumorsSucceeded >= effective.trackSearch.minRumors || tracksSucceeded > 0 || legacy;
  const canRecordSighting = sightingUnlocked;
  const requiresDifficulty = effective.huntStart.requireDifficulty;
  const canStartHunt = knowledgeReady && (!requiresDifficulty || difficultyKnown);
  return {
    rumorsSucceeded,
    tracksSucceeded,
    sightings,
    canSearchTracks,
    canRecordSighting,
    sightingUnlocked,
    difficultyKnown,
    knowledgeReady,
    canStartHunt,
    minimumHuntLevel,
    requiresDifficulty,
    trackMinRumors: effective.trackSearch.minRumors,
    sightingMinTracks: effective.sighting.minSuccessfulTracks,
    sightingChance: effective.sighting.chance,
    sightingGmApproval: effective.sighting.gmApproval,
    difficultyMinSightings: effective.difficulty.minSightings,
    difficultyChance: effective.difficulty.chance,
    difficultyGmApproval: effective.difficulty.gmApproval,
    maxDeferredQuarries: ensureNormalizedRules(rules, monsterIds).fieldwork.maxDeferredQuarries,
    maxActiveHunts: ensureNormalizedRules(rules, monsterIds).fieldwork.maxActiveHunts
  };
}

export function rollFieldworkOpportunity({ kind, record = {}, rules, monsterId, monsterIds = [], rng = Math.random }) {
  const effective = fieldworkRulesFor(rules, monsterId, monsterIds);
  if (kind === "sighting") {
    const unlocked = new Set(Array.isArray(record.fieldworkUnlocks) ? record.fieldworkUnlocks : []);
    if (record.legacyDisclosure || unlocked.has("sighting")) return { eligible: false, success: false, gmApproval: false };
    const count = Math.max(0, Number(record.tracksSucceeded) || 0);
    const eligible = count > effective.sighting.minSuccessfulTracks;
    const success = eligible && (Number(rng()) * 100) < effective.sighting.chance;
    return { eligible, success, gmApproval: effective.sighting.gmApproval, count, threshold: effective.sighting.minSuccessfulTracks, chance: effective.sighting.chance };
  }
  if (kind === "difficulty") {
    const fields = new Set(Array.isArray(record.unlockedFields) ? record.unlockedFields : []);
    if (record.legacyDisclosure || fields.has("difficulty")) return { eligible: false, success: false, gmApproval: false };
    const count = Array.isArray(record.sightings) ? record.sightings.length : 0;
    const eligible = count > effective.difficulty.minSightings;
    const success = eligible && (Number(rng()) * 100) < effective.difficulty.chance;
    return { eligible, success, gmApproval: effective.difficulty.gmApproval, count, threshold: effective.difficulty.minSightings, chance: effective.difficulty.chance };
  }
  return { eligible: false, success: false, gmApproval: false };
}

export function disclosureRuleFor(rules, monsterId, field, monsterIds = []) {
  const normalized = ensureNormalizedRules(rules, monsterIds);
  const globalRule = normalized.disclosure[field] ?? normalizeDisclosureRule(null, DEFAULT_DISCLOSURE[field] ?? DEFAULT_DISCLOSURE.summary);
  return { ...globalRule, ...stripUndefined(normalized.monsterOverrides?.[monsterId]?.disclosure?.[field] ?? {}) };
}

export function eligibleDisclosureFields({ record, level, rules, monsterId, monsterIds = [] }) {
  const points = Math.max(0, Number(record?.points) || 0);
  const rumors = Math.max(0, Number(record?.rumorsSucceeded) || 0);
  const unlocked = new Set(Array.isArray(record?.unlockedFields) ? record.unlockedFields : []);
  return DISCLOSURE_FIELDS.filter(field => {
    if (unlocked.has(field)) return false;
    const rule = disclosureRuleFor(rules, monsterId, field, monsterIds);
    return level >= rule.minLevel && points >= rule.minPoints && rumors >= rule.minRumors;
  });
}

export function rollDisclosureOpportunities({ record, level, rules, monsterId, monsterIds = [], rng = Math.random }) {
  const automatic = [];
  const approvals = [];
  for (const field of eligibleDisclosureFields({ record, level, rules, monsterId, monsterIds })) {
    const rule = disclosureRuleFor(rules, monsterId, field, monsterIds);
    const chance = Math.max(0, Math.min(100, Number(rule.chance) || 0));
    if ((Number(rng()) * 100) >= chance) continue;
    if (rule.gmApproval) approvals.push(field);
    else automatic.push(field);
  }
  return { automatic, approvals };
}

export function disclosedFieldsFor({ record, level, rules, monsterId, isGM = false, monsterIds = [] }) {
  if (isGM) return new Set([...DISCLOSURE_FIELDS, "difficulty"]);
  const fields = new Set(Array.isArray(record?.unlockedFields) ? record.unlockedFields : []);
  if (record?.legacyDisclosure) {
    for (const field of KNOWLEDGE_FIELDS[level] ?? []) fields.add(field);
    if (fields.has("tier")) fields.add("difficulty");
  }
  return fields;
}

export function chooseQuarryMonsterId({ rules, monsterIds = [], lastMonsterId = null, excludedMonsterIds = [], rng = Math.random }) {
  const normalized = ensureNormalizedRules(rules, monsterIds);
  const known = new Set(monsterIds);
  const excluded = new Set((excludedMonsterIds ?? []).map(String));
  let pool = normalized.quarryPool.filter(id => known.has(id) && !excluded.has(id));
  if (normalized.avoidImmediateRepeat && lastMonsterId && pool.length > 1) pool = pool.filter(id => id !== lastMonsterId);
  if (!pool.length) return null;
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, Number(rng()) || 0) * pool.length));
  return pool[index] ?? pool[0] ?? null;
}

export function resolutionRuleFor(rules, outcome, monsterIds = []) {
  const normalized = ensureNormalizedRules(rules, monsterIds);
  return normalized.resolution[outcome] ?? normalizeResolutionRule(null, DEFAULT_RESOLUTION.unknown);
}

export function isTerminalOutcome(outcome) {
  return outcome !== "escaped" && outcome !== "unknown";
}

export function isResolutionStage(hunt) {
  if (!hunt || hunt.status !== "active") return false;
  const active = hunt.steps?.find(step => step.status === "active");
  if (active?.kind === "conclusion") return true;
  return Array.isArray(hunt.steps) && hunt.steps.length > 0 && hunt.steps.every(step => step.kind === "conclusion" || ["completed", "skipped"].includes(step.status));
}

function ensureNormalizedRules(rules, monsterIds = []) {
  if (rules?.version === 2 && Array.isArray(rules.quarryPool) && rules.disclosure && rules.resolution && rules.fieldwork && rules.monsterOverrides) return rules;
  return normalizeHuntRules(rules, monsterIds);
}

function normalizeDisclosureRule(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  return {
    minLevel: boundedInteger(source.minLevel, 0, 5, fallback.minLevel),
    minPoints: boundedInteger(source.minPoints, 0, 9999, fallback.minPoints),
    minRumors: boundedInteger(source.minRumors, 0, 9999, fallback.minRumors),
    chance: boundedInteger(source.chance, 0, 100, fallback.chance),
    gmApproval: source.gmApproval == null ? Boolean(fallback.gmApproval) : Boolean(source.gmApproval)
  };
}

function normalizeDisclosureOverride(value) {
  const source = value && typeof value === "object" ? value : {};
  return stripUndefined({
    minLevel: nullableBounded(source.minLevel, 0, 5),
    minPoints: nullableBounded(source.minPoints, 0, 9999),
    minRumors: nullableBounded(source.minRumors, 0, 9999),
    chance: nullableBounded(source.chance, 0, 100),
    gmApproval: source.gmApproval == null || source.gmApproval === "inherit" ? undefined : Boolean(source.gmApproval)
  });
}

function normalizeFieldworkRules(value, fallback) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    trackSearch: { minRumors: boundedInteger(source.trackSearch?.minRumors, 0, 9999, fallback.trackSearch.minRumors) },
    sighting: {
      minSuccessfulTracks: boundedInteger(source.sighting?.minSuccessfulTracks, 0, 9999, fallback.sighting.minSuccessfulTracks),
      chance: boundedInteger(source.sighting?.chance, 0, 100, fallback.sighting.chance),
      gmApproval: source.sighting?.gmApproval == null ? Boolean(fallback.sighting.gmApproval) : Boolean(source.sighting.gmApproval)
    },
    difficulty: {
      minSightings: boundedInteger(source.difficulty?.minSightings, 0, 9999, fallback.difficulty.minSightings),
      chance: boundedInteger(source.difficulty?.chance, 0, 100, fallback.difficulty.chance),
      gmApproval: source.difficulty?.gmApproval == null ? Boolean(fallback.difficulty.gmApproval) : Boolean(source.difficulty.gmApproval)
    },
    huntStart: { requireDifficulty: source.huntStart?.requireDifficulty == null ? Boolean(fallback.huntStart.requireDifficulty) : Boolean(source.huntStart.requireDifficulty) },
    maxDeferredQuarries: boundedInteger(source.maxDeferredQuarries, 0, 20, fallback.maxDeferredQuarries),
    maxActiveHunts: boundedInteger(source.maxActiveHunts, 1, 20, fallback.maxActiveHunts)
  };
}

function normalizeFieldworkOverride(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  const trackSearch = stripUndefined({ minRumors: nullableBounded(source.trackSearch?.minRumors, 0, 9999) });
  const sighting = stripUndefined({
    minSuccessfulTracks: nullableBounded(source.sighting?.minSuccessfulTracks, 0, 9999),
    chance: nullableBounded(source.sighting?.chance, 0, 100),
    gmApproval: normalizeOptionalBoolean(source.sighting?.gmApproval)
  });
  const difficulty = stripUndefined({
    minSightings: nullableBounded(source.difficulty?.minSightings, 0, 9999),
    chance: nullableBounded(source.difficulty?.chance, 0, 100),
    gmApproval: normalizeOptionalBoolean(source.difficulty?.gmApproval)
  });
  const huntStart = stripUndefined({ requireDifficulty: normalizeOptionalBoolean(source.huntStart?.requireDifficulty) });
  if (Object.keys(trackSearch).length) output.trackSearch = trackSearch;
  if (Object.keys(sighting).length) output.sighting = sighting;
  if (Object.keys(difficulty).length) output.difficulty = difficulty;
  if (Object.keys(huntStart).length) output.huntStart = huntStart;
  return output;
}

function mergeFieldworkRules(globalRules, override = {}) {
  return {
    trackSearch: { ...globalRules.trackSearch, ...(override?.trackSearch ?? {}) },
    sighting: { ...globalRules.sighting, ...(override?.sighting ?? {}) },
    difficulty: { ...globalRules.difficulty, ...(override?.difficulty ?? {}) },
    huntStart: { ...globalRules.huntStart, ...(override?.huntStart ?? {}) },
    maxDeferredQuarries: globalRules.maxDeferredQuarries,
    maxActiveHunts: globalRules.maxActiveHunts
  };
}

function normalizeDifficultyBands(value, fallback) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(DIFFICULTY_TIERS.map(tier => {
    const customLabel = String(source[String(tier)]?.customLabel ?? fallback[String(tier)]?.customLabel ?? "").trim().slice(0, 80);
    return [String(tier), { customLabel }];
  }));
}

function normalizeResolutionRule(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const mode = ["auto", "gm", "check-gm"].includes(source.mode) ? source.mode : fallback.mode;
  const skills = Array.isArray(source.skills) ? [...new Set(source.skills.map(String).filter(Boolean))].slice(0, 10) : [...fallback.skills];
  return { mode, dc: boundedInteger(source.dc, 0, 40, fallback.dc), skills };
}

function nullableLevel(value) {
  return value == null || value === "" || value === "inherit" ? null : boundedInteger(value, 0, 5, 0);
}

function nullableBounded(value, min, max) {
  if (value == null || value === "" || value === "inherit") return undefined;
  return boundedInteger(value, min, max, min);
}

function normalizeOptionalBoolean(value) {
  if (value == null || value === "" || value === "inherit") return undefined;
  if (value === "yes" || value === true) return true;
  if (value === "no" || value === false) return false;
  return Boolean(value);
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
