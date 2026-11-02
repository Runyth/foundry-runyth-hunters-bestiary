// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID, HUNT_STATUS } from "../constants.mjs";
import { getWorldData, getProgress, knowledgeLevel } from "../state.mjs";
import { createHuntFromTemplate, normalizeHunt, saveHunt } from "../hunts.mjs";
import { localizeText, notify } from "../utils.mjs";
import { getHuntRules, minimumHuntKnowledgeLevel, PLAYER_RESOLUTION_OUTCOMES } from "../hunt-rules.mjs";
import { classifyHuntMonsterState, getHuntDisplayColors, huntMonsterColor } from "../hunt-display.mjs";
import { requestGm } from "../socket.mjs";
import { FIELDWORK_TYPES } from "../fieldwork.mjs";

function actionCancel() {
  return this.close();
}

async function actionSave() {
  if (!game.user.isGM && !this.proposalMode) return;
  const form = this.element.querySelector("form");
  if (!form) return;
  const data = new FormData(form);
  const world = getWorldData();
  const template = world.trailTemplates.find(entry => entry.id === data.get("templateId")) ?? world.trailTemplates[0];
  const values = {
    title: String(data.get("title") ?? "").trim(),
    monsterId: String(data.get("monsterId") ?? ""),
    region: String(data.get("region") ?? "").trim(),
    patron: String(data.get("patron") ?? "").trim(),
    stakes: String(data.get("stakes") ?? "").trim(),
    participantUserIds: data.getAll("participantUserIds").map(String),
    templateId: template?.id,
    visibility: String(data.get("visibility") ?? "participants"),
    status: String(data.get("status") ?? HUNT_STATUS.ACTIVE),
    plannedOutcome: String(data.get("plannedOutcome") ?? "") || null,
    notes: String(data.get("notes") ?? data.get("playerNotes") ?? "").trim()
  };
  if (!values.title || !values.monsterId) {
    return notify("warn", game.i18n.localize("HB.Errors.HuntTitleMonsterRequired"));
  }
  if (this.proposalMode && !game.user.isGM) {
    await requestGm("request-fieldwork", {
      type: FIELDWORK_TYPES.HUNT_PROPOSAL,
      monsterId: values.monsterId,
      detail: values.title,
      payload: {
        title: values.title,
        region: values.region,
        patron: values.patron,
        stakes: values.stakes,
        templateId: values.templateId,
        plannedOutcome: values.plannedOutcome,
        playerNotes: values.notes
      }
    });
    notify("info", game.i18n.localize("HB.Notifications.HuntProposalQueued"));
    return this.close();
  }
  let hunt;
  if (this.hunt) {
    hunt = normalizeHunt({ ...this.hunt, ...values });
    if (this.hunt.templateId !== template?.id) {
      const rebuilt = createHuntFromTemplate({ ...values, template, plannedOutcome: values.plannedOutcome });
      hunt.steps = rebuilt.steps;
      hunt.currentStep = 0;
    }
  } else {
    hunt = createHuntFromTemplate({ ...values, template, plannedOutcome: values.plannedOutcome });
    hunt.visibility = values.visibility;
    hunt.status = values.status;
    hunt.notes = values.notes;
  }
  try {
    await saveHunt(hunt);
  } catch (error) {
    notify("warn", String(error?.message ?? error));
    return;
  }
  notify("info", game.i18n.localize("HB.Notifications.HuntSaved"));
  Hooks.callAll(`${MODULE_ID}.huntChanged`, hunt);
  return this.close();
}

