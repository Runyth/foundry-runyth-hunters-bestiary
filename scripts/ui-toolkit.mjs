import { NAMING_API_VERSION } from "./naming.mjs";

export const DASHBOARD_API_VERSION = "1.1.0";

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function viewportSize(viewport = {}) {
  return {
    width: Math.max(320, finite(viewport.width, finite(globalThis.innerWidth, 1920))),
    height: Math.max(240, finite(viewport.height, finite(globalThis.innerHeight, 1080)))
  };
}

export function clampGeometry(value = {}, defaults = {}, viewport = {}) {
  const screen = viewportSize(viewport);
  const margin = finite(defaults.margin, 40);
  const maxWidth = Math.max(320, screen.width - margin);
  const maxHeight = Math.max(240, screen.height - margin);
  const minWidth = Math.min(finite(defaults.minWidth, 480), maxWidth);
  const minHeight = Math.min(finite(defaults.minHeight, 360), maxHeight);
  const width = Math.min(Math.max(finite(value.width, finite(defaults.width, 960)), minWidth), maxWidth);
  const height = Math.min(Math.max(finite(value.height, finite(defaults.height, 700)), minHeight), maxHeight);
  const leftDefault = Math.max(0, Math.round((screen.width - width) / 2));
  const topDefault = Math.max(0, Math.round((screen.height - height) / 2));
  const left = Math.min(Math.max(finite(value.left, finite(defaults.left, leftDefault)), 0), Math.max(0, screen.width - width));
  const top = Math.min(Math.max(finite(value.top, finite(defaults.top, topDefault)), 0), Math.max(0, screen.height - height));
  return { width, height, left, top };
}

export function createDashboardOptions({ id, classes = [], title, icon, width = 960, height = 700, minWidth = 480, minHeight = 360 } = {}) {
  return {
    id,
    tag: "section",
    classes,
    position: { width, height },
    window: { title, icon, frame: true, positioned: true, minimizable: true, resizable: true },
    hbGeometry: { width, height, minWidth, minHeight }
  };
}

function readSetting(moduleId, settingKey) {
  return globalThis.game?.settings?.get?.(moduleId, settingKey) ?? {};
}

function writeSetting(moduleId, settingKey, value) {
  return game.settings.set(moduleId, settingKey, value);
}

const geometryWriteQueues = new Map();

function enqueueGeometryWrite(moduleId, settingKey, task) {
  const key = `${moduleId}:${settingKey}`;
  const previous = geometryWriteQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  geometryWriteQueues.set(key, current);
  void current.finally(() => {
    if (geometryWriteQueues.get(key) === current) geometryWriteQueues.delete(key);
  });
  return current;
}

function requestUiFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") return globalThis.requestAnimationFrame(callback);
  return globalThis.setTimeout(callback, 0);
}

function cancelUiFrame(handle) {
  if (handle == null) return;
  if (typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(handle);
  else globalThis.clearTimeout(handle);
}

export async function yieldToBrowser() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  await new Promise(resolve => requestUiFrame(() => resolve()));
}

