import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID } from "../constants.mjs";

function actionCancel() {
  return this.close();
}

async function actionSave() {
  const form = this.element?.querySelector("form");
  if (!form) return;
  const data = new FormData(form);
  const result = this.kind === "trophy"
    ? {
      name: String(data.get("name") ?? "").trim(),
      quantity: Math.max(1, Number(data.get("quantity") ?? 1)),
      detail: String(data.get("detail") ?? "").trim()
    }
    : {
      location: String(data.get("location") ?? "").trim(),
      detail: String(data.get("detail") ?? "").trim()
    };
  if (this.kind === "trophy" && !result.name) return;
  this.pendingResult = result;
  return this.close();
}

export class RecordEntryApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-record-entry",
    classes: ["hunters-bestiary", "hb-app", "hb-record-entry-app"],
    position: { width: 520, height: 420 },
    window: {
      title: "HB.Dialogs.Sighting.Title",
      icon: "fa-solid fa-pen-to-square",
      resizable: true
    },
    actions: {
      save: actionSave,
      cancel: actionCancel
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/record-entry.hbs` }
  };

  #resolveResult;
  #resultPromise;
  #settled = false;
  #pendingResult = null;

  constructor({ kind, initial = {}, ...options } = {}) {
    if (!["sighting", "trophy"].includes(kind)) throw new Error(`Unsupported record-entry kind: ${kind}`);
    const title = kind === "trophy" ? "HB.Dialogs.Trophy.Title" : "HB.Dialogs.Sighting.Title";
    const icon = kind === "trophy" ? "fa-solid fa-award" : "fa-solid fa-eye";
    super({
      ...options,
      id: `hunters-bestiary-record-${kind}`,
      window: { title, icon, resizable: true }
    });
    this.kind = kind;
    this.initial = { ...initial };
    this.#resultPromise = new Promise(resolve => { this.#resolveResult = resolve; });
  }

  get animateClose() {
    return false;
  }

  get waitForGeometryOnClose() {
    return false;
  }

  get pendingResult() {
    return this.#pendingResult;
  }

  set pendingResult(value) {
    this.#pendingResult = value;
  }

  get geometryDefaults() {
    return {
      width: this.kind === "trophy" ? 540 : 520,
      height: this.kind === "trophy" ? 440 : 400,
      minWidth: 420,
      minHeight: 320
    };
  }

  async waitForResult() {
    await this.render({ force: true });
    return this.#resultPromise;
  }

  resolve(value) {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolveResult?.(value);
    this.#resolveResult = null;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    queueMicrotask(() => this.element?.querySelector("[data-autofocus]")?.focus());
  }

  _onClose(options) {
    super._onClose(options);
    this.resolve(this.#pendingResult);
  }

  async _prepareContext() {
    return {
      isSighting: this.kind === "sighting",
      isTrophy: this.kind === "trophy",
      location: this.initial.location ?? "",
      name: this.initial.name ?? "",
      quantity: this.initial.quantity ?? 1,
      detail: this.initial.detail ?? ""
    };
  }
}

export function promptRecordEntry(options) {
  return new RecordEntryApp(options).waitForResult();
}
