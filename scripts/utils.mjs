import { MODULE_ID } from "./constants.mjs";

export function clone(value) {
  if (value === undefined) return undefined;
  const foundryClone = globalThis.foundry?.utils?.deepClone;
  if (foundryClone) return foundryClone(value);
  return structuredClone(value);
}

export function randomId(length = 16) {
  const foundryRandom = globalThis.foundry?.utils?.randomID;
  if (foundryRandom) return foundryRandom(length);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
}

const LOCALIZATION_KEY = /^(?:HB|HBDND5E|HBAE|HBAEDND)\./;

export function localizeText(value, lang = globalThis.game?.i18n?.lang ?? "en") {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (!LOCALIZATION_KEY.test(value)) return value;
    const translated = globalThis.game?.i18n?.localize?.(value);
    return translated && translated !== value ? translated : value;
  }
  if (Array.isArray(value)) return value.map(entry => localizeText(entry, lang));
  if (typeof value === "object") {
    if (typeof value.key === "string") return localizeText(value.key, lang);
    const selected = value[lang] ?? value.en ?? Object.values(value).find(entry => typeof entry === "string");
    return selected === undefined ? "" : localizeText(selected, lang);
  }
  return String(value);
}

export function localizeRecord(record, lang = globalThis.game?.i18n?.lang ?? "en") {
  if (!record || typeof record !== "object") return record;
  const result = clone(record);
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && LOCALIZATION_KEY.test(value)) result[key] = localizeText(value, lang);
    else if (value && typeof value === "object" && !Array.isArray(value)) result[key] = localizeText(value, lang);
    else if (Array.isArray(value)) result[key] = value.map(entry => localizeText(entry, lang));
  }
  return result;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || randomId(8).toLowerCase();
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function getUser(userId) {
  return globalThis.game?.users?.get(userId) ?? null;
}

export function gmIds({ activeOnly = false } = {}) {
  return (globalThis.game?.users?.contents ?? [])
    .filter(user => user.isGM && (!activeOnly || user.active))
    .map(user => user.id);
}

export function primaryActiveGm() {
  return (globalThis.game?.users?.contents ?? []).find(user => user.isGM && user.active) ?? null;
}

export function canManageWorld(user = globalThis.game?.user) {
  return Boolean(user?.isGM);
}

export function getSelectedActor() {
  const controlled = globalThis.canvas?.tokens?.controlled ?? [];
  if (controlled.length === 1) return controlled[0].actor ?? null;
  return globalThis.game?.user?.character ?? null;
}

export function clampPosition(position, defaults = {}) {
  const viewportWidth = Math.max(480, globalThis.innerWidth ?? 1280);
  const viewportHeight = Math.max(360, globalThis.innerHeight ?? 720);
  const width = Math.min(Math.max(Number(position?.width ?? defaults.width ?? 960), 480), viewportWidth - 24);
  const height = Math.min(Math.max(Number(position?.height ?? defaults.height ?? 700), 360), viewportHeight - 24);
  const left = Math.min(Math.max(Number(position?.left ?? defaults.left ?? 12), 0), Math.max(0, viewportWidth - width));
  const top = Math.min(Math.max(Number(position?.top ?? defaults.top ?? 12), 0), Math.max(0, viewportHeight - height));
  return { width, height, left, top };
}

export function notify(level, message) {
  const notifications = globalThis.ui?.notifications;
  const method = notifications?.[level] ?? notifications?.info;
  method?.call(notifications, message);
}

export function downloadJson(filename, data) {
  const payload = JSON.stringify(data, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readJsonFile(file) {
  if (!(file instanceof File)) throw new Error("No JSON file selected.");
  const text = await file.text();
  return JSON.parse(text);
}

export function debounce(fn, delay = 250) {
  let handle;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), delay);
  };
}

export function moduleLog(...args) {
  console.log(`${MODULE_ID} |`, ...args);
}

export function moduleWarn(...args) {
  console.warn(`${MODULE_ID} |`, ...args);
}

export function moduleError(...args) {
  console.error(`${MODULE_ID} |`, ...args);
}

export function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function boundedInteger(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}