export async function mapWithConcurrency(values, worker, { concurrency = 4, onSettled = null, yieldEvery = 0 } = {}) {
  if (typeof worker !== "function") throw new TypeError("mapWithConcurrency requires a worker function.");
  const items = Array.from(values ?? []);
  if (!items.length) return [];
  const limit = Math.max(1, Math.min(items.length, Math.trunc(Number(concurrency) || 1)));
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      completed += 1;
      await onSettled?.(results[index], index, completed, items.length);
      if (yieldEvery > 0 && completed % yieldEvery === 0) await yieldToBrowser();
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

export function loadGeometry({ moduleId, settingKey, applicationId, defaults = {}, mapped = false, viewport } = {}) {
  const stored = readSetting(moduleId, settingKey);
  const value = mapped ? stored?.[applicationId] ?? {} : stored;
  return clampGeometry(value, defaults, viewport);
}

export async function saveGeometry({ moduleId, settingKey, applicationId, geometry, defaults = {}, mapped = false, viewport, view } = {}) {
  const normalized = { ...clampGeometry(geometry, defaults, viewport), ...(view ? { view } : {}) };
  return enqueueGeometryWrite(moduleId, settingKey, async () => {
    if (!mapped) {
      await writeSetting(moduleId, settingKey, normalized);
      return normalized;
    }
    const stored = clone(readSetting(moduleId, settingKey));
    stored[applicationId] = normalized;
    await writeSetting(moduleId, settingKey, stored);
    return normalized;
  });
}

export async function resetSize(options = {}) {
  const current = loadGeometry(options);
  return saveGeometry({ ...options, geometry: { ...current, width: options.defaults?.width, height: options.defaults?.height } });
}

export async function resetPosition(options = {}) {
  const current = loadGeometry(options);
  const screen = viewportSize(options.viewport);
  return saveGeometry({
    ...options,
    geometry: {
      ...current,
      left: Math.max(0, Math.round((screen.width - current.width) / 2)),
      top: Math.max(0, Math.round((screen.height - current.height) / 2))
    }
  });
}

export function createGeometryPersistence(app, options = {}) {
  let timer = null;
  let promise = Promise.resolve();
  let dirty = false;
  let lastSavedSignature = null;
  let pendingSignature = null;

  const snapshot = () => ({
    geometry: app.position,
    view: options.getView?.()
  });

  const signatureOf = value => JSON.stringify({
    geometry: clampGeometry(value.geometry, options.defaults, options.viewport),
    view: value.view ?? null
  });

  const persist = ({ force = false } = {}) => {
    const value = snapshot();
    const signature = signatureOf(value);
    dirty = false;
    if (!force && (signature === lastSavedSignature || signature === pendingSignature)) return promise;
    pendingSignature = signature;
    promise = saveGeometry({ ...options, geometry: value.geometry, view: value.view })
      .then(result => {
        lastSavedSignature = signature;
        return result;
      })
      .catch(error => {
        console.error(`${options.moduleId} | Dashboard geometry persistence failed`, error);
        throw error;
      })
      .finally(() => {
        if (pendingSignature === signature) pendingSignature = null;
      });
    return promise;
  };

  const schedule = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void persist().catch(() => undefined);
    }, options.delay ?? 250);
  };

  const flush = ({ force = false } = {}) => {
    clearTimeout(timer);
    timer = null;
    if (!dirty && !force) return promise;
    return persist({ force });
  };

  return {
    schedule,
    flush,
    destroy: () => {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export function filterEntries(root, { query = "", entrySelector, emptySelector, textAttribute = "searchText" } = {}) {
  const normalized = String(query).trim().toLocaleLowerCase();
  let visible = 0;
  const entries = [...(root?.querySelectorAll(entrySelector) ?? [])];
  for (const entry of entries) {
    const haystack = String(entry.dataset?.[textAttribute] ?? entry.textContent ?? "").toLocaleLowerCase();
    const matches = !normalized || haystack.includes(normalized);
    entry.hidden = !matches;
    if (matches) visible += 1;
  }
  const empty = root?.querySelector(emptySelector);
  if (empty) empty.hidden = visible !== 0;
  return { query: normalized, visible, total: entries.length };
}

export function bindStableSearch(root, options = {}) {
  const controller = new AbortController();
  const input = root?.querySelector(options.inputSelector);
  const entries = [...(root?.querySelectorAll(options.entrySelector) ?? [])];
  const empty = root?.querySelector(options.emptySelector);
  let frame = null;

  const applyNow = () => {
    frame = null;
    const query = input?.value ?? options.query ?? "";
    const normalized = String(query).trim().toLocaleLowerCase();
    let visible = 0;
    for (const entry of entries) {
      const haystack = String(entry.dataset?.[options.textAttribute ?? "searchText"] ?? entry.textContent ?? "").toLocaleLowerCase();
      const matches = !normalized || haystack.includes(normalized);
      entry.hidden = !matches;
      if (matches) visible += 1;
    }
    if (empty) empty.hidden = visible !== 0;
    const result = { query: normalized, visible, total: entries.length };
    options.onQuery?.(query, result);
    return result;
  };

  const schedule = () => {
    if (frame != null) return;
    frame = requestUiFrame(applyNow);
  };

  input?.addEventListener("input", schedule, { signal: controller.signal, passive: true });
  applyNow();
  return {
    controller,
    input,
    apply: applyNow,
    destroy: () => {
      cancelUiFrame(frame);
      frame = null;
      controller.abort();
    }
  };
}

export function setBusyState(root, busy, { selector = "button, input, select, textarea", className = "hb-is-busy" } = {}) {
  root?.classList.toggle(className, Boolean(busy));
  root?.setAttribute("aria-busy", busy ? "true" : "false");
  for (const control of root?.querySelectorAll(selector) ?? []) {
    if (busy) {
      control.dataset.hbPreviouslyDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
    } else {
      control.disabled = control.dataset.hbPreviouslyDisabled === "true";
      delete control.dataset.hbPreviouslyDisabled;
    }
  }
}

export function summarizeOperations(entries = []) {
  const summary = { processed: 0, success: 0, skipped: 0, failed: 0 };
  for (const entry of entries ?? []) {
    if (!isPlainOperationRecord(entry)) continue;
    summary.processed += 1;
    const operation = String(readOwnData(entry, "operation") ?? readOwnData(entry, "status") ?? "success").toLowerCase();
    const explicitError = readOwnData(entry, "error");
    if (operation.includes("fail") || explicitError) summary.failed += 1;
    else if (operation.includes("skip") || operation.includes("retain") || operation.includes("preserv")) summary.skipped += 1;
    else summary.success += 1;
  }
  return summary;
}

function escape(value) {
  return globalThis.foundry?.utils?.escapeHTML?.(String(value ?? "")) ?? String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * The progress toolkit deliberately understands only this narrow result schema.
 * Foundry Documents, DataModel instances, Collections, Proxies, and arbitrary
 * class instances are opaque and are never recursively enumerated.
 */
const NESTED_RESULT_KEYS = Object.freeze(["results"]);
const FAILURE_CONTAINER_KEYS = Object.freeze(["failed", "failures", "errors"]);
const COUNT_ARRAY_KEYS = Object.freeze(["created", "updated", "skipped", "deleted"]);

function isPlainOperationRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Error) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function readOwnData(record, key) {
  if (!isPlainOperationRecord(record)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeFailureRecord(value, fallback = "Operation failed.") {
  if (value instanceof Error) return value;
  if (typeof value === "string") return { message: value };
  if (!isPlainOperationRecord(value)) return { message: fallback };
  const nestedError = readOwnData(value, "error");
  const message = readOwnData(value, "message") ?? (nestedError instanceof Error ? nestedError.message : nestedError) ?? fallback;
  const failure = { message: String(message) };
  for (const key of ["type", "id", "name", "providerId", "recordId", "rule", "path", "operation", "status"]) {
    const field = readOwnData(value, key);
    if (["string", "number", "boolean"].includes(typeof field)) failure[key] = field;
  }
  return failure;
}

function collectFailureContainer(value, seen) {
  if (value == null || value === false || value === 0) return [];
  if (value instanceof Error || typeof value === "string") return [safeFailureRecord(value)];
  if (Array.isArray(value)) {
    return value.flatMap(entry => {
      if (entry instanceof Error || typeof entry === "string") return [safeFailureRecord(entry)];
      if (!isPlainOperationRecord(entry)) return [];
      const nested = collectOperationFailures(entry, seen);
      return nested.length ? nested : [safeFailureRecord(entry)];
    });
  }
  if (typeof value === "number") return value > 0 ? [{ message: `${value} operation(s) failed.` }] : [];
  if (!isPlainOperationRecord(value)) return [];
  const nested = collectOperationFailures(value, seen);
  return nested.length ? nested : [safeFailureRecord(value)];
}

export function collectOperationFailures(value, seen = new WeakSet()) {
  if (value == null || value === false) return [];
  if (value instanceof Error) return [value];
  if (Array.isArray(value)) return value.flatMap(entry => collectOperationFailures(entry, seen));
  if (!isPlainOperationRecord(value)) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const failures = [];
  const operation = String(readOwnData(value, "operation") ?? readOwnData(value, "status") ?? "").toLowerCase();
  const message = readOwnData(value, "message");
  const explicitError = readOwnData(value, "error");
  const ok = readOwnData(value, "ok");
  const success = readOwnData(value, "success");

  if (explicitError) failures.push(safeFailureRecord(explicitError, String(message ?? "Operation failed.")));
  if (operation.includes("fail") && !explicitError) failures.push(safeFailureRecord(value));
  if ((ok === false || success === false) && !explicitError && !operation.includes("fail")) failures.push(safeFailureRecord(value));

  for (const key of FAILURE_CONTAINER_KEYS) {
    const child = readOwnData(value, key);
    if (key === "failed" && typeof child === "number") {
      if (child > 0 && failures.length === 0) failures.push({ message: `${child} operation(s) failed.` });
      continue;
    }
    failures.push(...collectFailureContainer(child, seen));
  }
  for (const key of NESTED_RESULT_KEYS) {
    const child = readOwnData(value, key);
    if (Array.isArray(child) || isPlainOperationRecord(child)) failures.push(...collectOperationFailures(child, seen));
  }
  return failures;
}

export function operationHasFailures(value) {
  return collectOperationFailures(value).length > 0;
}

function countResultArray(record, key) {
  const value = readOwnData(record, key);
  return Array.isArray(value) ? value.length : Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

export function summarizeOperationResult(value, fallback = {}) {
  const summary = {
    processed: Math.max(0, Number(fallback.processed ?? fallback.current) || 0),
    success: Math.max(0, Number(fallback.success) || 0),
    skipped: Math.max(0, Number(fallback.skipped) || 0),
    failed: Math.max(0, Number(fallback.failed) || 0)
  };
  if (Array.isArray(value)) {
    const direct = summarizeOperations(value);
    if (direct.processed) return direct;
    return summary;
  }
  if (!isPlainOperationRecord(value)) return summary;

  const explicitProcessed = readOwnData(value, "processed") ?? readOwnData(value, "total");
  const explicitSuccess = readOwnData(value, "success");
  const explicitSkipped = readOwnData(value, "skipped");
  const explicitFailed = readOwnData(value, "failed");
  if (Number.isFinite(Number(explicitProcessed))) summary.processed = Math.max(summary.processed, Number(explicitProcessed));
  if (Number.isFinite(Number(explicitSuccess))) summary.success = Math.max(summary.success, Number(explicitSuccess));
  if (Number.isFinite(Number(explicitSkipped))) summary.skipped = Math.max(summary.skipped, Number(explicitSkipped));
  if (Number.isFinite(Number(explicitFailed))) summary.failed = Math.max(summary.failed, Number(explicitFailed));

  summary.success = Math.max(summary.success, countResultArray(value, "created") + countResultArray(value, "updated") + countResultArray(value, "deleted"));
  summary.skipped = Math.max(summary.skipped, countResultArray(value, "skipped"));
  const nested = readOwnData(value, "results");
  if (Array.isArray(nested)) {
    const nestedSummary = nested.reduce((total, entry) => {
      const child = summarizeOperationResult(entry);
      total.processed += child.processed;
      total.success += child.success;
      total.skipped += child.skipped;
      total.failed += child.failed;
      return total;
    }, { processed: 0, success: 0, skipped: 0, failed: 0 });
    summary.processed = Math.max(summary.processed, nestedSummary.processed);
    summary.success = Math.max(summary.success, nestedSummary.success);
    summary.skipped = Math.max(summary.skipped, nestedSummary.skipped);
    summary.failed = Math.max(summary.failed, nestedSummary.failed);
  }
  summary.failed = Math.max(summary.failed, collectOperationFailures(value).length);
  if (!summary.processed) summary.processed = summary.success + summary.skipped + summary.failed;
  return summary;
}

function safelyBringProgressToFront(dialog) {
  if (!dialog?.rendered || !dialog.element) return false;
  try {
    dialog.bringToFront?.();
    return true;
  } catch (error) {
    console.warn("Runyth Hunter's Bestiary | Could not foreground progress window", error);
    return false;
  }
}

function retainProgressForeground(dialog) {
  safelyBringProgressToFront(dialog);
  queueMicrotask(() => safelyBringProgressToFront(dialog));
  setTimeout(() => safelyBringProgressToFront(dialog), 0);
  setTimeout(() => safelyBringProgressToFront(dialog), 100);
}

export async function runProgressOperation({
  title,
  runner,
  root,
  closeLabel,
  phaseLabel = "",
  onComplete,
  width = 520,
  autoCloseOnSuccess = false,
  foregroundOnFailure = true
} = {}) {
  if (typeof runner !== "function") throw new TypeError("runProgressOperation requires a runner function.");
  const DialogV2 = foundry.applications.api.DialogV2;
  const localize = key => game.i18n?.localize?.(key) ?? key;
  const viewportWidth = Math.max(280, Number(globalThis.innerWidth) || 1024);
  const fixedWidth = Math.min(Math.max(360, Number(width) || 520), viewportWidth - 32);
  const dialog = new DialogV2({
    classes: ["hb-shared-progress-dialog"],
    position: { width: fixedWidth },
    window: { title, resizable: false },
    content: `<div class="hb-shared-progress" aria-live="polite"><p data-hb-progress-phase>${escape(phaseLabel)}</p><progress max="1" value="0"></progress><p data-hb-progress-count>0/0</p><dl><dt>${escape(localize("HB.Dashboard.Success"))}</dt><dd data-hb-progress-success>0</dd><dt>${escape(localize("HB.Dashboard.Skipped"))}</dt><dd data-hb-progress-skipped>0</dd><dt>${escape(localize("HB.Dashboard.Failed"))}</dt><dd data-hb-progress-failed>0</dd></dl><pre data-hb-progress-errors hidden></pre></div>`,
    buttons: [{ action: "close", label: closeLabel ?? localize("HB.Dashboard.Close"), default: true, callback: () => undefined }]
  });
  setBusyState(root, true);
  await dialog.render({ force: true });
  dialog.setPosition?.({ width: fixedWidth });

  const element = dialog.element;
  const nodes = {
    closeButton: element?.querySelector('[data-action="close"]'),
    bar: element?.querySelector("progress"),
    phase: element?.querySelector("[data-hb-progress-phase]"),
    count: element?.querySelector("[data-hb-progress-count]"),
    success: element?.querySelector("[data-hb-progress-success]"),
    skipped: element?.querySelector("[data-hb-progress-skipped]"),
    failed: element?.querySelector("[data-hb-progress-failed]"),
    errors: element?.querySelector("[data-hb-progress-errors]")
  };
  if (nodes.closeButton) nodes.closeButton.disabled = true;

  const state = { current: 0, total: 0, success: 0, skipped: 0, failed: 0, errors: [] };
  let frame = null;
  let lastErrorText = "";

  const paint = () => {
    frame = null;
    const total = Math.max(0, Number(state.total) || 0);
    const current = Math.max(0, Number(state.current) || 0);
    if (nodes.bar) {
      nodes.bar.max = Math.max(total, 1);
      nodes.bar.value = Math.min(current, Math.max(total, 1));
    }
    if (nodes.phase) nodes.phase.textContent = [state.phase, state.label].filter(Boolean).join(": ");
    if (nodes.count) nodes.count.textContent = `${current}/${total} (${total ? Math.round((current / total) * 100) : 0}%)`;
    for (const key of ["success", "skipped", "failed"]) {
      if (nodes[key]) nodes[key].textContent = String(state[key] ?? 0);
    }
    if (nodes.errors) {
      const errorText = state.errors?.map(error => error?.message ?? String(error)).join("\n") ?? "";
      nodes.errors.hidden = !errorText;
      if (errorText !== lastErrorText) {
        nodes.errors.textContent = errorText;
        lastErrorText = errorText;
      }
    }
  };

  const schedulePaint = () => {
    if (frame != null) return;
    frame = requestUiFrame(paint);
  };

  const update = data => {
    Object.assign(state, data);
    schedulePaint();
  };

  const flushPaint = () => {
    cancelUiFrame(frame);
    frame = null;
    paint();
  };

  try {
    const result = await runner(update);
    const discoveredFailures = collectOperationFailures(result);
    const summary = summarizeOperationResult(result, state);
    summary.failed = Math.max(summary.failed, discoveredFailures.length);
    const errors = state.errors?.length ? state.errors : discoveredFailures;
    update({
      current: state.total || summary.processed,
      total: state.total || summary.processed,
      ...summary,
      errors,
      phase: summary.failed ? localize("HB.Dashboard.Failed") : localize("HB.Dashboard.Complete")
    });
    flushPaint();
    await onComplete?.(result, summary);
    if (summary.failed > 0) {
      if (foregroundOnFailure) retainProgressForeground(dialog);
    } else if (autoCloseOnSuccess) {
      await dialog.close({ animate: false });
    }
    return result;
  } catch (error) {
    update({ failed: Math.max(1, state.failed), errors: [...state.errors, error], phase: localize("HB.Dashboard.Failed") });
    flushPaint();
    if (foregroundOnFailure) retainProgressForeground(dialog);
    throw error;
  } finally {
    cancelUiFrame(frame);
    frame = null;
    if (nodes.closeButton) nodes.closeButton.disabled = false;
    setBusyState(root, false);
  }
}

export function confirmDestructiveAction({ title, eligible = [], preserved = [], warning, confirmLabel, cancelLabel } = {}) {
  const list = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join("")}</ul>`;
  const localize = key => game.i18n?.localize?.(key) ?? key;
  return foundry.applications.api.DialogV2.confirm({
    window: { title },
    content: `<div class="hb-shared-destructive-confirm"><p>${escape(warning)}</p><h3>${escape(localize("HB.Dashboard.EligibleDeletion"))}</h3>${list(eligible)}<h3>${escape(localize("HB.Dashboard.WillBePreserved"))}</h3>${list(preserved)}</div>`,
    yes: { label: confirmLabel ?? "Delete", icon: "fa-solid fa-trash" },
    no: { label: cancelLabel ?? "Cancel", icon: "fa-solid fa-xmark" },
    rejectClose: false,
    modal: true
  });
}

export function reportOperationResult({ level = "info", message, details } = {}) {
  ui.notifications?.[level]?.(message);
  if (details) console[level === "error" ? "error" : "info"](message, details);
}

export function createDashboardToolkit({ namingApi } = {}) {
  return Object.freeze({
    version: DASHBOARD_API_VERSION,
    namingApiVersion: NAMING_API_VERSION,
    createDashboardOptions,
    clampGeometry,
    loadGeometry,
    saveGeometry,
    resetSize,
    resetPosition,
    createGeometryPersistence,
    bindStableSearch,
    filterEntries,
    runProgressOperation,
    confirmDestructiveAction,
    setBusyState,
    reportOperationResult,
    summarizeOperations,
    summarizeOperationResult,
    collectOperationFailures,
    operationHasFailures,
    yieldToBrowser,
    mapWithConcurrency,
    validateDashboardModuleName(metadata, options = {}) {
      return namingApi?.warnForInvalidComplementaryModuleName?.(metadata, { ...options, reason: "dashboard" });
    }
  });
}
