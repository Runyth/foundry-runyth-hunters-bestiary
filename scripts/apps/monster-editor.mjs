// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID } from "../constants.mjs";
import { getWorldData, setWorldData, appendAudit } from "../state.mjs";
import { localizeText, notify, slugify, clone } from "../utils.mjs";

function actionCancel() {
  return this.close();
}

async function actionSave() {
  if (!game.user.isGM) return;
  const form = this.element.querySelector("form");
  if (!form) return;
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  const id = String(data.get("id") || slugify(name));
  const monster = {
    id,
    name,
    type: String(data.get("type") ?? "beast").trim(),
    tier: Number(data.get("tier") ?? 1),
    tags: lines(data.get("tags"), /[,\n]/),
    habitats: lines(data.get("habitats")),
    summary: String(data.get("summary") ?? "").trim(),
    rumor: String(data.get("rumor") ?? "").trim(),
    signs: lines(data.get("signs")),
    ecology: String(data.get("ecology") ?? "").trim(),
    behavior: String(data.get("behavior") ?? "").trim(),
    defenses: String(data.get("defenses") ?? "").trim(),
    weaknesses: String(data.get("weaknesses") ?? "").trim(),
    harvest: String(data.get("harvest") ?? "").trim(),
    gmSecrets: String(data.get("gmSecrets") ?? "").trim(),
    preferredSkills: lines(data.get("preferredSkills"), /[,\s]+/),
    actorUuid: String(data.get("actorUuid") ?? "").trim(),
    providerId: this.monster.providerId,
    contentLinks: clone(this.monster.contentLinks ?? {}),
    actorSource: clone(this.monster.actorSource)
  };
  if (!monster.providerId) delete monster.providerId;
  if (!monster.actorSource && monster.actorUuid) monster.actorSource = { mode: "uuid", uuid: monster.actorUuid };
  if (!monster.name) return notify("warn", game.i18n.localize("HB.Errors.MonsterNameRequired"));

  const world = getWorldData();
  const index = world.monsters.findIndex(entry => entry.id === this.originalId);
  const duplicate = world.monsters.find(entry => entry.id === monster.id && entry.id !== this.originalId);
  if (duplicate) return notify("error", game.i18n.localize("HB.Errors.DuplicateMonsterId"));
  if (index >= 0) world.monsters[index] = monster;
  else world.monsters.push(monster);
  await setWorldData(world);
  await appendAudit({ type: index >= 0 ? "monster-update" : "monster-create", monsterId: monster.id });
  notify("info", game.i18n.localize("HB.Notifications.MonsterSaved"));
  Hooks.callAll(`${MODULE_ID}.catalogChanged`, monster);
  return this.close();
}

async function actionDelete() {
  if (!game.user.isGM || !this.originalId) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("HB.Dialogs.DeleteMonster.Title") },
    content: `<p>${game.i18n.localize("HB.Dialogs.DeleteMonster.Content")}</p>`,
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return;
  const world = getWorldData();
  world.monsters = world.monsters.filter(entry => entry.id !== this.originalId);
  await setWorldData(world);
  await appendAudit({ type: "monster-delete", monsterId: this.originalId });
  Hooks.callAll(`${MODULE_ID}.catalogChanged`, { id: this.originalId, deleted: true });
  return this.close();
}

export class MonsterEditorApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-monster-editor",
    position: { width: 760, height: 800 },
    window: {
      title: "HB.MonsterEditor.Title",
      icon: "fa-solid fa-dragon"
    },
    actions: {
      save: actionSave,
      cancel: actionCancel,
      delete: actionDelete
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/monster-editor.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.monster = clone(options.monster ?? emptyMonster());
    this.originalId = options.monster?.id ?? null;
  }

  get animateClose() {
    return false;
  }

  get waitForGeometryOnClose() {
    return false;
  }

  async _prepareContext() {
    const monster = this.monster;
    return {
      editing: Boolean(this.originalId),
      monster: {
        ...monster,
        nameText: localizeText(monster.name),
        tagsText: (monster.tags ?? []).join(", "),
        habitatsText: localizeText(monster.habitats ?? []).join("\n"),
        signsText: localizeText(monster.signs ?? []).join("\n"),
        preferredSkillsText: (monster.preferredSkills ?? []).join(", "),
        summaryText: localizeText(monster.summary),
        rumorText: localizeText(monster.rumor),
        ecologyText: localizeText(monster.ecology),
        behaviorText: localizeText(monster.behavior),
        defensesText: localizeText(monster.defenses),
        weaknessesText: localizeText(monster.weaknesses),
        harvestText: localizeText(monster.harvest),
        gmSecretsText: localizeText(monster.gmSecrets)
      }
    };
  }
}

function emptyMonster() {
  return {
    id: "",
    name: "",
    type: "beast",
    tier: 1,
    tags: [],
    habitats: [],
    summary: "",
    rumor: "",
    signs: [],
    ecology: "",
    behavior: "",
    defenses: "",
    weaknesses: "",
    harvest: "",
    gmSecrets: "",
    preferredSkills: ["sur", "nat"],
    actorUuid: ""
  };
}

function lines(value, separator = /\n/) {
  return String(value ?? "").split(separator).map(entry => entry.trim()).filter(Boolean);
}
