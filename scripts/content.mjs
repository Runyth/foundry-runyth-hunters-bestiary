import { MODULE_ID, FLAGS, SETTINGS } from "./constants.mjs";
import { escapeHtml, localizeText, notify, nowIso } from "./utils.mjs";
import { getWorldData, getProgress, knowledgeLevel } from "./state.mjs";

const OWNERSHIP_NONE = 0;
const OWNERSHIP_OBSERVER = 2;
const OWNERSHIP_OWNER = 3;

export async function installReferenceLibrary({ updateExisting = false } = {}) {
  if (!game.user.isGM) throw new Error("Only a GM may install the reference library.");
  const data = getWorldData();
  const [journalFolder, tableFolder] = await Promise.all([
    ensureFolder("Runyth Hunter's Bestiary: Books", "JournalEntry"),
    ensureFolder("Runyth Hunter's Bestiary: GM Tables", "RollTable")
  ]);

  const journalBySource = new Map((game.journal?.contents ?? []).map(document => [document.getFlag(MODULE_ID, FLAGS.SOURCE), document]));
  const journalDefinitions = [
    ...(data.books ?? []).map(book => buildBookJournalData(book, journalFolder.id)),
    buildTrackAtlasData(data.tracks ?? [], journalFolder.id)
  ];
  const journalResults = await Promise.all(journalDefinitions.map(async journalData => {
    const source = journalData.flags[MODULE_ID][FLAGS.SOURCE];
    const existing = journalBySource.get(source) ?? null;
    if (existing && updateExisting) {
      await replaceJournalPages(existing, journalData.pages);
      await existing.update({ name: journalData.name, folder: journalFolder.id, ownership: journalData.ownership });
      return "updated";
    }
    if (!existing) {
      await JournalEntry.create(journalData, { render: false });
      return "created";
    }
    return "skipped";
  }));
  const journalsCreated = journalResults.filter(result => result === "created").length;
  const journalsUpdated = journalResults.filter(result => result === "updated").length;

  const tableBySource = new Map((game.tables?.contents ?? []).map(document => [document.getFlag(MODULE_ID, FLAGS.SOURCE), document]));
  const tableDefinitions = [
    buildRumorTable(data.rumors ?? [], tableFolder.id),
    buildTrackTable(data.tracks ?? [], tableFolder.id),
    buildComplicationTable(data.complications ?? [], tableFolder.id)
  ];
  const tableResults = await Promise.all(tableDefinitions.map(async tableData => {
    const source = tableData.flags[MODULE_ID][FLAGS.SOURCE];
    const existing = tableBySource.get(source) ?? null;
    if (existing && updateExisting) {
      await existing.update({ name: tableData.name, formula: tableData.formula, folder: tableFolder.id, ownership: tableData.ownership });
      const ids = existing.results.map(result => result.id);
      if (ids.length) await existing.deleteEmbeddedDocuments("TableResult", ids);
      if (tableData.results.length) await existing.createEmbeddedDocuments("TableResult", tableData.results);
      return "updated";
    }
    if (!existing) {
      await RollTable.create(tableData, { render: false });
      return "created";
    }
    return "skipped";
  }));
  const tablesCreated = tableResults.filter(result => result === "created").length;
  const tablesUpdated = tableResults.filter(result => result === "updated").length;

  await game.settings.set(MODULE_ID, SETTINGS.INSTALLED_CONTENT, {
    installedAt: nowIso(),
    journalFolderId: journalFolder.id,
    tableFolderId: tableFolder.id,
    journalsCreated,
    journalsUpdated,
    tablesCreated,
    tablesUpdated
  });
  notify("info", game.i18n.format("HB.Notifications.LibraryInstalled", { journals: journalsCreated + journalsUpdated, tables: tablesCreated + tablesUpdated }));
  return { journalsCreated, journalsUpdated, tablesCreated, tablesUpdated };
}

async function ensureFolder(name, type) {
  const existing = game.folders?.find(folder => folder.name === name && folder.type === type);
  if (existing) return existing;
  return Folder.create({ name, type, sorting: "a", color: type === "JournalEntry" ? "#80643f" : "#5c2c2c" });
}

function findBySource(collection, source) {
  return collection.find(document => document.getFlag(MODULE_ID, FLAGS.SOURCE) === source) ?? null;
}

