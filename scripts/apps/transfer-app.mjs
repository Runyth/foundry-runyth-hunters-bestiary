// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID } from "../constants.mjs";
import { downloadExport, importExport, validateExport, downloadSettingsExport, importSettingsExport, validateSettingsExport } from "../transfer.mjs";
import { readJsonFile, notify } from "../utils.mjs";

async function actionExport() {
  const form = this.element.querySelector("form");
  const data = new FormData(form);
  const userIds = game.user.isGM ? data.getAll("userIds").map(String) : [game.user.id];
  if (!userIds.length) return notify("warn", game.i18n.localize("HB.Errors.SelectExportUser"));
  await downloadExport({
    userIds,
    includeWorld: game.user.isGM && data.get("includeWorld") === "on",
    includeAudit: game.user.isGM && data.get("includeAudit") === "on"
  });
  notify("info", game.i18n.localize("HB.Notifications.ExportComplete"));
}

async function actionImport() {
  const form = this.element.querySelector("form");
  const file = form.querySelector("input[name='importFile']")?.files?.[0];
  if (!file) return notify("warn", game.i18n.localize("HB.Errors.SelectImportFile"));
  try {
    const payload = await readJsonFile(file);
    validateExport(payload);
    const mapping = buildUserMapping(payload);
    const data = new FormData(form);
    const result = await importExport(payload, {
      userMapping: mapping,
      merge: data.get("merge") === "on",
      importWorld: game.user.isGM && data.get("importWorld") === "on"
    });
    notify("info", game.i18n.format("HB.Notifications.ImportComplete", { count: result.importedUsers.length }));
    Hooks.callAll(`${MODULE_ID}.dataImported`, result);
  } catch (error) {
    console.error(`${MODULE_ID} | Import failed`, error);
    notify("error", game.i18n.format("HB.Errors.ImportFailed", { message: error.message }));
  }
}


function actionExportSettings() {
  if (!game.user?.isGM) return;
  downloadSettingsExport();
  notify("info", game.i18n.localize("HB.Notifications.SettingsExportComplete"));
}

async function actionImportSettings() {
  if (!game.user?.isGM) return;
  const file = this.element?.querySelector("input[name='settingsImportFile']")?.files?.[0];
  if (!file) return notify("warn", game.i18n.localize("HB.Errors.SelectSettingsImportFile"));
  try {
    const payload = await readJsonFile(file);
    validateSettingsExport(payload);
    const result = await importSettingsExport(payload);
    notify("info", game.i18n.format("HB.Notifications.SettingsImportComplete", { count: result.imported.length }));
    Hooks.callAll(`${MODULE_ID}.settingsImported`, result);
  } catch (error) {
    console.error(`${MODULE_ID} | Settings import failed`, error);
    notify("error", game.i18n.format("HB.Errors.ImportFailed", { message: error.message }));
  }
}

function actionSelectAll() {
  for (const input of this.element.querySelectorAll('input[name="userIds"]')) input.checked = true;
}

function actionSelectSelf() {
  for (const input of this.element.querySelectorAll('input[name="userIds"]')) input.checked = input.value === game.user.id;
}

export class TransferApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-transfer",
    position: { width: 720, height: 680 },
    window: {
      title: "HB.Transfer.Title",
      icon: "fa-solid fa-file-export"
    },
    actions: {
      export: actionExport,
      import: actionImport,
      selectAll: actionSelectAll,
      selectSelf: actionSelectSelf,
      exportSettings: actionExportSettings,
      importSettings: actionImportSettings
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/transfer.hbs` }
  };

  async _prepareContext() {
    return {
      isGM: game.user.isGM,
      users: game.users.contents.map(user => ({
        id: user.id,
        name: user.name,
        isGM: user.isGM,
        checked: user.id === game.user.id
      }))
    };
  }
}

function buildUserMapping(payload) {
  const mapping = {};
  if (!game.user.isGM) {
    const first = Object.keys(payload.users)[0];
    if (first) mapping[first] = game.user.id;
    return mapping;
  }
  for (const [sourceId, entry] of Object.entries(payload.users)) {
    if (game.users.has(sourceId)) {
      mapping[sourceId] = sourceId;
      continue;
    }
    const normalizedName = String(entry.name ?? "").trim().toLocaleLowerCase();
    const target = game.users.contents.find(user => user.name.trim().toLocaleLowerCase() === normalizedName);
    if (target) mapping[sourceId] = target.id;
  }
  return mapping;
}
