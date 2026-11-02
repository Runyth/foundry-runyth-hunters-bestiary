export const FAMILY_NAME = "Hunter's Bestiary";
export const NAMING_API_VERSION = "1.0.0";

export const COMPLEMENTARY_MODULE_TYPES = Object.freeze({
  CORE: "core",
  SYSTEM_LAYER: "system-layer",
  SUBJECT: "subject",
  SUBJECT_SYSTEM_LAYER: "subject-system-layer",
  PROVIDER: "provider"
});

const SUPPORTED_TYPES = new Set(Object.values(COMPLEMENTARY_MODULE_TYPES));

function text(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function getNamingConvention() {
  return Object.freeze({
    apiVersion: NAMING_API_VERSION,
    familyName: FAMILY_NAME,
    patterns: Object.freeze({
      core: FAMILY_NAME,
      systemLayer: `${FAMILY_NAME} - <Game System>`,
      subject: `${FAMILY_NAME}: <Complementary Subject>`,
      subjectSystemLayer: `${FAMILY_NAME}: <Complementary Subject> - <Game System>`
    }),
    separators: Object.freeze({ subject: ": ", gameSystem: " - " })
  });
}

function inferType(metadata = {}) {
  if (metadata.subject && metadata.gameSystem) return COMPLEMENTARY_MODULE_TYPES.SUBJECT_SYSTEM_LAYER;
  if (metadata.subject) return COMPLEMENTARY_MODULE_TYPES.SUBJECT;
  if (metadata.gameSystem) return COMPLEMENTARY_MODULE_TYPES.SYSTEM_LAYER;
  return metadata.moduleId === "hunters-bestiary" ? COMPLEMENTARY_MODULE_TYPES.CORE : COMPLEMENTARY_MODULE_TYPES.PROVIDER;
}

export function normalizeNamingMetadata(metadata = {}) {
  return {
    moduleId: text(metadata.moduleId),
    currentTitle: text(metadata.currentTitle ?? metadata.title),
    subject: text(metadata.subject),
    gameSystem: text(metadata.gameSystem),
    type: text(metadata.type || inferType(metadata)),
    dashboardApplicationId: text(metadata.dashboardApplicationId),
    providerId: text(metadata.providerId),
    version: text(metadata.version),
    apiCompatibilityVersion: text(metadata.apiCompatibilityVersion || NAMING_API_VERSION)
  };
}

export function getCanonicalModuleName(metadata = {}) {
  const value = normalizeNamingMetadata(metadata);
  switch (value.type) {
    case COMPLEMENTARY_MODULE_TYPES.CORE:
      return FAMILY_NAME;
    case COMPLEMENTARY_MODULE_TYPES.SYSTEM_LAYER:
      return value.gameSystem ? `${FAMILY_NAME} - ${value.gameSystem}` : FAMILY_NAME;
    case COMPLEMENTARY_MODULE_TYPES.SUBJECT:
      return value.subject ? `${FAMILY_NAME}: ${value.subject}` : FAMILY_NAME;
    case COMPLEMENTARY_MODULE_TYPES.SUBJECT_SYSTEM_LAYER:
    case COMPLEMENTARY_MODULE_TYPES.PROVIDER:
      if (value.subject && value.gameSystem) return `${FAMILY_NAME}: ${value.subject} - ${value.gameSystem}`;
      if (value.subject) return `${FAMILY_NAME}: ${value.subject}`;
      if (value.gameSystem) return `${FAMILY_NAME} - ${value.gameSystem}`;
      return FAMILY_NAME;
    default:
      return FAMILY_NAME;
  }
}

function problem(code, message) {
  return { code, message };
}

export function getNamingWarningDecision({ active = true, reason = "manual", validation, startupAllowed = true } = {}) {
  if (reason === "startup" && !active) return Object.freeze({ warn: false, reason: "disabled" });
  if (validation?.valid) return Object.freeze({ warn: false, reason: "valid" });
  if (reason === "startup" && !startupAllowed) return Object.freeze({ warn: false, reason: "deduplicated" });
  return Object.freeze({ warn: true, reason });
}

export function validateComplementaryModuleName(metadata = {}, actualName) {
  const normalized = normalizeNamingMetadata(metadata);
  const actual = text(actualName ?? normalized.currentTitle);
  const expected = getCanonicalModuleName(normalized);
  const problems = [];

  if (!normalized.moduleId) problems.push(problem("MISSING_MODULE_ID", "A complementary module registration requires a module ID."));
  if (!SUPPORTED_TYPES.has(normalized.type)) problems.push(problem("UNSUPPORTED_COMPLEMENTARY_TYPE", `Unsupported complementary-module type: ${normalized.type || "(empty)"}.`));
  if ([COMPLEMENTARY_MODULE_TYPES.SUBJECT, COMPLEMENTARY_MODULE_TYPES.SUBJECT_SYSTEM_LAYER].includes(normalized.type) && !normalized.subject) {
    problems.push(problem("MISSING_SUBJECT", "This complementary-module type requires a subject."));
  }
  if ([COMPLEMENTARY_MODULE_TYPES.SYSTEM_LAYER, COMPLEMENTARY_MODULE_TYPES.SUBJECT_SYSTEM_LAYER].includes(normalized.type) && !normalized.gameSystem) {
    problems.push(problem("MISSING_GAME_SYSTEM", "This complementary-module type requires a game-system designation."));
  }
  if (!actual) problems.push(problem("MISSING_DISPLAY_TITLE", "The current display title is required."));
  if (actual && !actual.startsWith(FAMILY_NAME)) problems.push(problem("INVALID_FAMILY_PREFIX", `The title must begin with “${FAMILY_NAME}”.`));
  if (/Hunter[’‘`´]s Bestiary/.test(actual) || /Hunters['’] Bestiary/.test(actual)) {
    problems.push(problem("INVALID_APOSTROPHE", `Use exactly “${FAMILY_NAME}” with the ASCII apostrophe.`));
  }
  if (actual.includes("—") || actual.includes("–") || /\S-\S/.test(actual)) {
    problems.push(problem("INVALID_GAME_SYSTEM_SEPARATOR", "Use a spaced ASCII hyphen: “ - ”."));
  }
  if (normalized.subject && actual.includes(`${FAMILY_NAME} - ${normalized.subject}`)) {
    problems.push(problem("INVALID_SUBJECT_SEPARATOR", "Use a colon before a complementary subject."));
  }
  if (normalized.subject && normalized.gameSystem && actual.indexOf(normalized.gameSystem) >= 0 && actual.indexOf(normalized.subject) >= 0 && actual.indexOf(normalized.gameSystem) < actual.indexOf(normalized.subject)) {
    problems.push(problem("REVERSED_SUBJECT_SYSTEM_ORDER", "The complementary subject must appear before the game-system designation."));
  }
  if (actual && actual !== expected) problems.push(problem("TITLE_MISMATCH", `Expected “${expected}”.`));

  return Object.freeze({
    valid: problems.length === 0,
    actualName: actual,
    expectedName: expected,
    moduleId: normalized.moduleId,
    metadata: Object.freeze(clone(normalized)),
    problems: Object.freeze(problems.map(entry => Object.freeze(entry)))
  });
}

export class ComplementaryModuleRegistry {
  #records = new Map();
  #startupWarnings = new Set();

  register(metadata = {}) {
    const normalized = normalizeNamingMetadata(metadata);
    if (!normalized.moduleId) throw new Error("A complementary module registration requires moduleId.");
    const validation = validateComplementaryModuleName(normalized);
    const record = Object.freeze({ ...normalized, validation, registeredAt: new Date().toISOString() });
    this.#records.set(normalized.moduleId, record);
    return clone(record);
  }

  unregister(moduleId) {
    const id = text(moduleId);
    this.#startupWarnings.delete(id);
    return this.#records.delete(id);
  }

  get(moduleId) {
    const record = this.#records.get(text(moduleId));
    return record ? clone(record) : null;
  }

  list() {
    return [...this.#records.values()].map(clone);
  }

  shouldWarnAtStartup(moduleId) {
    const id = text(moduleId);
    if (this.#startupWarnings.has(id)) return false;
    this.#startupWarnings.add(id);
    return true;
  }
}