function buildBookJournalData(book, folderId) {
  const name = localizeText(book.name);
  const author = localizeText(book.author);
  const summary = localizeText(book.summary);
  const benefit = game.i18n.format("HB.Journal.ResearchBenefit", {
    points: Number(book.unlock?.points ?? 0),
    tags: (book.unlock?.tags ?? book.tags ?? []).join(", ") || "—"
  });
  const pages = [{
    name,
    type: "text",
    text: {
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
      content: `<article class="hb-generated-journal"><h1>${escapeHtml(name)}</h1><p><em>${escapeHtml(author)}</em></p><p>${escapeHtml(summary)}</p><p><strong>${escapeHtml(benefit)}</strong></p><hr><p>${escapeHtml(game.i18n.localize("HB.Journal.ReferenceBookNotice"))}</p></article>`
    }
  }];
  for (const chapter of book.chapters ?? []) {
    const chapterName = localizeText(chapter.title);
    pages.push({
      name: chapterName,
      type: "text",
      text: {
        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
        content: `<article class="hb-generated-journal"><h1>${escapeHtml(chapterName)}</h1><p>${escapeHtml(localizeText(chapter.body))}</p></article>`
      }
    });
  }
  return {
    name,
    folder: folderId,
    ownership: { default: OWNERSHIP_NONE },
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: `book:${book.id}`, [FLAGS.JOURNAL_KIND]: "reference-book" } },
    pages
  };
}

function buildTrackAtlasData(tracks, folderId) {
  return {
    name: game.i18n.localize("HB.Journal.TrackAtlas"),
    folder: folderId,
    ownership: { default: OWNERSHIP_NONE },
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: "book:field-sign-atlas", [FLAGS.JOURNAL_KIND]: "track-atlas" } },
    pages: tracks.map(track => ({
      name: localizeText(track.name),
      type: "text",
      text: {
        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
        content: `<article class="hb-generated-journal"><h1>${escapeHtml(localizeText(track.name))}</h1><p>${escapeHtml(localizeText(track.description))}</p><p><strong>${escapeHtml(game.i18n.localize("HB.Common.BaseDC"))}:</strong> ${Number(track.baseDc)}</p></article>`
      }
    }))
  };
}

function tableResult(text, range, weight = 1) {
  return {
    type: CONST.TABLE_RESULT_TYPES?.TEXT ?? "text",
    text,
    range,
    weight,
    drawn: false,
    flags: { [MODULE_ID]: {} }
  };
}

function weightedResults(entries, textFor) {
  let cursor = 1;
  return entries.map((entry, index) => {
    const weight = Math.max(1, Number(entry.weight ?? 1));
    const range = [cursor, cursor + weight - 1];
    cursor += weight;
    return tableResult(textFor(entry, index), range, weight);
  });
}

function totalWeight(entries) {
  return entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight ?? 1)), 0);
}

function buildRumorTable(rumors, folderId) {
  return {
    name: game.i18n.localize("HB.Tables.Rumors"),
    folder: folderId,
    formula: `1d${Math.max(1, totalWeight(rumors))}`,
    replacement: true,
    displayRoll: false,
    ownership: { default: OWNERSHIP_NONE },
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: "table:rumors", [FLAGS.TABLE_KIND]: "rumors" } },
    results: weightedResults(rumors, rumor => {
      const truthLabel = game.i18n.localize(`HB.RumorTruth.${rumor.truth ?? "unknown"}`);
      return `${localizeText(rumor.text)} — ${game.i18n.localize("HB.Fields.Truth")}: ${truthLabel}`;
    })
  };
}

function buildTrackTable(tracks, folderId) {
  return {
    name: game.i18n.localize("HB.Tables.Tracks"),
    folder: folderId,
    formula: `1d${Math.max(1, tracks.length)}`,
    replacement: true,
    displayRoll: false,
    ownership: { default: OWNERSHIP_NONE },
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: "table:tracks", [FLAGS.TABLE_KIND]: "tracks" } },
    results: weightedResults(tracks, track => `${localizeText(track.name)} — ${localizeText(track.description)}`)
  };
}

function buildComplicationTable(complications, folderId) {
  return {
    name: game.i18n.localize("HB.Tables.Complications"),
    folder: folderId,
    formula: `1d${Math.max(1, complications.length)}`,
    replacement: true,
    displayRoll: false,
    ownership: { default: OWNERSHIP_NONE },
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: "table:complications", [FLAGS.TABLE_KIND]: "complications" } },
    results: weightedResults(complications, complication => localizeText(complication))
  };
}