export class HuntEditorApp extends PersistentApplication {
  #monsterChoices = [];
  #fastSelectAbort = null;
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-hunt-editor",
    position: { width: 720, height: 720 },
    window: {
      title: "HB.HuntEditor.Title",
      icon: "fa-solid fa-location-crosshairs"
    },
    actions: {
      save: actionSave,
      cancel: actionCancel
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/hunt-editor.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.hunt = options.hunt ? normalizeHunt(options.hunt) : null;
    this.proposalMode = Boolean(options.proposalMode);
    this.proposalMonsterId = options.monsterId ? String(options.monsterId) : null;
    this.knowledgeUserId = options.knowledgeUserId ? String(options.knowledgeUserId) : null;
    this.knowledgeActorName = String(options.knowledgeActorName ?? "");
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#fastSelectAbort?.abort();
    this.#fastSelectAbort = new AbortController();
    const signal = this.#fastSelectAbort.signal;
    const root = this.element?.querySelector?.("[data-hb-fast-select]");
    if (!root) return;
    const trigger = root.querySelector("[data-hb-fast-trigger]");
    const panel = root.querySelector("[data-hb-fast-panel]");
    const search = root.querySelector("[data-hb-fast-search]");
    const results = root.querySelector("[data-hb-fast-results]");
    const hidden = root.querySelector('input[name="monsterId"]');
    const label = root.querySelector("[data-hb-fast-label]");
    let frame = 0;
    const renderResults = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const query = String(search?.value ?? "").trim().toLocaleLowerCase();
        const choices = query ? this.#monsterChoices.filter(choice => choice.searchText.includes(query)) : this.#monsterChoices;
        results.replaceChildren(...choices.slice(0, 80).map(choice => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "hb-fast-select-option";
          button.dataset.value = choice.id;
          button.style.setProperty("--hb-option-accent", choice.color || "transparent");
          const name = document.createElement("strong");
          name.textContent = choice.name;
          const meta = document.createElement("small");
          meta.textContent = `${game.i18n.localize("HB.Hunts.MinKnowledgeShort")} ${choice.minimumHuntLevel}${choice.stateLabel ? ` · ${choice.stateLabel}` : ""}`;
          button.append(name, meta);
          return button;
        }));
        const empty = root.querySelector("[data-hb-fast-empty]");
        if (empty) empty.hidden = choices.length > 0;
      });
    };
    trigger?.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { renderResults(); search?.focus(); }
    }, { signal });
    search?.addEventListener("input", renderResults, { signal });
    results?.addEventListener("click", event => {
      const option = event.target.closest("[data-value]");
      if (!option) return;
      const choice = this.#monsterChoices.find(entry => entry.id === option.dataset.value);
      if (!choice) return;
      hidden.value = choice.id;
      label.textContent = choice.name;
      panel.hidden = true;
    }, { signal });
    document.addEventListener("pointerdown", event => {
      if (!root.contains(event.target)) panel.hidden = true;
    }, { signal, capture: true });
  }

  async _preClose(options) {
    this.#fastSelectAbort?.abort();
    this.#fastSelectAbort = null;
    return super._preClose(options);
  }

  async _prepareContext() {
    const world = getWorldData();
    const hunt = this.hunt ?? {
      title: "",
      monsterId: this.proposalMonsterId ?? world.monsters?.[0]?.id ?? "",
      region: "",
      patron: "",
      stakes: "",
      participantUserIds: game.users.contents.filter(user => !user.isGM).map(user => user.id),
      templateId: world.trailTemplates?.[0]?.id ?? "classic-trail",
      visibility: "participants",
      status: HUNT_STATUS.ACTIVE,
      plannedOutcome: null,
      outcome: null,
      notes: ""
    };
    const monsterIds = (world.monsters ?? []).map(monster => monster.id);
    const huntRules = getHuntRules(monsterIds);
    const knowledgeUser = this.knowledgeUserId ? game.users?.get?.(this.knowledgeUserId) : null;
    const knowledgeProgress = knowledgeUser ? await getProgress(knowledgeUser.id) : null;
    const colorConfig = getHuntDisplayColors();
    const monsterChoices = (world.monsters ?? []).map(monster => {
      const record = knowledgeProgress?.monsters?.[monster.id] ?? {};
      const state = knowledgeProgress ? classifyHuntMonsterState(record, world.knowledgeLevels ?? []) : "none";
      const level = knowledgeProgress ? knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel) : null;
      const name = localizeText(monster.name);
      return {
        id: monster.id,
        name,
        minimumHuntLevel: minimumHuntKnowledgeLevel(huntRules, monster.id, monsterIds),
        selected: monster.id === hunt.monsterId,
        state,
        stateLabel: knowledgeProgress ? game.i18n.localize(`HB.HuntDisplay.State.${state}`) : "",
        knowledgeLevel: level,
        color: huntMonsterColor(state, colorConfig),
        hasHighlight: Boolean(huntMonsterColor(state, colorConfig)),
        searchText: `${name} ${monster.id} ${state}`.toLocaleLowerCase()
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    this.#monsterChoices = monsterChoices;
    const selectedMonsterChoice = monsterChoices.find(entry => entry.id === hunt.monsterId) ?? monsterChoices[0] ?? null;
    return {
      editing: Boolean(this.hunt),
      hunt,
      knowledgeContext: knowledgeUser ? { name: knowledgeUser.name, actorName: this.knowledgeActorName } : null,
      colorLegend: ["available", "researched", "captured", "slain", "escaped"].map(state => ({ state, color: huntMonsterColor(state, colorConfig), label: game.i18n.localize(`HB.HuntDisplay.State.${state}`) })),
      monsters: monsterChoices,
      selectedMonsterChoice,
      templates: (world.trailTemplates ?? []).map(template => ({ id: template.id, name: localizeText(template.name), selected: template.id === hunt.templateId, stepCount: template.steps.length })),
      proposalMode: this.proposalMode,
      canChooseMonster: !this.proposalMode,
      plannedOutcomes: PLAYER_RESOLUTION_OUTCOMES.map(outcome => ({ outcome, label: game.i18n.localize(`HB.Outcomes.${outcome}`), selected: hunt.plannedOutcome === outcome })),
      users: game.users.contents.filter(user => !user.isGM).map(user => ({ id: user.id, name: user.name, checked: hunt.participantUserIds.includes(user.id) })),
      statuses: Object.values(HUNT_STATUS)
        .filter(value => ![HUNT_STATUS.RESOLVED, HUNT_STATUS.FAILED].includes(value) || hunt.status === value)
        .map(value => ({ value, label: game.i18n.localize(`HB.HuntStatus.${value}`), selected: hunt.status === value })),
      visibilityOptions: [
        { value: "participants", label: game.i18n.localize("HB.Visibility.Participants"), selected: hunt.visibility === "participants" },
        { value: "private", label: game.i18n.localize("HB.Visibility.Private"), selected: hunt.visibility === "private" }
      ]
    };
  }
}
