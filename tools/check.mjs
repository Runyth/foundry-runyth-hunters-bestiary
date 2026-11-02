import { readFile, readdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const checks = [];

function pass(message) {
  checks.push(message);
}

function fail(message) {
  errors.push(message);
}

async function json(path) {
  try {
    return JSON.parse(await readFile(join(root, path), "utf8"));
  } catch (error) {
    fail(`${path}: ${error.message}`);
    return null;
  }
}

async function filesUnder(directory) {
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else output.push(path);
    }
  }
  await walk(join(root, directory));
  return output;
}

const manifest = await json("module.json");
const seed = await json("data/seed.json");
const en = await json("lang/en.json");
const de = await json("lang/de.json");

if (manifest) {
  if (manifest.id !== "hunters-bestiary") fail("module id must match the ZIP root folder");
  if (manifest.version !== "1.8.0") fail("unexpected manifest version");
  if (!manifest.esmodules?.includes("scripts/main.mjs")) fail("scripts/main.mjs is not loaded by the manifest");
  if (Object.hasOwn(manifest, "system")) fail("module manifest must not use the unsupported top-level system key");
  for (const path of [...(manifest.esmodules ?? []), ...(manifest.styles ?? []), ...(manifest.languages ?? []).map(item => item.path), manifest.readme, manifest.changelog, manifest.license, ...(manifest.media ?? []).map(item => item.url)].filter(Boolean)) {
    try {
      await access(join(root, path), fsConstants.R_OK);
    } catch {
      fail(`manifest path is missing: ${path}`);
    }
  }
  pass("manifest and referenced files");
}

if (seed) {
  const minima = { monsters: 24, tracks: 30, rumors: 40, books: 12, trailTemplates: 6, complications: 30, knowledgeLevels: 6 };
  for (const [key, minimum] of Object.entries(minima)) {
    if (!Array.isArray(seed[key])) fail(`seed.${key} must be an array`);
    else if (seed[key].length < minimum) fail(`seed.${key} requires at least ${minimum} entries`);
  }
  for (const key of ["monsters", "tracks", "rumors", "books", "trailTemplates"]) {
    const ids = (seed[key] ?? []).map(entry => entry.id);
    if (ids.length !== new Set(ids).size) fail(`seed.${key} contains duplicate IDs`);
  }
  const monsterIds = new Set((seed.monsters ?? []).map(monster => monster.id));
  const localizationKey = /^HB\.Content\./;
  const checkLocalized = (value, label) => {
    if (typeof value !== "string" || !localizationKey.test(value)) {
      fail(`${label} must be a standard HB.Content localization key`);
      return;
    }
    if (typeof en?.[value] !== "string" || !en[value].trim()) fail(`${label} is missing from English localization`);
    if (typeof de?.[value] !== "string" || !de[value].trim()) fail(`${label} is missing from German localization`);
  };
  for (const monster of seed.monsters ?? []) {
    for (const key of ["name", "summary", "rumor", "ecology", "behavior", "defenses", "weaknesses", "harvest", "gmSecrets"]) checkLocalized(monster[key], `${monster.id}.${key}`);
    for (const [index, value] of (monster.habitats ?? []).entries()) checkLocalized(value, `${monster.id}.habitats[${index}]`);
    for (const [index, value] of (monster.signs ?? []).entries()) checkLocalized(value, `${monster.id}.signs[${index}]`);
    checkLocalized(monster.actorSource?.reason, `${monster.id}.actorSource.reason`);
  }
  for (const book of seed.books ?? []) {
    checkLocalized(book.name, `${book.id}.name`);
    checkLocalized(book.summary, `${book.id}.summary`);
    if (!(book.chapters ?? []).length) fail(`${book.id} has no substantive chapters`);
    for (const [index, chapter] of (book.chapters ?? []).entries()) {
      checkLocalized(chapter.title, `${book.id}.chapters[${index}].title`);
      checkLocalized(chapter.body, `${book.id}.chapters[${index}].body`);
    }
  }
  for (const rumor of seed.rumors ?? []) {
    checkLocalized(rumor.text, `${rumor.id}.text`);
    if (!['true', 'mixed', 'false'].includes(rumor.truth)) fail(`${rumor.id}.truth is invalid`);
    for (const monsterId of rumor.monsterIds ?? []) if (!monsterIds.has(monsterId)) fail(`${rumor.id} references unknown monster ${monsterId}`);
  }
  if (!(seed.rumors ?? []).some(rumor => rumor.monsterIds?.length)) fail("at least one rumor must reveal a specific quarry");
  for (const template of seed.trailTemplates ?? []) {
    if (!template.steps?.length) fail(`${template.id} has no hunt steps`);
    const stepIds = (template.steps ?? []).map(step => step.id);
    if (stepIds.length !== new Set(stepIds).size) fail(`${template.id} has duplicate step IDs`);
    for (const step of template.steps ?? []) {
      checkLocalized(step.name, `${template.id}.${step.id}.name`);
      if (!Array.isArray(step.skills)) fail(`${template.id}.${step.id}.skills must be an array`);
    }
  }
  for (const complication of seed.complications ?? []) checkLocalized(complication.key, `${complication.id}.key`);
  pass("seed schema, counts, IDs, references, and modular localized content");
}

const scriptFiles = await filesUnder("scripts");
for (const path of scriptFiles.filter(path => extname(path) === ".mjs")) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (result.status !== 0) fail(`${relative(root, path)} syntax: ${result.stderr.trim()}`);
}
pass(`${scriptFiles.length} script files syntax-checked`);

