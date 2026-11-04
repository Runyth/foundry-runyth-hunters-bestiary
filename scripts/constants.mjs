// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export const MODULE_ID = "runyth-hunters-bestiary";
export const MODULE_TITLE = "Runyth Hunter's Bestiary";
export const MODULE_VERSION = "1.8.0";
export const SCHEMA_VERSION = 3;
export const SOCKET_NAME = `module.${MODULE_ID}`;

export const SETTINGS = Object.freeze({
  WORLD_DATA: "worldData",
  HUNTS: "hunts",
  AUDIT_LOG: "auditLog",
  SCHEMA_VERSION: "schemaVersion",
  INSTALLED_CONTENT: "installedContent",
  FIELDWORK_REQUESTS: "fieldworkRequests",
  HUNT_RULES: "huntRules",
  HUNT_DISPLAY_COLORS: "huntDisplayColors",
  PLAYER_CAN_ATTEMPT: "playerCanAttemptHunts",
  PLAYER_CAN_ADD_NOTES: "playerCanAddNotes",
  PLAYER_CAN_SHARE: "playerCanShareKnowledge",
  AUTO_AWARD: "autoAwardKnowledge",
  REQUIRE_FIELDWORK_APPROVAL: "requireFieldworkApproval",
  ROLL_MODE: "rollMode",
  DEFAULT_FORMULA: "defaultFormula",
  SCENE_CONTROL: "showSceneControl",
  TOKEN_HUD: "showTokenHudButton",
  DIRECTORY_BUTTONS: "showDirectoryButtons",
  ONBOARDING: "showOnboarding",
  JOURNAL_SYNC: "enableBestiaryJournalSync",
  ALLOW_PARTIAL_PROVIDER_CONTENT: "allowPartialProviderContent",
  WINDOW_STATES: "windowStates",
  ONBOARDING_SEEN: "onboardingSeen"
});

export const FLAGS = Object.freeze({
  PROGRESS: "progress",
  SOURCE: "source",
  JOURNAL_USER_ID: "journalUserId",
  JOURNAL_KIND: "journalKind",
  TABLE_KIND: "tableKind",
  ACTOR_MONSTER_ID: "monsterId",
  ACTOR_PROVIDER_ID: "actorProviderId",
  MANAGED_EMBEDDED: "managedEmbedded",
  MANAGED_EMBEDDED_KEY: "managedEmbeddedKey"
});

export const HUNT_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  RESOLVED: "resolved",
  FAILED: "failed"
});

export const OUTCOMES = Object.freeze([
  "slain",
  "captured",
  "driven-off",
  "relocated",
  "observed",
  "negotiated",
  "released",
  "evaded",
  "escaped",
  "unknown"
]);

export const SKILL_LABELS = Object.freeze({
  acr: "Acrobatics",
  ani: "Animal Handling",
  arc: "Arcana",
  ath: "Athletics",
  dec: "Deception",
  his: "History",
  ins: "Insight",
  itm: "Intimidation",
  inv: "Investigation",
  med: "Medicine",
  nat: "Nature",
  prc: "Perception",
  prf: "Performance",
  per: "Persuasion",
  rel: "Religion",
  slt: "Sleight of Hand",
  ste: "Stealth",
  sur: "Survival"
});

export const KNOWLEDGE_FIELDS = Object.freeze({
  0: ["name", "tier"],
  1: ["name", "tier", "summary", "rumor"],
  2: ["name", "tier", "summary", "rumor", "habitats", "signs"],
  3: ["name", "tier", "summary", "rumor", "habitats", "signs", "ecology", "behavior", "defenses"],
  4: ["name", "tier", "summary", "rumor", "habitats", "signs", "ecology", "behavior", "defenses", "weaknesses", "harvest"],
  5: ["name", "tier", "summary", "rumor", "habitats", "signs", "ecology", "behavior", "defenses", "weaknesses", "harvest", "preferredSkills"]
});
