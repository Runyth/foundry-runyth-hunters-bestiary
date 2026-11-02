// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID } from "../constants.mjs";
import { getProgress, getHunts, getWorldData } from "../state.mjs";
import { getFieldworkRequests } from "../fieldwork.mjs";
import { buildPlayerAuditTimeline, getWorldAuditEntries } from "../audit-log.mjs";
import { bindStableSearch } from "../ui-toolkit.mjs";

export class AuditLogApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-audit-log",
    position: { width: 880, height: 720, minWidth: 620, minHeight: 420 },
    window: {
      title: "HB.Audit.Title",
      icon: "fa-solid fa-clock-rotate-left"
    },
    actions: {
      refreshAudit: function () { return this.render({ force: true }); }
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/audit-log.hbs` }
  };

  #searchBinding = null;

  constructor({ userId, actorName = "", ...options } = {}) {
    super(options);
    this.userId = String(userId ?? "");
    this.actorName = String(actorName ?? "");
  }

  setTarget({ userId, actorName = "" } = {}) {
    this.userId = String(userId ?? "");
    this.actorName = String(actorName ?? "");
    return this;
  }

  async _prepareContext() {
    if (!game.user?.isGM) return { unavailable: true, events: [], total: 0 };
    const user = game.users?.get?.(this.userId) ?? null;
    if (!user || user.isGM) return { unavailable: true, events: [], total: 0 };
    const [progress] = await Promise.all([getProgress(user.id)]);
    const world = getWorldData();
    const hunts = getHunts();
    const fieldworkRequests = getFieldworkRequests(game.user);
    const auditEntries = getWorldAuditEntries();
    const events = buildPlayerAuditTimeline({ userId: user.id, progress, world, hunts, fieldworkRequests, auditEntries });
    return {
      unavailable: false,
      userName: user.name,
      actorName: this.actorName || user.character?.name || "",
      events,
      total: events.length
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#searchBinding?.destroy();
    this.#searchBinding = bindStableSearch(this.element, {
      inputSelector: '[data-hb-search="audit"]',
      entrySelector: '[data-hb-list="audit"] [data-search-text]',
      emptySelector: '[data-hb-search-empty="audit"]'
    });
  }

  async _preClose(options) {
    this.#searchBinding?.destroy();
    this.#searchBinding = null;
    return super._preClose(options);
  }
}
