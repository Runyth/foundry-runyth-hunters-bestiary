import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

async function productionText() {
  const root = new URL("../scripts/", import.meta.url);
  const files = await recursiveFiles(root);
  return (await Promise.all(files.filter(file => extname(file.pathname) === ".mjs").map(file => readFile(file, "utf8")))).join("\n");
}

async function recursiveFiles(url) {
  const output = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
    if (entry.isDirectory()) output.push(...await recursiveFiles(child));
    else output.push(child);
  }
  return output;
}

test("production hooks are narrow and never inject into Actor or Item sheets", async () => {
  const source = await productionText();
  assert.doesNotMatch(source, /Hooks\.on\(["']renderApplication(?:V2)?["']/);
  assert.doesNotMatch(source, /Hooks\.on\(["']renderActorSheet/);
  assert.doesNotMatch(source, /Hooks\.on\(["']renderItemSheet/);
  assert.doesNotMatch(source, /tidy5e|Tidy5e/i);
  assert.match(source, /Hooks\.on\("renderTokenHUD"/);
  assert.match(source, /Hooks\.on\("renderActorDirectory"/);
  assert.match(source, /Hooks\.on\("renderJournalDirectory"/);
});

test("production source uses native DOM, modern Chat behavior, and no canvas overlays", async () => {
  const source = await productionText();
  assert.doesNotMatch(source, /html\.(?:find|on|data|attr)\(/);
  assert.doesNotMatch(source, /\bjQuery\s*\(|(?:^|[^A-Za-z0-9_$])\$\s*\(/m);
  assert.doesNotMatch(source, /Hooks\.on\(["']renderChatMessage["']/);
  assert.doesNotMatch(source, /\bPIXI\b|canvasReady|canvasTearDown|refreshToken/);
  assert.doesNotMatch(source, /data-action=["']tab["']/);
});

test("module CSS is scoped to module-owned roots and prefixes", async () => {
  const css = await readFile(new URL("../styles/runyth-hunters-bestiary.css", import.meta.url), "utf8");
  for (const forbidden of [
    /^\s*\.window-header\b/m,
    /^\s*\.window-content\b/m,
    /^\s*\.application\b/m,
    /^\s*\.sr-only\b/m,
    /^\s*(?:button|input|select|label)\b[^,{]*\{/m
  ]) assert.doesNotMatch(css, forbidden);
  assert.doesNotMatch(css, /(^|,)\s*\.muted\b/m);
  for (const selectorBlock of css.matchAll(/([^@{}][^{}]*)\{/g)) {
    const selectors = selectorBlock[1].trim();
    if (!selectors || selectors.includes("from") || selectors.includes("to")) continue;
    for (const selector of selectors.split(",")) {
      const trimmed = selector.trim();
      if (trimmed.startsWith("@")) continue;
      assert.ok(trimmed.startsWith(".hb-") || trimmed.startsWith(".hunters-bestiary"), `unscoped selector: ${trimmed}`);
    }
  }
});


test("ApplicationV2 listeners are lifecycle-bound and saved tabs are restored", async () => {
  const base = await readFile(new URL("../scripts/apps/base-app.mjs", import.meta.url), "utf8");
  const main = await readFile(new URL("../scripts/apps/main-app.mjs", import.meta.url), "utf8");
  assert.match(base, /AbortController/);
  assert.match(base, /renderListenerSignal/);
  assert.match(base, /activeTab|view/);
  assert.match(main, /bindStableSearch/);
  assert.match(main, /applySavedTab|initialTab/);
});
