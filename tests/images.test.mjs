// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveMonsterImage, applyMonsterImageToActorData, normalizeImagePath } from "../scripts/images.mjs";

test("world image override wins over packaged image", () => {
  const monster = { id: "wolf", img: "modules/test/packaged.webp" };
  assert.equal(resolveMonsterImage(monster, { imageOverrides: { wolf: "world/custom.webp" } }), "world/custom.webp");
});

test("packaged image synchronizes actor and prototype token source", () => {
  const monster = { id: "wolf", img: "modules/test/wolf.webp" };
  const output = applyMonsterImageToActorData(monster, { img: "old.webp", prototypeToken: { texture: { src: "old-token.webp" } } }, {});
  assert.equal(output.img, "modules/test/wolf.webp");
  assert.equal(output.prototypeToken.texture.src, "modules/test/wolf.webp");
});

test("unsafe or empty image paths are rejected", () => {
  assert.equal(normalizeImagePath(" javascript:alert(1) "), "");
  assert.equal(normalizeImagePath(""), "");
  assert.equal(normalizeImagePath("worlds/demo/image.webp"), "worlds/demo/image.webp");
});

import { readFile } from "node:fs/promises";

test("every bundled monster declares a packaged image", async () => {
  const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
  assert.equal(seed.monsters.length, 24);
  assert.ok(seed.monsters.every(monster => typeof monster.img === "string" && monster.img.startsWith("modules/hunters-bestiary/")));
});

test("dashboard list and selected detail resolve the same effective image", async () => {
  const source = await readFile(new URL("../scripts/apps/main-app.mjs", import.meta.url), "utf8");
  const template = await readFile(new URL("../templates/main.hbs", import.meta.url), "utf8");
  assert.match(source, /function buildMonsterListEntry[\s\S]*resolveMonsterImage\(monster, world\)/);
  assert.match(source, /function buildMonsterDetail[\s\S]*resolveMonsterImage\(monster, world\)/);
  assert.match(template, /data-action="changeMonsterImage"/);
  assert.match(template, /data-action="resetMonsterImage"/);
});

test("image selection uses the namespaced Foundry v13 picker and exposes the public API", async () => {
  const images = await readFile(new URL("../scripts/images.mjs", import.meta.url), "utf8");
  const api = await readFile(new URL("../scripts/api.mjs", import.meta.url), "utf8");
  assert.match(images, /foundry\?\.applications\?\.apps/);
  assert.match(images, /prototypeToken\.texture\.src/);
  for (const method of ["getMonsterImage", "setMonsterImage", "resetMonsterImage", "openMonsterImagePicker"]) {
    assert.match(api, new RegExp(`${method}\\(`));
  }
});
