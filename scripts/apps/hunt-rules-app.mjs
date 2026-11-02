import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID, SKILL_LABELS } from "../constants.mjs";
import { getWorldData } from "../state.mjs";
import {
  DISCLOSURE_FIELDS,
  PLAYER_RESOLUTION_OUTCOMES,
  getHuntRules,
  setHuntRules,
  normalizeHuntRules,
  DIFFICULTY_TIERS
} from "../hunt-rules.mjs";
import { bindStableSearch } from "../ui-toolkit.mjs";
import { localizeText, notify } from "../utils.mjs";
import { BUILTIN_HUNT_COLOR_PRESETS, getHuntDisplayColors, presetColors, setHuntDisplayColors } from "../hunt-display.mjs";

function knowledgeOptions(levels, selected, includeInherit = false) {
  const options = [];
  if (includeInherit) options.push({ value: "inherit", label: game.i18n.localize("HB.HuntRules.Inherit"), selected: selected == null });
  for (const level of levels ?? []) options.push({
    value: String(level.level),
    label: `${level.level} — ${localizeText(level.name)}`,
    selected: selected != null && Number(selected) === Number(level.level)
  });
  return options;
}

function disclosureRows(rules, levels) {
  return DISCLOSURE_FIELDS.map(field => {
    const rule = rules.disclosure[field];
    return {
      field,
      label: game.i18n.localize(`HB.HuntRules.Field.${field}`),
      minLevel: rule.minLevel,
      minPoints: rule.minPoints,
      minRumors: rule.minRumors,
      chance: rule.chance,
      gmApproval: rule.gmApproval,
      levelOptions: knowledgeOptions(levels, rule.minLevel)
    };
  });
}

function resolutionRows(rules) {
  return PLAYER_RESOLUTION_OUTCOMES.map(outcome => {
    const rule = rules.resolution[outcome];
    return {
      outcome,
      label: game.i18n.localize(`HB.Outcomes.${outcome}`),
      mode: rule.mode,
      dc: rule.dc,
      skills: rule.skills.join(", "),
      modes: ["auto", "gm", "check-gm"].map(mode => ({ value: mode, label: game.i18n.localize(`HB.HuntRules.ResolutionMode.${mode}`), selected: mode === rule.mode }))
    };
  });
}

async function actionSave() {
  if (!game.user?.isGM) return;
  const form = this.element?.querySelector("form");
  if (!form) return;
  const data = new FormData(form);
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const current = getHuntRules(monsterIds);
  const next = structuredClone(current);
  next.minimumHuntLevel = Number(data.get("minimumHuntLevel") ?? 0);
  next.avoidImmediateRepeat = data.get("avoidImmediateRepeat") === "on";
  next.quarryPool = data.getAll("quarryPool").map(String);
  next.fieldwork = {
    trackSearch: { minRumors: Number(data.get("fieldwork.trackSearch.minRumors") ?? 0) },
    sighting: {
      minSuccessfulTracks: Number(data.get("fieldwork.sighting.minSuccessfulTracks") ?? 0),
      chance: Number(data.get("fieldwork.sighting.chance") ?? 0),
      gmApproval: data.get("fieldwork.sighting.gmApproval") === "on"
    },
    difficulty: {
      minSightings: Number(data.get("fieldwork.difficulty.minSightings") ?? 0),
      chance: Number(data.get("fieldwork.difficulty.chance") ?? 0),
      gmApproval: data.get("fieldwork.difficulty.gmApproval") === "on"
    },
    huntStart: { requireDifficulty: data.get("fieldwork.huntStart.requireDifficulty") === "on" },
    maxDeferredQuarries: Number(data.get("fieldwork.maxDeferredQuarries") ?? 0),
    maxActiveHunts: Number(data.get("fieldwork.maxActiveHunts") ?? 1)
  };
  next.difficultyBands = Object.fromEntries(DIFFICULTY_TIERS.map(tier => [String(tier), {
    customLabel: String(data.get(`difficultyBand.${tier}`) ?? "").trim().slice(0, 80)
  }]));
  for (const field of DISCLOSURE_FIELDS) {
    next.disclosure[field] = {
      minLevel: Number(data.get(`disclosure.${field}.minLevel`) ?? 0),
      minPoints: Number(data.get(`disclosure.${field}.minPoints`) ?? 0),
      minRumors: Number(data.get(`disclosure.${field}.minRumors`) ?? 0),
      chance: Number(data.get(`disclosure.${field}.chance`) ?? 0),
      gmApproval: data.get(`disclosure.${field}.gmApproval`) === "on"
    };
  }
  for (const outcome of PLAYER_RESOLUTION_OUTCOMES) {
    next.resolution[outcome] = {
      mode: String(data.get(`resolution.${outcome}.mode`) ?? "gm"),
      dc: Number(data.get(`resolution.${outcome}.dc`) ?? 0),
      skills: String(data.get(`resolution.${outcome}.skills`) ?? "").split(",").map(value => value.trim()).filter(value => value in SKILL_LABELS)
    };
  }
  const colorConfig = getHuntDisplayColors();
  for (const state of ["available", "researched", "captured", "slain", "escaped"]) {
    colorConfig.colors[state] = String(data.get(`huntColor.${state}`) ?? colorConfig.colors[state]);
  }
  const requestedPreset = String(data.get("huntColorPreset") ?? "");
  const requestedColors = presetColors(requestedPreset, colorConfig);
  colorConfig.activePreset = requestedColors && Object.entries(colorConfig.colors).every(([state, color]) => requestedColors[state] === color)
    ? requestedPreset
    : "custom";
  await Promise.all([setHuntRules(next, monsterIds), setHuntDisplayColors(colorConfig)]);
  notify("info", game.i18n.localize("HB.HuntRules.Saved"));
  return this.render({ force: true });
}


