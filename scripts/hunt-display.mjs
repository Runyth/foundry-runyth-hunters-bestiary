// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { knowledgeLevel } from "./state.mjs";

export const HUNT_MONSTER_STATES = Object.freeze(["none", "available", "researched", "captured", "slain", "escaped"]);

export const BUILTIN_HUNT_COLOR_PRESETS = Object.freeze({
  classic: Object.freeze({
    available: "#ffffff",
    researched: "#f4d35e",
    captured: "#8a8f98",
    slain: "#4b4f58",
    escaped: "#d9534f"
  }),
  contrast: Object.freeze({
    available: "#ffffff",
    researched: "#ffd43b",
    captured: "#adb5bd",
    slain: "#343a40",
    escaped: "#ff3b30"
  }),
  muted: Object.freeze({
    available: "#e9ecef",
    researched: "#d8c36a",
    captured: "#9298a1",
    slain: "#62666d",
    escaped: "#b75b5b"
  })
});

const DEFAULT = Object.freeze({
  activePreset: "classic",
  colors: BUILTIN_HUNT_COLOR_PRESETS.classic,
  customPresets: {}
});

export function normalizeHuntDisplayColors(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const customPresets = {};
  if (source.customPresets && typeof source.customPresets === "object" && !Array.isArray(source.customPresets)) {
    for (const [name, colors] of Object.entries(source.customPresets)) {
      const safeName = String(name).trim().slice(0, 80);
      if (!safeName || !colors || typeof colors !== "object") continue;
      customPresets[safeName] = normalizeColors(colors, DEFAULT.colors);
    }
  }
  const requestedPreset = source.activePreset == null ? "classic" : String(source.activePreset);
  const knownPreset = BUILTIN_HUNT_COLOR_PRESETS[requestedPreset] ?? customPresets[requestedPreset] ?? null;
  return {
    activePreset: knownPreset ? requestedPreset : "custom",
    colors: normalizeColors(source.colors, knownPreset ?? DEFAULT.colors),
    customPresets
  };
}

export function getHuntDisplayColors() {
  return normalizeHuntDisplayColors(globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.HUNT_DISPLAY_COLORS));
}

export async function setHuntDisplayColors(value) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may change Hunt display colors.");
  const normalized = normalizeHuntDisplayColors(value);
  await globalThis.game.settings.set(MODULE_ID, SETTINGS.HUNT_DISPLAY_COLORS, normalized);
  return normalized;
}

export function presetColors(name, config = getHuntDisplayColors()) {
  return BUILTIN_HUNT_COLOR_PRESETS[name] ?? config.customPresets?.[name] ?? null;
}

export function classifyHuntMonsterState(record = {}, levels = []) {
  const hunts = Array.isArray(record?.hunts) ? record.hunts : [];
  const latest = [...hunts].sort((a, b) => timestamp(a).localeCompare(timestamp(b))).at(-1) ?? null;
  if (latest?.outcome === "escaped") return "escaped";
  if (latest?.outcome === "slain") return "slain";
  if (latest?.outcome === "captured") return "captured";

  const level = knowledgeLevel(record?.points ?? 0, levels, record?.manualLevel);
  const hasKnowledge = level > 0 || Number(record?.points ?? 0) > 0 || Number(record?.rumorsSucceeded ?? 0) > 0 ||
    (record?.sightings?.length ?? 0) > 0 || (record?.trophies?.length ?? 0) > 0 || hunts.length > 0;
  if (!hasKnowledge) return "none";
  if (hunts.length > 0 || level >= 2) return "researched";
  return "available";
}

export function huntMonsterColor(state, config = getHuntDisplayColors()) {
  if (state === "none") return "";
  return config.colors?.[state] ?? "";
}

function normalizeColors(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  for (const state of HUNT_MONSTER_STATES.filter(state => state !== "none")) {
    result[state] = normalizeCssColor(source[state], fallback?.[state] ?? DEFAULT.colors[state]);
  }
  return result;
}

function normalizeCssColor(value, fallback) {
  const text = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function timestamp(entry) {
  return String(entry?.updatedAt ?? entry?.resolvedAt ?? entry?.joinedAt ?? "");
}
