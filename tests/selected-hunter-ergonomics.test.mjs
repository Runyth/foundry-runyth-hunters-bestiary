import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("GM dashboard uses selected player progress for the Bestiary knowledge list", async () => {
  const main = await readFile(new URL("../scripts/apps/main-app.mjs", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/main.hbs", import.meta.url), "utf8");
  assert.match(main, /const displayProgress = selectedPlayerProgress \?\? progress/);
  assert.match(main, /buildMonsterListEntry\(monster, index, displayProgress/);
  assert.match(template, /data-selected-player-knowledge/);
});

test("New Hunt editor receives selected hunter context and exposes colored history states", async () => {
  const main = await readFile(new URL("../scripts/apps/main-app.mjs", import.meta.url), "utf8");
  const editor = await readFile(new URL("../scripts/apps/hunt-editor.mjs", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/hunt-editor.hbs", import.meta.url), "utf8");
  assert.match(main, /knowledgeUserId: owner\?\.id/);
  assert.match(editor, /classifyHuntMonsterState/);
  assert.match(template, /hb-hunt-color-legend/);
  assert.match(template, /background-color: \{\{color\}\}/);
});