function actionApplyColorPreset() {
  if (!game.user?.isGM) return;
  const select = this.element?.querySelector('select[name="huntColorPreset"]');
  const colors = presetColors(select?.value, getHuntDisplayColors());
  if (!colors) return;
  for (const [state, color] of Object.entries(colors)) {
    const input = this.element?.querySelector(`input[name="huntColor.${state}"]`);
    if (input) input.value = color;
  }
}

async function actionSaveColorPreset() {
  if (!game.user?.isGM) return;
  const name = String(this.element?.querySelector('input[name="customColorPresetName"]')?.value ?? "").trim().slice(0, 80);
  if (!name) return notify("warn", game.i18n.localize("HB.HuntDisplay.PresetNameRequired"));
  const config = getHuntDisplayColors();
  const colors = {};
  for (const state of ["available", "researched", "captured", "slain", "escaped"]) colors[state] = this.element?.querySelector(`input[name="huntColor.${state}"]`)?.value;
  config.customPresets[name] = colors;
  config.activePreset = name;
  config.colors = colors;
  await setHuntDisplayColors(config);
  notify("info", game.i18n.localize("HB.HuntDisplay.PresetSaved"));
  return this.render({ force: true });
}

function actionEditOverride(_event, target) {
  if (!game.user?.isGM) return;
  const monsterId = target.dataset.monsterId;
  if (!monsterId) return;
  return new MonsterHuntRulesApp({ monsterId }).render({ force: true });
}

function actionClose() {
  return this.close();
}

