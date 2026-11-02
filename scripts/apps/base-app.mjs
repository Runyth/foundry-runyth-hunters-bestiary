import { MODULE_ID, SETTINGS } from "../constants.mjs";
import {
  clampGeometry,
  createGeometryPersistence,
  loadGeometry,
  resetPosition,
  resetSize
} from "../ui-toolkit.mjs";
import { moduleError } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PersistentApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hunters-bestiary", "hb-app", "hb-shared-dashboard"],
    tag: "section",
    window: {
      frame: true,
      positioned: true,
      minimizable: true,
      resizable: true
    }
  };

  #renderListeners = null;
  #geometry = null;

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    await this.restoreWindowState();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#renderListeners?.abort();
    this.#renderListeners = new AbortController();
    this.#geometry ??= createGeometryPersistence(this, this.geometryOptions);
    this.element?.addEventListener("pointerup", () => this.#geometry?.schedule(), {
      signal: this.#renderListeners.signal
    });
  }

  setPosition(position = {}) {
    const result = super.setPosition(position);
    if (this.rendered) this.#geometry?.schedule();
    return result;
  }

  close(options = {}) {
    return super.close({
      ...options,
      animate: options.animate ?? this.animateClose
    });
  }

  async _preClose(options) {
    this.#renderListeners?.abort();
    const geometry = this.#geometry;
    this.#geometry = null;
    let persistence;
    try {
      persistence = geometry?.flush();
    } catch (error) {
      moduleError("Window-state persistence failed", error);
    } finally {
      geometry?.destroy();
    }
    if (persistence) {
      if (this.waitForGeometryOnClose) {
        try {
          await persistence;
        } catch (error) {
          moduleError("Window-state persistence failed", error);
        }
      } else {
        void Promise.resolve(persistence).catch(error => moduleError("Window-state persistence failed", error));
      }
    }
    return super._preClose(options);
  }

  get animateClose() {
    return true;
  }

  get waitForGeometryOnClose() {
    return false;
  }

  get renderListenerSignal() {
    return this.#renderListeners?.signal;
  }

  get windowStateKey() {
    return this.options.id || this.constructor.name;
  }

  get geometryDefaults() {
    return {
      width: this.options.position?.width ?? 960,
      height: this.options.position?.height ?? 700,
      minWidth: this.options.position?.minWidth ?? 480,
      minHeight: this.options.position?.minHeight ?? 360
    };
  }

  get geometryOptions() {
    return {
      moduleId: MODULE_ID,
      settingKey: SETTINGS.WINDOW_STATES,
      applicationId: this.windowStateKey,
      mapped: true,
      defaults: this.geometryDefaults,
      getView: () => this.view?.tab ? { tab: String(this.view.tab) } : undefined
    };
  }

  getSavedWindowState() {
    const states = game.settings.get(MODULE_ID, SETTINGS.WINDOW_STATES) ?? {};
    return states[this.windowStateKey] ?? null;
  }

  applySavedViewState(view, { ignore = false } = {}) {
    if (ignore || !view) return view;
    const savedView = this.getSavedWindowState()?.view;
    if (savedView?.tab && typeof view.tab === "string") view.tab = String(savedView.tab);
    return view;
  }

  async restoreWindowState() {
    this.setPosition(loadGeometry(this.geometryOptions));
  }

  async saveWindowState() {
    return this.#geometry?.flush();
  }

  async resetWindowSize() {
    const geometry = await resetSize(this.geometryOptions);
    if (this.rendered) this.setPosition(geometry);
    return geometry;
  }

  async resetWindowPosition() {
    const geometry = await resetPosition(this.geometryOptions);
    if (this.rendered) this.setPosition(geometry);
    return geometry;
  }

  async resetWindowState() {
    const geometry = clampGeometry({}, this.geometryDefaults);
    const states = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.WINDOW_STATES) ?? {});
    states[this.windowStateKey] = geometry;
    await game.settings.set(MODULE_ID, SETTINGS.WINDOW_STATES, states);
    if (this.rendered) this.setPosition(geometry);
    return geometry;
  }
}
