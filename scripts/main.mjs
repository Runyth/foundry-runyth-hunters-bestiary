import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { initializeWorldData } from "./bootstrap.mjs";
import { registerSocket } from "./socket.mjs";
import { MainApp, AdminApp } from "./apps/main-app.mjs";
import { TransferApp } from "./apps/transfer-app.mjs";
import { HuntersBestiaryAPI } from "./api.mjs";
import { moduleError, moduleLog, notify } from "./utils.mjs";
import {
  registerApplicationLaunchers,
  registerKeybinding,
  registerPrivateTableChat,
  registerRerenderHooks,
  registerSceneControls
} from "./integrations.mjs";

const api = new HuntersBestiaryAPI();

Hooks.once("init", () => {
  exposeApi();
  runInitSubsystem("settings", () => registerSettings({ MainApp, AdminApp, TransferApp }));
  runInitSubsystem("keybinding", () => registerKeybinding(api));
  runInitSubsystem("Scene Controls", () => registerSceneControls(api));
  runInitSubsystem("application launchers", () => registerApplicationLaunchers(api));
  runInitSubsystem("private Roll Table Chat", registerPrivateTableChat);
  moduleLog("Initialized.");
});

Hooks.once("ready", async () => {
  const failures = [];
  await runReadySubsystem("world data", initializeWorldData, failures, true);
  await runReadySubsystem("socket", registerSocket, failures);
  await runReadySubsystem("rerender hooks", registerRerenderHooks, failures);

  api.markReady({ ok: failures.length === 0, failures });
  api.warnForEnabledComplementaryModuleNames();
  Hooks.callAll(`${MODULE_ID}.ready`, api, api.initializationStatus);

  if (!failures.length) {
    await runReadySubsystem("onboarding", showOnboardingOnce, failures);
    moduleLog(`Ready for ${game.system.id} on Foundry ${game.version}.`);
  } else {
    const summary = failures.map(entry => entry.subsystem).join(", ");
    notify("error", game.i18n.format("HB.Errors.InitializationFailed", { message: summary }));
  }
});

function exposeApi() {
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  globalThis.HuntersBestiary = api;
}

function runInitSubsystem(subsystem, callback) {
  try {
    callback();
  } catch (error) {
    moduleError(`${subsystem} registration failed`, error);
  }
}

async function runReadySubsystem(subsystem, callback, failures, essential = false) {
  try {
    await callback();
    return true;
  } catch (error) {
    failures.push({ subsystem, essential, message: error?.message ?? String(error) });
    moduleError(`${subsystem} initialization failed`, error);
    return false;
  }
}

async function showOnboardingOnce() {
  if (!game.settings.get(MODULE_ID, SETTINGS.ONBOARDING)) return;
  if (game.settings.get(MODULE_ID, SETTINGS.ONBOARDING_SEEN)) return;
  await game.settings.set(MODULE_ID, SETTINGS.ONBOARDING_SEEN, true);
  api.open({ initialTab: "guide" });
}