export class HuntRulesApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-hunt-rules",
    position: { width: 980, height: 820 },
    window: { title: "HB.HuntRules.Title", icon: "fa-solid fa-sliders" },
    actions: { save: actionSave, editOverride: actionEditOverride, applyColorPreset: actionApplyColorPreset, saveColorPreset: actionSaveColorPreset, close: actionClose }
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/hunt-rules.hbs` } };

  #poolSearch = null;
  #overrideSearch = null;

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#poolSearch?.destroy();
    this.#overrideSearch?.destroy();
    this.#poolSearch = bindStableSearch(this.element, {
      inputSelector: '[data-hb-search="quarry-pool"]',
      entrySelector: '[data-hb-list="quarry-pool"] [data-search-text]',
      emptySelector: '[data-hb-search-empty="quarry-pool"]'
    });
    this.#overrideSearch = bindStableSearch(this.element, {
      inputSelector: '[data-hb-search="hunt-overrides"]',
      entrySelector: '[data-hb-list="hunt-overrides"] [data-search-text]',
      emptySelector: '[data-hb-search-empty="hunt-overrides"]'
    });
  }

  async _preClose(options) {
    this.#poolSearch?.destroy();
    this.#overrideSearch?.destroy();
    this.#poolSearch = null;
    this.#overrideSearch = null;
    return super._preClose(options);
  }

  async _prepareContext() {
    const world = getWorldData();
    const monsters = world.monsters ?? [];
    const monsterIds = monsters.map(entry => entry.id);
    const rules = getHuntRules(monsterIds);
    const overrideIds = new Set(Object.keys(rules.monsterOverrides ?? {}));
    const quarryPoolIds = new Set(rules.quarryPool);
    const huntColors = getHuntDisplayColors();
    const presetNames = [...Object.keys(BUILTIN_HUNT_COLOR_PRESETS), ...Object.keys(huntColors.customPresets ?? {})];
    return {
      rules,
      minimumLevelOptions: knowledgeOptions(world.knowledgeLevels, rules.minimumHuntLevel),
      disclosureRows: disclosureRows(rules, world.knowledgeLevels),
      resolutionRows: resolutionRows(rules),
      fieldwork: rules.fieldwork,
      difficultyBands: DIFFICULTY_TIERS.map(tier => ({
        tier,
        defaultLabel: game.i18n.localize(`HB.Difficulty.Tier.${tier}`),
        customLabel: rules.difficultyBands?.[String(tier)]?.customLabel ?? ""
      })),
      quarryPoolCount: rules.quarryPool.length,
      monsters: monsters.map(monster => ({
        id: monster.id,
        name: localizeText(monster.name),
        checked: quarryPoolIds.has(monster.id),
        hasOverride: overrideIds.has(monster.id),
        searchText: `${localizeText(monster.name)} ${monster.id}`.toLocaleLowerCase()
      })).sort((a, b) => a.name.localeCompare(b.name)),
      skillReference: Object.entries(SKILL_LABELS).map(([id, label]) => `${id}=${label}`).join(" · "),
      huntColorRows: ["available", "researched", "captured", "slain", "escaped"].map(state => ({ state, label: game.i18n.localize(`HB.HuntDisplay.State.${state}`), color: huntColors.colors[state] })),
      huntColorPresets: presetNames.map(name => ({ name, label: game.i18n.localize(`HB.HuntDisplay.Preset.${name}`) === `HB.HuntDisplay.Preset.${name}` ? name : game.i18n.localize(`HB.HuntDisplay.Preset.${name}`), selected: huntColors.activePreset === name }))
    };
  }
}

function triState(value) {
  return {
    value: value == null ? "inherit" : value ? "yes" : "no",
    inherit: value == null,
    yes: value === true,
    no: value === false
  };
}

async function actionSaveOverride() {
  if (!game.user?.isGM) return;
  const form = this.element?.querySelector("form");
  if (!form) return;
  const data = new FormData(form);
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  const next = structuredClone(rules);
  const disclosure = {};
  for (const field of DISCLOSURE_FIELDS) {
    const entry = {};
    for (const key of ["minLevel", "minPoints", "minRumors", "chance"]) {
      const raw = String(data.get(`disclosure.${field}.${key}`) ?? "").trim();
      if (raw !== "") entry[key] = Number(raw);
    }
    const approval = String(data.get(`disclosure.${field}.gmApproval`) ?? "inherit");
    if (approval !== "inherit") entry.gmApproval = approval === "yes";
    if (Object.keys(entry).length) disclosure[field] = entry;
  }
  const minimumRaw = String(data.get("minimumHuntLevel") ?? "inherit");
  const difficultyRaw = String(data.get("difficultyTier") ?? "inherit");
  const fieldwork = {};
  const numberOverride = (name, min = 0, max = 9999) => {
    const raw = String(data.get(name) ?? "").trim();
    if (raw === "") return undefined;
    return Math.max(min, Math.min(max, Number(raw) || 0));
  };
  const booleanOverride = name => {
    const raw = String(data.get(name) ?? "inherit");
    return raw === "inherit" ? undefined : raw === "yes";
  };
  const trackMin = numberOverride("fieldwork.trackSearch.minRumors");
  if (trackMin !== undefined) fieldwork.trackSearch = { minRumors: trackMin };
  const sighting = {
    minSuccessfulTracks: numberOverride("fieldwork.sighting.minSuccessfulTracks"),
    chance: numberOverride("fieldwork.sighting.chance", 0, 100),
    gmApproval: booleanOverride("fieldwork.sighting.gmApproval")
  };
  for (const key of Object.keys(sighting)) if (sighting[key] === undefined) delete sighting[key];
  if (Object.keys(sighting).length) fieldwork.sighting = sighting;
  const difficulty = {
    minSightings: numberOverride("fieldwork.difficulty.minSightings"),
    chance: numberOverride("fieldwork.difficulty.chance", 0, 100),
    gmApproval: booleanOverride("fieldwork.difficulty.gmApproval")
  };
  for (const key of Object.keys(difficulty)) if (difficulty[key] === undefined) delete difficulty[key];
  if (Object.keys(difficulty).length) fieldwork.difficulty = difficulty;
  const requireDifficulty = booleanOverride("fieldwork.huntStart.requireDifficulty");
  if (requireDifficulty !== undefined) fieldwork.huntStart = { requireDifficulty };
  const override = {
    minimumHuntLevel: minimumRaw === "inherit" ? null : Number(minimumRaw),
    difficultyTier: difficultyRaw === "inherit" ? null : Number(difficultyRaw),
    disclosure,
    fieldwork
  };
  if (override.minimumHuntLevel == null) delete override.minimumHuntLevel;
  if (override.difficultyTier == null) delete override.difficultyTier;
  if (!Object.keys(disclosure).length) delete override.disclosure;
  if (!Object.keys(fieldwork).length) delete override.fieldwork;
  if (!Object.keys(override).length) delete next.monsterOverrides[this.monsterId];
  else next.monsterOverrides[this.monsterId] = override;
  await setHuntRules(next, monsterIds);
  notify("info", game.i18n.localize("HB.HuntRules.OverrideSaved"));
  return this.render({ force: true });
}

async function actionResetOverride() {
  if (!game.user?.isGM) return;
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  delete rules.monsterOverrides[this.monsterId];
  await setHuntRules(rules, monsterIds);
  notify("info", game.i18n.localize("HB.HuntRules.OverrideReset"));
  return this.render({ force: true });
}

export class MonsterHuntRulesApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-monster-hunt-rules",
    position: { width: 850, height: 760 },
    window: { title: "HB.HuntRules.OverrideTitle", icon: "fa-solid fa-sliders" },
    actions: { saveOverride: actionSaveOverride, resetOverride: actionResetOverride, close: actionClose }
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/monster-hunt-rules.hbs` } };

  constructor(options = {}) {
    super(options);
    this.monsterId = String(options.monsterId ?? "");
  }

  async _prepareContext() {
    const world = getWorldData();
    const monster = (world.monsters ?? []).find(entry => entry.id === this.monsterId);
    if (!monster) throw new Error("Unknown monster override target.");
    const monsterIds = (world.monsters ?? []).map(entry => entry.id);
    const rules = normalizeHuntRules(getHuntRules(monsterIds), monsterIds);
    const override = rules.monsterOverrides?.[this.monsterId] ?? {};
    const rows = DISCLOSURE_FIELDS.map(field => {
      const global = rules.disclosure[field];
      const local = override.disclosure?.[field] ?? {};
      return {
        field,
        label: game.i18n.localize(`HB.HuntRules.Field.${field}`),
        globalSummary: game.i18n.format("HB.HuntRules.GlobalRuleSummary", {
          level: global.minLevel, points: global.minPoints, rumors: global.minRumors, chance: global.chance
        }),
        minLevel: local.minLevel ?? "",
        minPoints: local.minPoints ?? "",
        minRumors: local.minRumors ?? "",
        chance: local.chance ?? "",
        approval: local.gmApproval == null ? "inherit" : local.gmApproval ? "yes" : "no",
        approvalInherit: local.gmApproval == null,
        approvalYes: local.gmApproval === true,
        approvalNo: local.gmApproval === false
      };
    });
    return {
      monsterId: monster.id,
      monsterName: localizeText(monster.name),
      minimumLevelOptions: knowledgeOptions(world.knowledgeLevels, override.minimumHuntLevel, true),
      difficultyTierOptions: [
        { value: "inherit", label: game.i18n.localize("HB.HuntRules.Inherit"), selected: override.difficultyTier == null },
        ...DIFFICULTY_TIERS.map(tier => ({ value: String(tier), label: `${tier} — ${game.i18n.localize(`HB.Difficulty.Tier.${tier}`)}`, selected: Number(override.difficultyTier) === tier }))
      ],
      fieldworkOverride: {
        trackMinRumors: override.fieldwork?.trackSearch?.minRumors ?? "",
        sightingMinTracks: override.fieldwork?.sighting?.minSuccessfulTracks ?? "",
        sightingChance: override.fieldwork?.sighting?.chance ?? "",
        sightingApproval: triState(override.fieldwork?.sighting?.gmApproval),
        difficultyMinSightings: override.fieldwork?.difficulty?.minSightings ?? "",
        difficultyChance: override.fieldwork?.difficulty?.chance ?? "",
        difficultyApproval: triState(override.fieldwork?.difficulty?.gmApproval),
        requireDifficulty: triState(override.fieldwork?.huntStart?.requireDifficulty)
      },
      fieldworkGlobal: rules.fieldwork,
      rows
    };
  }
}