const forbidden = [
  [/\bFormApplication\b/, "FormApplication"],
  [/\bFormDataExtended\b/, "FormDataExtended"],
  [/\bFilePicker\b/, "legacy FilePicker"],
  [/\bJournalTextPageSheet\b/, "JournalTextPageSheet"],
  [/\bDialog\.(confirm|prompt|wait)\b/, "legacy Dialog"]
];
for (const path of scriptFiles) {
  const text = await readFile(path, "utf8");
  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) fail(`${relative(root, path)} contains ${label}`);
  }
}
pass("deprecated V1 API scan");

const productionText = (await Promise.all(scriptFiles.map(path => readFile(path, "utf8")))).join("\n");
const interferencePatterns = [
  [/Hooks\.on\(["']renderApplication(?:V2)?["']/, "broad Application render hook"],
  [/Hooks\.on\(["']renderChatMessage["']/, "deprecated Chat render hook"],
  [/Hooks\.on\(["']renderActorSheet/, "Actor sheet injection"],
  [/Hooks\.on\(["']renderItemSheet/, "Item sheet injection"],
  [/html\.(?:find|on|data|attr)\(/, "jQuery-style hook argument usage"],
  [/\bjQuery\s*\(/, "jQuery usage"],
  [/controls\.push\(/, "legacy array Scene Controls mutation"],
  [/data-action=["']tab["']/, "reserved ApplicationV2 tab action"],
  [/\bPIXI\b|canvasReady|canvasTearDown|refreshToken/, "canvas overlay integration"]
];
for (const [pattern, label] of interferencePatterns) if (pattern.test(productionText)) fail(`production source contains ${label}`);
for (const requiredHook of ["renderTokenHUD", "renderActorDirectory", "renderJournalDirectory", "getSceneControlButtons"]) {
  if (!productionText.includes(`Hooks.on(\"${requiredHook}\"`)) fail(`missing narrow integration hook: ${requiredHook}`);
}
pass("hook ownership, native DOM, Chat, Scene Controls, and canvas isolation audit");

for (const path of scriptFiles) {
  const text = await readFile(path, "utf8");
  for (const match of text.matchAll(/(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = resolve(dirname(path), match[1]);
    try { await access(target, fsConstants.R_OK); }
    catch { fail(`${relative(root, path)} imports missing file: ${match[1]}`); }
  }
}
pass("all production relative imports resolve");

for (const path of await filesUnder("styles")) {
  const css = await readFile(path, "utf8");
  const globalRules = [
    [/^\s*\.window-header\b/m, ".window-header"],
    [/^\s*\.window-content\b/m, ".window-content"],
    [/^\s*\.application\b/m, ".application"],
    [/^\s*\.sr-only\b/m, ".sr-only"],
    [/^\s*(?:button|input|select|label)\b[^,{]*\{/m, "bare form/control element"],
    [/(^|,)\s*\.muted\b/m, ".muted"]
  ];
  for (const [pattern, label] of globalRules) if (pattern.test(css)) fail(`${relative(root, path)} contains unscoped ${label} rule`);
}
pass("stylesheet isolation audit");

if (en && de) {
  const enKeys = Object.keys(en).sort();
  const deKeys = Object.keys(de).sort();
  if (JSON.stringify(enKeys) !== JSON.stringify(deKeys)) {
    const missingDe = enKeys.filter(key => !(key in de));
    const missingEn = deKeys.filter(key => !(key in en));
    fail(`localization mismatch; missing DE: ${missingDe.join(", ")}; missing EN: ${missingEn.join(", ")}`);
  }
  const contentFiles = [...scriptFiles, ...(await filesUnder("templates"))];
  const referenced = new Set();
  for (const path of contentFiles) {
    const text = await readFile(path, "utf8");
    for (const match of text.matchAll(/["'](HB\.[A-Za-z0-9_.-]+)["']/g)) referenced.add(match[1]);
  }
  for (const key of referenced) if (!(key in en)) fail(`missing localization key: ${key}`);
  for (const status of ["draft", "active", "paused", "resolved", "failed"]) if (!(`HB.HuntStatus.${status}` in en)) fail(`missing dynamic status localization: ${status}`);
  for (const outcome of ["slain", "captured", "driven-off", "relocated", "observed", "negotiated", "released", "evaded", "escaped", "unknown"]) if (!(`HB.Outcomes.${outcome}` in en)) fail(`missing dynamic outcome localization: ${outcome}`);
  for (const truth of ["true", "mixed", "false", "unknown"]) if (!(`HB.RumorTruth.${truth}` in en)) fail(`missing dynamic rumor-truth localization: ${truth}`);
  pass(`${enKeys.length} modular English/German localization keys and static references`);
}

const templateFiles = await filesUnder("templates");
const actions = new Set();
for (const path of templateFiles) {
  const text = await readFile(path, "utf8");
  for (const match of text.matchAll(/data-action="([A-Za-z0-9_-]+)"/g)) actions.add(match[1]);
}
const combinedScripts = productionText;
for (const action of actions) {
  if (!new RegExp(`\\b${action}\\s*:`).test(combinedScripts)) fail(`template action has no ApplicationV2 handler: ${action}`);
}
pass(`${actions.size} template actions mapped`);

if (errors.length) {
  console.error(`Hunter's Bestiary validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Hunter's Bestiary validation passed (${checks.length} groups):`);
for (const check of checks) console.log(`- ${check}`);
