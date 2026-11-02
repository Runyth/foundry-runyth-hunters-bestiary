import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const manifest = JSON.parse(await readFile(join(root, "module.json"), "utf8"));
const seed = JSON.parse(await readFile(join(root, "data/seed.json"), "utf8"));
const folder = manifest.id;
const version = manifest.version;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

const check = spawnSync(process.execPath, [join(root, "tools/check.mjs")], { stdio: "inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);
const tests = spawnSync(process.execPath, ["--test", "tests/*.test.mjs"], { cwd: root, stdio: "inherit", shell: true });
if (tests.status !== 0) process.exit(tests.status ?? 1);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const installTop = new Set(["module.json", "README.md", "CHANGELOG.md", "LICENSE", "assets", "data", "lang", "scripts", "styles", "templates"]);
const allFiles = await collect(root, path => !path.startsWith("dist/") && !path.startsWith(".git/"));
const installFiles = allFiles.filter(path => installTop.has(path.split("/")[0]));
const sourceFiles = allFiles;

const installName = `${folder}-v${version}.zip`;
const sourceName = `${folder}-source-v${version}.zip`;
await writeZip(join(dist, installName), installFiles);
await writeZip(join(dist, sourceName), sourceFiles);

const hashes = [];
for (const name of [installName, sourceName]) {
  const bytes = await readFile(join(dist, name));
  hashes.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await writeFile(join(dist, `${folder}-v${version}-SHA256SUMS.txt`), `${hashes.join("\n")}\n`);

const report = `# Hunter's Bestiary v${version} — Build Report\n\n## Deliverables\n\n- Installable module ZIP: \`${installName}\`\n- Reproducible source ZIP: \`${sourceName}\`\n- SHA-256 checksums: \`${folder}-v${version}-SHA256SUMS.txt\`\n\n## Bundled gameplay content\n\n- ${seed.monsters.length} original monster entries\n- ${seed.tracks.length} field-sign and track types\n- ${seed.rumors.length} rumor seeds\n- ${seed.books.length} research books\n- ${seed.trailTemplates.length} staged hunt templates\n- ${seed.complications.length} investigation complications\n\n## Implemented systems\n\n- Independent per-player Bestiary progression and knowledge gates\n- GM player-perspective mirror using the canonical player dashboard rendering pipeline\n- Personal notes, sightings, trophies, discoveries, books, and statistics\n- Participant-scoped staged hunts with configurable knowledge and Fieldwork eligibility and GM-authoritative shared state\n- Granular rumor → Track → Sighting → danger progression with global defaults and sparse per-monster overrides\n- Absolute five-band player-facing encounter danger with customizable labels and no raw numeric tier disclosure\n- Bounded deferred-quarry queues, GM-approved reactivation, active-Hunt caps, and player-authored Hunt proposals\n- Rumor-driven quarry cycles using a GM-selected catalogue pool with repeat avoidance after completed hunts\n- Explicit per-field knowledge disclosure using level, point, successful-rumor, chance, and optional GM-approval gates\n- Player-chosen desired final outcomes with configurable automatic, check-plus-GM, and GM-only adjudication policies\n- One-use GM approval queue for repeatable rumor, track, hunt-step, evidence-credit, and gated-discovery actions\n- Spoiler-safe detailed Player guide plus complete GM workflow and responsibility guide\n- Rumor and track field checks with configurable roll visibility\n- Foundry-standard modular catalogue localization with English fallback and extensible language dictionaries\n- Strict complete-package validation for complementary monster modules\n- Deliberate Actor linking and provisioning from UUIDs, raw system data, Actor adapters, or active game-system adapters\n- Native system-adapter capabilities for field checks, harvest Items, and encounter profiles
- GM provider diagnostics and schema-v2 migration\n- Optional page-based Journals and GM-private Roll Tables\n- Per-user and multi-user JSON export/import with merge validation\n- ApplicationV2 interfaces, saved geometry, onboarding, visible launchers, and public extension API\n- Per-monster image overrides synchronized across dashboards, Actor portraits, and prototype Tokens\n- Bounded asynchronous work queues, cached data loading, coalesced UI updates, and non-blocking window-state persistence\n\n## Validation performed\n\n- Manifest, JSON, localization, path, and static schema validation\n- JavaScript syntax checks with \`node --check\`\n- Node unit tests for seed content, progression, hunts, provider validation, Actor policies, migration, and import merging\n- Deprecated Foundry V1 API identifier scan\n- Deterministic ZIP creation with non-versioned \`${folder}/\` root folder\n- SHA-256 generation\n\n## Runtime qualification\n\nThe build environment cannot launch a real Foundry VTT client. The module targets Foundry v13.351 and has been statically and unit-tested, but final validation in the user's exact Foundry, system, browser, and module stack remains necessary. Follow \`docs/TEST-PLAN.md\`.\n`;
await writeFile(join(dist, `${folder}-v${version}-build-report.md`), report);

console.log(`Built ${installName} and ${sourceName} in ${dist}`);

async function collect(base, include) {
  const output = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      const path = relative(base, absolute).replaceAll("\\", "/");
      if (!include(path)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else output.push(path);
    }
  }
  await walk(base);
  return output;
}

async function writeZip(outputPath, files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const path of [...files].sort()) {
    const data = await readFile(join(root, path));
    const compressed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(`${folder}/${path}`, "utf8");
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  await writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
