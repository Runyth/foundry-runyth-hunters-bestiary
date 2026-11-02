// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { resetPosition, resetSize } from "../ui-toolkit.mjs";

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const DASHBOARDS = Object.freeze([
  { id: "hunters-bestiary-control-centre", defaults: { width: 1120, height: 780, minWidth: 480, minHeight: 360 } },
  { id: "hunters-bestiary-player-perspective", defaults: { width: 1120, height: 780, minWidth: 480, minHeight: 360 } },
  { id: "hunters-bestiary-administration", defaults: { width: 1120, height: 780, minWidth: 480, minHeight: 360 } }
]);

async function resetAll(operation, notificationKey) {
  await Promise.all(DASHBOARDS.map(dashboard => operation({
    moduleId: MODULE_ID,
    settingKey: SETTINGS.WINDOW_STATES,
    applicationId: dashboard.id,
    mapped: true,
    defaults: dashboard.defaults
  })));
  globalThis.ui?.notifications?.info?.(globalThis.game?.i18n?.localize?.(notificationKey) ?? notificationKey);
}

class ImmediateSettingsAction extends ApplicationV2 {
  static async execute() {}

  async render() {
    await this.constructor.execute();
    return this;
  }
}

export class ResetDashboardSizeMenu extends ImmediateSettingsAction {
  static execute() {
    return resetAll(resetSize, "HB.Notifications.SizeReset");
  }
}

export class ResetDashboardPositionMenu extends ImmediateSettingsAction {
  static execute() {
    return resetAll(resetPosition, "HB.Notifications.PositionReset");
  }
}
