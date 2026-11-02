// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS, SCHEMA_VERSION } from "./constants.mjs";
import { ResetDashboardPositionMenu, ResetDashboardSizeMenu } from "./apps/reset-menus.mjs";

let settingsRegistered = false;

export function registerSettings({ MainApp, AdminApp, TransferApp }) {
  if (settingsRegistered) return false;
  settingsRegistered = true;
  game.settings.registerMenu(MODULE_ID, "openControlCentre", {
    name: "HB.Settings.OpenControlCentre.Name",
    label: "HB.Settings.OpenControlCentre.Label",
    hint: "HB.Settings.OpenControlCentre.Hint",
    icon: "fa-solid fa-book-open",
    type: MainApp,
    restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "openAdministration", {
    name: "HB.Settings.OpenAdministration.Name",
    label: "HB.Settings.OpenAdministration.Label",
    hint: "HB.Settings.OpenAdministration.Hint",
    icon: "fa-solid fa-compass-drafting",
    type: AdminApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "openTransfer", {
    name: "HB.Settings.OpenTransfer.Name",
    label: "HB.Settings.OpenTransfer.Label",
    hint: "HB.Settings.OpenTransfer.Hint",
    icon: "fa-solid fa-file-export",
    type: TransferApp,
    restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "resetDashboardSize", {
    name: "HB.Settings.ResetSize.Name",
    label: "HB.Settings.ResetSize.Label",
    hint: "HB.Settings.ResetSize.Hint",
    icon: "fa-solid fa-expand",
    type: ResetDashboardSizeMenu,
    restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "resetDashboardPosition", {
    name: "HB.Settings.ResetPosition.Name",
    label: "HB.Settings.ResetPosition.Label",
    hint: "HB.Settings.ResetPosition.Hint",
    icon: "fa-solid fa-crosshairs",
    type: ResetDashboardPositionMenu,
    restricted: false
  });

  const hiddenWorld = {
    scope: "world",
    config: false,
    restricted: true
  };

  game.settings.register(MODULE_ID, SETTINGS.WORLD_DATA, {
    ...hiddenWorld,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, SETTINGS.HUNTS, {
    ...hiddenWorld,
    type: Object,
    default: []
  });
  game.settings.register(MODULE_ID, SETTINGS.AUDIT_LOG, {
    ...hiddenWorld,
    type: Object,
    default: []
  });
  game.settings.register(MODULE_ID, SETTINGS.INSTALLED_CONTENT, {
    ...hiddenWorld,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, SETTINGS.FIELDWORK_REQUESTS, {
    ...hiddenWorld,
    type: Object,
    default: [],
    onChange: value => globalThis.Hooks?.callAll?.(`${MODULE_ID}.fieldworkChanged`, value)
  });
  game.settings.register(MODULE_ID, SETTINGS.HUNT_RULES, {
    ...hiddenWorld,
    type: Object,
    default: {},
    onChange: value => globalThis.Hooks?.callAll?.(`${MODULE_ID}.huntRulesChanged`, value)
  });
  game.settings.register(MODULE_ID, SETTINGS.HUNT_DISPLAY_COLORS, {
    ...hiddenWorld,
    type: Object,
    default: {},
    onChange: value => globalThis.Hooks?.callAll?.(`${MODULE_ID}.huntColorsChanged`, value)
  });
  game.settings.register(MODULE_ID, SETTINGS.SCHEMA_VERSION, {
    ...hiddenWorld,
    type: Number,
    default: SCHEMA_VERSION
  });

  registerBoolean(SETTINGS.PLAYER_CAN_ATTEMPT, true);
  registerBoolean(SETTINGS.PLAYER_CAN_ADD_NOTES, true);
  registerBoolean(SETTINGS.PLAYER_CAN_SHARE, true);
  registerBoolean(SETTINGS.AUTO_AWARD, true);
  registerBoolean(SETTINGS.REQUIRE_FIELDWORK_APPROVAL, true);
  registerBoolean(SETTINGS.SCENE_CONTROL, true);
  registerBoolean(SETTINGS.TOKEN_HUD, true);
  registerBoolean(SETTINGS.DIRECTORY_BUTTONS, true);
  registerBoolean(SETTINGS.ONBOARDING, true);
  registerBoolean(SETTINGS.JOURNAL_SYNC, true);
  registerBoolean(SETTINGS.ALLOW_PARTIAL_PROVIDER_CONTENT, false);

  game.settings.register(MODULE_ID, SETTINGS.ROLL_MODE, {
    name: "HB.Settings.RollMode.Name",
    hint: "HB.Settings.RollMode.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      blindroll: "HB.Settings.RollMode.Blind",
      gmroll: "HB.Settings.RollMode.GM",
      publicroll: "HB.Settings.RollMode.Public"
    },
    default: "blindroll"
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_FORMULA, {
    name: "HB.Settings.DefaultFormula.Name",
    hint: "HB.Settings.DefaultFormula.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "1d20 + @mod"
  });

  game.settings.register(MODULE_ID, SETTINGS.WINDOW_STATES, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.ONBOARDING_SEEN, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });
  return true;
}

function registerBoolean(key, defaultValue) {
  game.settings.register(MODULE_ID, key, {
    name: `HB.Settings.${capitalize(key)}.Name`,
    hint: `HB.Settings.${capitalize(key)}.Hint`,
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: defaultValue
  });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