async function replaceJournalPages(journal, pageData) {
  const ids = journal.pages.map(page => page.id);
  if (ids.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", ids);
  if (pageData.length) await journal.createEmbeddedDocuments("JournalEntryPage", pageData);
}

export async function publishPersonalBestiary(userId = game.user.id) {
  if (!game.settings.get(MODULE_ID, SETTINGS.JOURNAL_SYNC)) throw new Error("Personal bestiary Journal synchronization is disabled.");
  if (!game.user.isGM && userId !== game.user.id) throw new Error("Players may only publish their own bestiary.");
  const user = game.users.get(userId);
  if (!user) throw new Error("User not found.");
  const data = getWorldData();
  const progress = await getProgress(userId);
  const folder = await ensureFolder("Runyth Hunter's Bestiary: Personal Books", "JournalEntry");
  const source = `personal:${userId}`;
  const existing = findBySource(game.journal?.contents ?? [], source);
  const pages = [];
  for (const monster of data.monsters ?? []) {
    const record = progress.monsters[monster.id];
    if (!record || record.points <= 0) continue;
    const level = knowledgeLevel(record.points, data.knowledgeLevels, record.manualLevel);
    pages.push(buildPersonalMonsterPage(monster, record, level));
  }
  if (!pages.length) {
    pages.push({
      name: game.i18n.localize("HB.Journal.EmptyBestiary"),
      type: "text",
      text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: `<p>${escapeHtml(game.i18n.localize("HB.Journal.EmptyBestiaryHint"))}</p>` }
    });
  }
  const ownership = { default: OWNERSHIP_NONE, [userId]: OWNERSHIP_OWNER };
  const journalName = game.i18n.format("HB.Journal.PersonalTitle", { name: user.name });
  if (existing) {
    await replaceJournalPages(existing, pages);
    await existing.update({ name: journalName, folder: folder.id, ownership });
    existing.sheet?.render({ force: true });
    notify("info", game.i18n.localize("HB.Notifications.BestiaryJournalUpdated"));
    return existing;
  }
  const journal = await JournalEntry.create({
    name: journalName,
    folder: folder.id,
    ownership,
    flags: { [MODULE_ID]: { [FLAGS.SOURCE]: source, [FLAGS.JOURNAL_USER_ID]: userId, [FLAGS.JOURNAL_KIND]: "personal-bestiary" } },
    pages
  });
  journal.sheet?.render({ force: true });
  notify("info", game.i18n.localize("HB.Notifications.BestiaryJournalCreated"));
  return journal;
}

function buildPersonalMonsterPage(monster, record, level) {
  const name = level > 0 ? localizeText(monster.name) : game.i18n.localize("HB.Common.UnknownBeast");
  const sections = [];
  if (level >= 1) sections.push(section("HB.Fields.Summary", localizeText(monster.summary)), section("HB.Fields.Rumor", localizeText(monster.rumor)));
  if (level >= 2) sections.push(section("HB.Fields.Habitats", localizeText(monster.habitats).join("; ")), section("HB.Fields.Signs", localizeText(monster.signs).join("; ")));
  if (level >= 3) sections.push(section("HB.Fields.Ecology", localizeText(monster.ecology)), section("HB.Fields.Behavior", localizeText(monster.behavior)), section("HB.Fields.Defenses", localizeText(monster.defenses)));
  if (level >= 4) sections.push(section("HB.Fields.Weaknesses", localizeText(monster.weaknesses)), section("HB.Fields.Harvest", localizeText(monster.harvest)));
  const notes = record.notes.map(note => `<li>${escapeHtml(note.text)}</li>`).join("");
  const sightings = record.sightings.map(sighting => `<li>${escapeHtml(sighting.location || sighting.detail || sighting.at)}</li>`).join("");
  const trophies = record.trophies.map(trophy => `<li>${escapeHtml(trophy.name)} × ${Number(trophy.quantity)}</li>`).join("");
  const hunts = record.hunts.map(hunt => {
    const status = game.i18n.localize(`HB.HuntStatus.${hunt.status ?? "active"}`);
    const outcome = hunt.outcome ? game.i18n.localize(`HB.Outcomes.${hunt.outcome}`) : "—";
    return `<li>${escapeHtml(hunt.title)} — ${escapeHtml(status)} · ${escapeHtml(outcome)}</li>`;
  }).join("");
  return {
    name,
    type: "text",
    text: {
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
      content: `<article class="hb-generated-journal"><h1>${escapeHtml(name)}</h1><p><strong>${escapeHtml(game.i18n.localize("HB.Common.KnowledgeLevel"))}:</strong> ${level} · <strong>${escapeHtml(game.i18n.localize("HB.Common.Points"))}:</strong> ${record.points}</p>${sections.join("")}<h2>${escapeHtml(game.i18n.localize("HB.Fields.Sightings"))}</h2><ul>${sightings || "<li>—</li>"}</ul><h2>${escapeHtml(game.i18n.localize("HB.Fields.Trophies"))}</h2><ul>${trophies || "<li>—</li>"}</ul><h2>${escapeHtml(game.i18n.localize("HB.Fields.HuntHistory"))}</h2><ul>${hunts || "<li>—</li>"}</ul><h2>${escapeHtml(game.i18n.localize("HB.Fields.PersonalNotes"))}</h2><ul>${notes || "<li>—</li>"}</ul></article>`
    }
  };
}

function section(labelKey, content) {
  return `<h2>${escapeHtml(game.i18n.localize(labelKey))}</h2><p>${escapeHtml(content)}</p>`;
}
