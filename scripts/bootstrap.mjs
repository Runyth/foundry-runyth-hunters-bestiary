import { MODULE_ID, MODULE_VERSION, SCHEMA_VERSION, SETTINGS } from "./constants.mjs";
import { clone, moduleLog, moduleWarn } from "./utils.mjs";
import { evaluateMonsterCompleteness } from "./providers.mjs";

let seedCache = null;
let seedPromise = null;

export async function loadSeed() {
  if (!seedCache) {
    seedPromise ??= (async () => {
      const response = await fetch(`modules/${MODULE_ID}/data/seed.json`, { cache: "default" });
      if (!response.ok) throw new Error(`Could not load seed data (${response.status}).`);
      const seed = await response.json();
      validateSeed(seed);
      seedCache = seed;
      return seed;
    })().finally(() => { seedPromise = null; });
    await seedPromise;
  }
  return clone(seedCache);
}

export function validateSeed(seed) {
  if (!seed || typeof seed !== "object") throw new Error("Seed data is not an object.");
  for (const key of ["monsters", "tracks", "rumors", "books", "trailTemplates", "complications", "knowledgeLevels"]) {
    if (!Array.isArray(seed[key])) throw new Error(`Seed data field ${key} must be an array.`);
  }
  const unique = (items, label) => {
    const ids = items.map(item => item.id).filter(Boolean);
    if (ids.length !== new Set(ids).size) throw new Error(`Duplicate ${label} id detected.`);
  };
  unique(seed.monsters, "monster");
  unique(seed.tracks, "track");
  unique(seed.rumors, "rumor");
  unique(seed.books, "book");
  unique(seed.trailTemplates, "trail template");
  unique(seed.complications, "complication");
  for (const monster of seed.monsters) {
    const report = evaluateMonsterCompleteness(monster, seed);
    if (!report.complete) throw new Error(`Incomplete seed monster package ${monster.id}: ${report.errors.join("; ")}`);
  }
  return true;
}

export async function initializeWorldData() {
  const current = game.settings.get(MODULE_ID, SETTINGS.WORLD_DATA);
  if (current?.monsters?.length) {
    const currentSchema = Number(current.schemaVersion ?? 1);
    if (currentSchema >= SCHEMA_VERSION) return current;
    if (!game.user.isGM) {
      moduleWarn(`World catalogue schema ${currentSchema} requires a GM migration to schema ${SCHEMA_VERSION}.`);
      return current;
    }
    const seed = await loadSeed();
    const migrated = migrateWorldData(current, seed);
    await game.settings.set(MODULE_ID, SETTINGS.WORLD_DATA, migrated);
    await game.settings.set(MODULE_ID, SETTINGS.SCHEMA_VERSION, SCHEMA_VERSION);
    moduleLog(`Migrated catalogue from schema ${currentSchema} to ${SCHEMA_VERSION}.`);
    return migrated;
  }
  if (!game.user.isGM) {
    moduleWarn("World catalogue has not been initialized. A GM must log in once.");
    return current;
  }
  const seed = await loadSeed();
  seed.moduleVersion = MODULE_VERSION;
  seed.schemaVersion = SCHEMA_VERSION;
  await game.settings.set(MODULE_ID, SETTINGS.WORLD_DATA, seed);
  await game.settings.set(MODULE_ID, SETTINGS.SCHEMA_VERSION, SCHEMA_VERSION);
  moduleLog(`Initialized catalogue with ${seed.monsters.length} monsters.`);
  return seed;
}

export function migrateWorldData(input, seed) {
  const output = clone(input ?? {});
  for (const key of ["monsters", "tracks", "rumors", "books", "trailTemplates", "complications", "knowledgeLevels"]) {
    output[key] = Array.isArray(output[key]) ? output[key] : clone(seed[key] ?? []);
  }

  const seedMonsters = new Map((seed.monsters ?? []).map(monster => [monster.id, monster]));
  for (const [index, complication] of output.complications.entries()) {
    complication.id ??= seed.complications?.[index]?.id ?? `legacy-complication-${index + 1}`;
  }
  for (const monster of output.monsters) {
    const builtIn = !monster.providerId ? seedMonsters.get(monster.id) : null;
    if (builtIn) {
      monster.contentLinks ??= clone(builtIn.contentLinks ?? {});
      monster.actorSource ??= clone(builtIn.actorSource);
    } else if (!monster.actorSource && monster.actorUuid) {
      monster.actorSource = { mode: "uuid", uuid: monster.actorUuid };
    }
  }
  output.moduleVersion = MODULE_VERSION;
  output.schemaVersion = SCHEMA_VERSION;
  return output;
}

export async function resetWorldDataToSeed() {
  if (!game.user.isGM) throw new Error("Only a GM may reset the catalogue.");
  const seed = await loadSeed();
  seed.moduleVersion = MODULE_VERSION;
  seed.schemaVersion = SCHEMA_VERSION;
  await game.settings.set(MODULE_ID, SETTINGS.WORLD_DATA, seed);
  await game.settings.set(MODULE_ID, SETTINGS.SCHEMA_VERSION, SCHEMA_VERSION);
  return seed;
}
