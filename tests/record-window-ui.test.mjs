import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../scripts/apps/record-entry-app.mjs", import.meta.url), "utf8");
const template = await readFile(new URL("../templates/record-entry.hbs", import.meta.url), "utf8");
const css = await readFile(new URL("../styles/hunters-bestiary.css", import.meta.url), "utf8");
const main = await readFile(new URL("../scripts/apps/main-app.mjs", import.meta.url), "utf8");
const dashboardTemplate = await readFile(new URL("../templates/main.hbs", import.meta.url), "utf8");

test("record entry windows are resizable ApplicationV2 applications with distinct persisted ids", () => {
  assert.match(app, /extends PersistentApplication/);
  assert.match(app, /resizable:\s*true/);
  assert.match(app, /hunters-bestiary-record-\$\{kind\}/);
  assert.match(app, /waitForResult/);
  assert.match(main, /promptRecordEntry\(\{\s*kind:\s*"sighting"/s);
  assert.match(main, /promptRecordEntry\(\{ kind:\s*"trophy" \}\)/);
});

test("record fields and list metadata use content-safe sizing", () => {
  assert.match(template, /class="hb-record-form"/);
  assert.match(css, /\.hb-list-card\s*\{[^}]*height:\s*auto;/s);
  assert.match(dashboardTemplate, /<article class="hb-list-card/);
  assert.match(dashboardTemplate, /class="hb-list-card-hitbox"/);
  assert.match(css, /\.hb-list-card-hitbox\s*\{[^}]*position:\s*absolute\s*!important;/s);
  assert.match(dashboardTemplate, /class="hb-card-facts"/);
  assert.match(dashboardTemplate, /class="hb-card-fact hb-card-fact-knowledge"/);
  assert.doesNotMatch(dashboardTemplate, /Tier"}} {{tier}} · {{levelName}}/);
  assert.match(css, /\.hb-card-facts\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.hb-card-fact-knowledge\s*\{[^}]*flex:\s*1 1 8rem;/s);
  assert.match(css, /\.hb-record-fields input,[\s\S]*box-sizing:\s*border-box;/);
  assert.match(css, /padding:\s*\.48rem \.58rem;/);
});


test("record entry closing does not block on geometry persistence or parent refresh", () => {
  assert.match(app, /get animateClose\(\) \{[\s\S]*return false;/);
  assert.match(app, /get waitForGeometryOnClose\(\) \{[\s\S]*return false;/);
  assert.match(app, /this\.pendingResult = result;[\s\S]*return this\.close\(\)/);
  assert.match(app, /_onClose\(options\)[\s\S]*this\.resolve\(this\.#pendingResult\)/);
  assert.doesNotMatch(app, /async _preClose\(options\) \{[\s\S]*this\.resolve\(null\)/);
});

test("share insight and free-text prompts use bounded themed form controls", () => {
  assert.match(main, /classes: \[CORE_DIALOG_CLASS\]/);
  assert.match(main, /class="hb-dialog-choice"/);
  assert.match(main, /class="hb-dialog-choice-list"/);
  assert.match(css, /\.hb-core-dialog \.hb-dialog-fields input:not\(\[type="checkbox"\]\),[\s\S]*inline-size:\s*100% !important;[\s\S]*box-sizing:\s*border-box !important;[\s\S]*padding:\s*\.5rem \.65rem !important;/);
  assert.match(css, /\.hb-dialog-choice\s*\{[\s\S]*color:\s*var\(--hb-dialog-text,[^;]+\) !important;/);
});


test("record and monster editor windows bypass slow close animation and persistence waits", async () => {
  const base = await readFile(new URL("../scripts/apps/base-app.mjs", import.meta.url), "utf8");
  const monster = await readFile(new URL("../scripts/apps/monster-editor.mjs", import.meta.url), "utf8");
  assert.match(base, /close\(options = \{\}\)[\s\S]*animate: options\.animate \?\? this\.animateClose/);
  assert.match(monster, /get animateClose\(\) \{[\s\S]*return false;/);
  assert.match(monster, /get waitForGeometryOnClose\(\) \{[\s\S]*return false;/);
});
