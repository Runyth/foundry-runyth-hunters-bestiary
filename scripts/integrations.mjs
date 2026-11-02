import { MODULE_ID, SETTINGS, FLAGS } from "./constants.mjs";
import { gmIds, moduleError } from "./utils.mjs";

const registrations = {
  keybinding: false,
  sceneControls: false,
  launchers: false,
  privateTableChat: false,
  rerenderHooks: false
};

export function registerKeybinding(api) {
  if (registrations.keybinding) return false;
  game.keybindings.register(MODULE_ID, "openControlCentre", {
    name: "HB.Keybindings.Open.Name",
    hint: "HB.Keybindings.Open.Hint",
    editable: [{ key: "KeyB", modifiers: ["Shift"] }],
    onDown: () => {
      api.open();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
  registrations.keybinding = true;
  return true;
}

export function registerSceneControls(api) {
  if (registrations.sceneControls) return false;
  Hooks.on("getSceneControlButtons", controls => {
    try {
      if (!game.settings.get(MODULE_ID, SETTINGS.SCENE_CONTROL)) return;
      if (!controls || Array.isArray(controls) || typeof controls !== "object") return;
      const tokenControls = controls.tokens;
      if (!tokenControls?.tools || Array.isArray(tokenControls.tools) || typeof tokenControls.tools !== "object") return;
      if (tokenControls.tools.huntersBestiary) return;
      tokenControls.tools.huntersBestiary = {
        name: "huntersBestiary",
        title: "HB.Launchers.SceneControl",
        icon: "fa-solid fa-book-skull",
        order: Object.keys(tokenControls.tools).length,
        button: true,
        visible: true,
        onChange: () => api.open()
      };
    } catch (error) {
      moduleError("Scene Control integration failed", error);
    }
  });
  registrations.sceneControls = true;
  return true;
}

export function registerPrivateTableChat() {
  if (registrations.privateTableChat) return false;
  Hooks.on("preCreateChatMessage", (document, data) => {
    try {
      const tableId = foundry.utils.getProperty(data, "flags.core.RollTable")
        ?? data.flags?.["core.RollTable"]
        ?? document.getFlag?.("core", "RollTable")
        ?? foundry.utils.getProperty(document, "flags.core.RollTable");
      if (!tableId) return;
      const table = game.tables?.get(tableId);
      if (!table?.getFlag(MODULE_ID, FLAGS.TABLE_KIND)) return;
      document.updateSource({ whisper: gmIds(), blind: false });
    } catch (error) {
      moduleError("Private Roll Table Chat integration failed", error);
    }
  });
  registrations.privateTableChat = true;
  return true;
}

export function registerApplicationLaunchers(api) {
  if (registrations.launchers) return false;
  Hooks.on("renderTokenHUD", (app, element) => safelyInject("Token HUD launcher", () => injectTokenHudButton(api, app, resolveRoot(app, element))));
  Hooks.on("renderActorDirectory", (app, element) => safelyInject("Actor Directory launcher", () => {
    if (!game.settings.get(MODULE_ID, SETTINGS.DIRECTORY_BUTTONS)) return;
    injectDirectoryButton(api, resolveRoot(app, element), "actor");
  }));
  Hooks.on("renderJournalDirectory", (app, element) => safelyInject("Journal Directory launcher", () => {
    if (!game.settings.get(MODULE_ID, SETTINGS.DIRECTORY_BUTTONS)) return;
    injectDirectoryButton(api, resolveRoot(app, element), "journal");
  }));
  registrations.launchers = true;
  return true;
}

export function registerRerenderHooks() {
  if (registrations.rerenderHooks) return false;
  let renderScheduled = false;
  let pendingRenderIds = new Set();
  const renderIds = ids => {
    for (const id of ids) {
      const app = foundry.applications.instances.get(id);
      if (app?.rendered) app.render({ force: true });
    }
  };
  const scheduleRender = (ids = ["hunters-bestiary-control-centre", "hunters-bestiary-administration", "hunters-bestiary-player-perspective", "hunters-bestiary-transfer", "hunters-bestiary-audit-log"]) => {
    for (const id of ids) pendingRenderIds.add(id);
    if (renderScheduled) return;
    renderScheduled = true;
    const schedule = globalThis.requestAnimationFrame ?? (callback => setTimeout(callback, 0));
    schedule(() => {
      renderScheduled = false;
      const idsToRender = [...pendingRenderIds];
      pendingRenderIds = new Set();
      renderIds(idsToRender);
    });
  };
  const rerender = () => scheduleRender();
  const rerenderFieldwork = () => scheduleRender(["hunters-bestiary-control-centre", "hunters-bestiary-administration", "hunters-bestiary-player-perspective", "hunters-bestiary-audit-log"]);
  Hooks.on("updateUser", (user, changes) => {
    if (user.id !== game.user.id && !game.user.isGM) return;
    if (changes.flags?.[MODULE_ID]) rerender();
  });
  Hooks.on("updateSetting", setting => {
    if (!setting.key?.startsWith(`${MODULE_ID}.`)) return;
    if (setting.key === `${MODULE_ID}.${SETTINGS.FIELDWORK_REQUESTS}`) {
      rerenderFieldwork();
      return;
    }
    rerender();
  });
  Hooks.on(`${MODULE_ID}.fieldworkChanged`, rerenderFieldwork);
  Hooks.on(`${MODULE_ID}.catalogChanged`, rerender);
  Hooks.on(`${MODULE_ID}.systemAdapterChanged`, rerender);
  Hooks.on(`${MODULE_ID}.huntChanged`, rerender);
  Hooks.on(`${MODULE_ID}.huntRulesChanged`, rerender);
  Hooks.on(`${MODULE_ID}.huntColorsChanged`, rerender);
  Hooks.on(`${MODULE_ID}.settingsImported`, rerender);
  Hooks.on(`${MODULE_ID}.dataImported`, rerender);
  registrations.rerenderHooks = true;
  return true;
}

export function injectTokenHudButton(api, app, root) {
  if (!root || !game.settings.get(MODULE_ID, SETTINGS.TOKEN_HUD)) return false;
  if (root.querySelector('[data-hb-launcher="token-hud"]')) return false;
  const actor = resolveHudActor(app);
  if (!actor || !canUseActor(actor)) return false;
  const host = findHudHost(root);
  if (!host) return false;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon hb-token-hud-launcher";
  button.dataset.hbLauncher = "token-hud";
  button.dataset.tooltip = game.i18n.localize("HB.Launchers.TokenHUD");
  button.setAttribute("aria-label", game.i18n.localize("HB.Launchers.TokenHUD"));
  button.innerHTML = '<i class="fa-solid fa-book-skull" aria-hidden="true"></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    api.open({ monsterId: api.monsterIdForActor(actor) });
  }, { once: false });
  host.append(button);
  return true;
}

export function injectDirectoryButton(api, root, kind) {
  if (!root) return false;
  const marker = `directory-${kind}`;
  if (root.querySelector(`[data-hb-launcher="${marker}"]`)) return false;
  const host = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header")
    ?? root.querySelector(":scope > header");
  if (!host) return false;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hb-directory-launcher";
  button.dataset.hbLauncher = marker;
  button.innerHTML = `<i class="fa-solid fa-book-skull" aria-hidden="true"></i><span>${game.i18n.localize("HB.Launchers.Directory")}</span>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    api.open({ initialTab: kind === "journal" ? "library" : "bestiary" });
  });
  host.append(button);
  return true;
}

export function resetIntegrationRegistrationStateForTests() {
  for (const key of Object.keys(registrations)) registrations[key] = false;
}

function resolveRoot(app, element) {
  const HTMLElementClass = globalThis.HTMLElement;
  if (HTMLElementClass && element instanceof HTMLElementClass) return element;
  if (HTMLElementClass && app?.element instanceof HTMLElementClass) return app.element;
  return null;
}

function resolveHudActor(app) {
  const tokenDocument = app?.object?.document ?? app?.object ?? app?.document ?? app?.token?.document ?? app?.token ?? null;
  return tokenDocument?.actor ?? app?.object?.actor ?? app?.document?.actor ?? app?.token?.actor ?? null;
}

function canUseActor(actor) {
  if (game.user.isGM) return true;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return Boolean(actor.isOwner || actor.testUserPermission?.(game.user, owner));
}

function findHudHost(root) {
  return root.querySelector('[data-position="right"]')
    ?? root.querySelector(".col.right")
    ?? root.querySelector(".right")
    ?? root.querySelector(".col")
    ?? root;
}

function safelyInject(label, callback) {
  try {
    callback();
  } catch (error) {
    moduleError(`${label} failed`, error);
  }
}
