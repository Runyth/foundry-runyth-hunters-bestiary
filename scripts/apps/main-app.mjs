// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { PersistentApplication } from "./base-app.mjs";
import { MODULE_ID, SETTINGS, SKILL_LABELS, HUNT_STATUS, OUTCOMES } from "../constants.mjs";
import { localizeRecord, localizeText, escapeHtml, formatDate, getSelectedActor, notify, randomId } from "../utils.mjs";
import {
  getWorldData,
  getProgress,
  knowledgeLevel,
  addPersonalNote,
  removePersonalNote,
  addSighting,
  addTrophy,
  awardKnowledge,
  setManualKnowledgeLevel,
  markBookRead,
  updateStatistics
} from "../state.mjs";
import { visibleHuntsFor, deleteHunt, completeStep, revertStepAdvance, reversibleStepId, decideHuntResolution, rejectHuntResolution } from "../hunts.mjs";
import { performFieldCheck } from "../rolls.mjs";
import { requestGm } from "../socket.mjs";
import { publishPersonalBestiary, installReferenceLibrary } from "../content.mjs";
import { HuntEditorApp } from "./hunt-editor.mjs";
import { HuntRulesApp } from "./hunt-rules-app.mjs";
import { MonsterEditorApp } from "./monster-editor.mjs";
import { TransferApp } from "./transfer-app.mjs";
import { AuditLogApp } from "./audit-log-app.mjs";
import { promptRecordEntry } from "./record-entry-app.mjs";
import { provisionActors, actorProvisioningStatus } from "../actors.mjs";
import { resolveMonsterImage, imageOverrideFor, openMonsterImagePicker, resetMonsterImage } from "../images.mjs";
import { buildProviderReports } from "../providers.mjs";
import { selectActorPlayerOwner, selectControlledPlayerPerspectiveTarget } from "../fieldwork-view.mjs";
import { bindStableSearch, runProgressOperation } from "../ui-toolkit.mjs";
import {
  FIELDWORK_TYPES,
  getFieldworkRequests,
  fieldworkRequestSummary,
  resolveFieldworkRequest
} from "../fieldwork.mjs";
import { getHuntDisplayColors, classifyHuntMonsterState, huntMonsterColor } from "../hunt-display.mjs";
import {
  getHuntRules,
  disclosedFieldsFor,
  minimumHuntKnowledgeLevel,
  resolutionRuleFor,
  PLAYER_RESOLUTION_OUTCOMES,
  isResolutionStage,
  fieldworkProgressStatus,
  difficultyBandFor
} from "../hunt-rules.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

const CORE_DIALOG_CLASS = "hb-core-dialog";

const PLAYER_PERSPECTIVE_APP_ID = "hunters-bestiary-player-perspective";
const PLAYER_PERSPECTIVE_SAFE_ACTIONS = new Set(["setTab", "selectMonster", "selectHunt", "resetSize", "resetPosition", "openGuide"]);

function selectedPlayerPerspectiveTarget() {
  if (!game.user?.isGM) return null;
  return selectControlledPlayerPerspectiveTarget(
    globalThis.canvas?.tokens?.controlled ?? [],
    game.users?.contents ?? [],
    globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3
  );
}


function coreDialogOptions(preferredWidth = 560) {
  const viewportWidth = Math.max(320, Number(globalThis.innerWidth) || 1024);
  return {
    classes: [CORE_DIALOG_CLASS],
    position: { width: Math.min(Math.max(360, Number(preferredWidth) || 560), viewportWidth - 32) }
  };
}

function mapApprovalRequest(entry, { hunts, monsterById }) {
  const approvalHunt = entry.huntId ? hunts.find(hunt => hunt.id === entry.huntId) : null;
  const approvalMonsterId = entry.monsterId ?? approvalHunt?.monsterId ?? null;
  return {
    ...entry,
    userName: game.users.get(entry.userId)?.name ?? entry.userId,
    typeLabel: game.i18n.localize(`HB.Approvals.Type.${entry.type}`),
    statusLabel: game.i18n.localize(`HB.Approvals.Status.${entry.status}`),
    quarryName: approvalMonsterId ? localizeText(monsterById.get(approvalMonsterId)?.name) : "—",
    huntTitle: approvalHunt?.title ?? entry.payload?.title ?? entry.huntId ?? "—",
    createdAtDisplay: formatDate(entry.createdAt),
    pending: entry.status === "pending",
    approved: entry.status === "approved"
  };
}

function actionSetTab(_event, target) {
  this.view.tab = target.dataset.tab;
  return this.render({ force: true });
}

function actionSelectMonster(_event, target) {
  this.view.monsterId = target.dataset.monsterId;
  return this.render({ force: true });
}

function actionSelectHunt(_event, target) {
  this.view.huntId = target.dataset.huntId;
  return this.render({ force: true });
}

async function actionAddNote() {
  if (!this.view.monsterId) return;
  if (!game.settings.get(MODULE_ID, SETTINGS.PLAYER_CAN_ADD_NOTES) && !game.user.isGM) {
    return notify("warn", game.i18n.localize("HB.Errors.NotesDisabled"));
  }
  const text = await promptText({
    title: game.i18n.localize("HB.Dialogs.AddNote.Title"),
    label: game.i18n.localize("HB.Dialogs.AddNote.Label"),
    multiline: true
  });
  if (!text) return;
  await addPersonalNote(game.user.id, this.view.monsterId, text);
  notify("info", game.i18n.localize("HB.Notifications.NoteAdded"));
  return this.render({ force: true });
}

async function actionRemoveNote(_event, target) {
  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.localize("HB.Dialogs.RemoveNote.Title") },
    content: `<p>${escapeHtml(game.i18n.localize("HB.Dialogs.RemoveNote.Content"))}</p>`,
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return;
  await removePersonalNote(game.user.id, target.dataset.monsterId, target.dataset.noteId);
  return this.render({ force: true });
}

async function actionAddSighting() {
  if (!this.view.monsterId) return;
  if (!game.user.isGM) {
    const world = getWorldData();
    const progress = await getProgress(game.user.id);
    const monsterIds = (world.monsters ?? []).map(entry => entry.id);
    const rules = getHuntRules(monsterIds);
    if (progress.huntCycle?.activeMonsterId !== this.view.monsterId) return notify("warn", game.i18n.localize("HB.Errors.SightingActiveQuarryOnly"));
    const record = progress.monsters?.[this.view.monsterId] ?? {};
    const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
    const status = fieldworkProgressStatus({ record, level, rules, monsterId: this.view.monsterId, monsterIds });
    if (!status.canRecordSighting) return notify("warn", game.i18n.localize("HB.Errors.SightingLocked"));
  }
  const result = await promptRecordEntry({
    kind: "sighting",
    initial: { location: canvas?.scene?.name ?? "" }
  });
  if (!result) return;
  const recordId = randomId();
  await addSighting(game.user.id, this.view.monsterId, { ...result, id: recordId });
  if (!game.user.isGM) {
    try {
      const evaluation = await requestGm("evaluate-sighting", { monsterId: this.view.monsterId, recordId });
      if (evaluation?.revealed) notify("info", game.i18n.localize("HB.Notifications.DifficultyRevealed"));
      else if (evaluation?.queuedApprovalId) notify("info", game.i18n.localize("HB.Notifications.DiscoveryReviewQueued"));
    } catch (error) {
      console.warn(`${MODULE_ID} | Sighting saved but difficulty evaluation could not be completed`, error);
      notify("warn", game.i18n.localize("HB.Notifications.EvidenceSavedNoGM"));
    }
  }
  if (game.settings.get(MODULE_ID, SETTINGS.AUTO_AWARD)) {
    if (game.user.isGM || !game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL)) {
      await awardKnowledge(game.user.id, this.view.monsterId, 1, "sighting", result.location);
    } else {
      try {
        await requestGm("request-fieldwork", {
          type: FIELDWORK_TYPES.SIGHTING_CREDIT,
          monsterId: this.view.monsterId,
          recordId,
          detail: result.location
        });
        notify("info", game.i18n.localize("HB.Notifications.EvidenceQueued"));
      } catch (error) {
        console.warn(`${MODULE_ID} | Sighting saved but progression review could not be queued`, error);
        notify("warn", game.i18n.localize("HB.Notifications.EvidenceSavedNoGM"));
      }
    }
  }
  notify("info", game.i18n.localize("HB.Notifications.SightingAdded"));
  return this.render({ force: true });
}

async function actionAddTrophy() {
  if (!this.view.monsterId) return;
  const result = await promptRecordEntry({ kind: "trophy" });
  if (!result?.name) return;
  const recordId = randomId();
  await addTrophy(game.user.id, this.view.monsterId, { ...result, id: recordId });
  if (game.settings.get(MODULE_ID, SETTINGS.AUTO_AWARD)) {
    if (game.user.isGM || !game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL)) {
      await awardKnowledge(game.user.id, this.view.monsterId, 1, "trophy", result.name);
    } else {
      try {
        await requestGm("request-fieldwork", {
          type: FIELDWORK_TYPES.TROPHY_CREDIT,
          monsterId: this.view.monsterId,
          recordId,
          detail: result.name
        });
        notify("info", game.i18n.localize("HB.Notifications.EvidenceQueued"));
      } catch (error) {
        console.warn(`${MODULE_ID} | Trophy saved but progression review could not be queued`, error);
        notify("warn", game.i18n.localize("HB.Notifications.EvidenceSavedNoGM"));
      }
    }
  }
  notify("info", game.i18n.localize("HB.Notifications.TrophyAdded"));
  return this.render({ force: true });
}

async function actionShareKnowledge() {
  if (!this.view.monsterId) return;
  const users = game.users.contents.filter(user => !user.isGM && user.id !== game.user.id);
  if (!users.length) return notify("warn", game.i18n.localize("HB.Notifications.NoOtherPlayers"));
  const checkboxes = users.map(user => `<label class="hb-dialog-choice"><input type="checkbox" name="target" value="${user.id}"><span>${escapeHtml(user.name)}</span></label>`).join("");
  const result = await DialogV2.prompt({
    ...coreDialogOptions(580),
    window: { title: game.i18n.localize("HB.Dialogs.Share.Title") },
    content: `<div class="hb-dialog-fields"><p>${escapeHtml(game.i18n.localize("HB.Dialogs.Share.Hint"))}</p><div class="hb-dialog-choice-list" role="group" aria-label="${escapeHtml(game.i18n.localize("HB.Dialogs.Share.Title"))}">${checkboxes}</div><label>${escapeHtml(game.i18n.localize("HB.Dialogs.Share.Detail"))}<textarea name="detail" rows="3"></textarea></label></div>`,
    ok: {
      label: game.i18n.localize("HB.Dialogs.Share.Action"),
      callback: (_event, button) => ({
        targetUserIds: Array.from(button.form.querySelectorAll('input[name="target"]:checked')).map(input => input.value),
        detail: button.form.elements.detail.value
      })
    },
    rejectClose: false,
    modal: true
  });
  if (!result?.targetUserIds?.length) return;
  const outcome = await requestGm("share-knowledge", { monsterId: this.view.monsterId, ...result });
  if (outcome?.shared > 0) notify("info", game.i18n.localize("HB.Notifications.KnowledgeShared"));
  else notify("warn", game.i18n.localize("HB.Notifications.KnowledgeAlreadyShared"));
  return this.render({ force: true });
}

async function actionPublishJournal() {
  await publishPersonalBestiary(game.user.id);
}

function actionNewHunt() {
  const actor = getSelectedActor();
  const owner = game.user?.isGM
    ? selectActorPlayerOwner(actor, game.users?.contents ?? [], globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3)
    : null;
  return new HuntEditorApp({
    knowledgeUserId: owner?.id ?? null,
    knowledgeActorName: actor?.name ?? owner?.character?.name ?? ""
  }).render({ force: true });
}

function actionEditHunt() {
  const hunt = visibleHuntsFor(game.user).find(entry => entry.id === this.view.huntId);
  if (!hunt || !game.user.isGM) return;
  return new HuntEditorApp({ hunt }).render({ force: true });
}

async function actionDeleteHunt() {
  if (!game.user.isGM || !this.view.huntId) return;
  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.localize("HB.Dialogs.DeleteHunt.Title") },
    content: `<p>${escapeHtml(game.i18n.localize("HB.Dialogs.DeleteHunt.Content"))}</p>`,
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return;
  await deleteHunt(this.view.huntId);
  this.view.huntId = null;
  return this.render({ force: true });
}

async function actionAttemptStep(_event, target) {
  const card = target.closest(".hb-step");
  const skillId = card?.querySelector("select[name='skillId']")?.value;
  const actor = getSelectedActor();
  if (!actor) return notify("warn", game.i18n.localize("HB.Notifications.SelectActor"));
  const hunt = visibleHuntsFor(game.user).find(entry => entry.id === target.dataset.huntId);
  const step = hunt?.steps?.find(entry => entry.id === target.dataset.stepId);
  if (!hunt || !step || !skillId) return;
  const roll = await performFieldCheck({ actor, skillId, dc: step.dc, label: `${hunt.title}: ${localizeText(step.name)}` });
  if (!roll) return;
  await requestGm("record-attempt", {
    huntId: hunt.id,
    stepId: step.id,
    userId: game.user.id,
    actorName: actor.name,
    actorUuid: actor.uuid,
    messageId: roll.messageId,
    skillId,
    total: roll.total,
    dc: step.dc,
    success: roll.success,
    approvalRequestId: target.dataset.approvalRequestId ?? null
  });
  notify("info", roll.success ? game.i18n.localize("HB.Notifications.HuntStepSuccess") : game.i18n.localize("HB.Notifications.HuntStepFailure"));
  return this.render({ force: true });
}

async function actionAdvanceStep(_event, target) {
  if (!game.user.isGM) return;
  await completeStep(target.dataset.huntId, target.dataset.stepId);
  Hooks.callAll(`${MODULE_ID}.huntChanged`, { huntId: target.dataset.huntId, stepId: target.dataset.stepId });
  notify("info", game.i18n.localize("HB.Notifications.HuntStepAdvanced"));
  return this.render({ force: true });
}

async function actionRevertStep(_event, target) {
  if (!game.user.isGM) return;
  await revertStepAdvance(target.dataset.huntId, target.dataset.stepId);
  Hooks.callAll(`${MODULE_ID}.huntChanged`, { huntId: target.dataset.huntId, stepId: target.dataset.stepId, reverted: true });
  notify("info", game.i18n.localize("HB.Notifications.HuntStepReverted"));
  return this.render({ force: true });
}

let auditLogApp = null;

async function actionOpenAuditLog() {
  if (!game.user.isGM || this.isPlayerPerspective) return;
  const actor = getSelectedActor();
  const user = selectActorPlayerOwner(actor, game.users?.contents ?? [], globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  if (!actor || !user) return notify("warn", game.i18n.localize("HB.Audit.SelectPlayerActor"));
  if (auditLogApp?.rendered) {
    auditLogApp.setTarget({ userId: user.id, actorName: actor.name });
    await auditLogApp.render({ force: true });
    auditLogApp.bringToFront?.();
    return auditLogApp;
  }
  auditLogApp = new AuditLogApp({ userId: user.id, actorName: actor.name });
  await auditLogApp.render({ force: true });
  return auditLogApp;
}

async function actionRequestFieldwork(_event, target) {
  if (game.user.isGM) return;
  const type = target.dataset.requestType;
  const hunt = visibleHuntsFor(game.user).find(entry => entry.id === this.view.huntId) ?? null;
  const progress = await getProgress(game.user.id);
  const monsterId = progress.huntCycle?.activeMonsterId ?? this.view.monsterId ?? hunt?.monsterId ?? null;
  const matchingHuntId = type === FIELDWORK_TYPES.TRACK && hunt?.monsterId === monsterId ? hunt.id : null;
  await requestGm("request-fieldwork", {
    type,
    monsterId,
    huntId: matchingHuntId
  });
  notify("info", game.i18n.localize("HB.Notifications.FieldworkRequested"));
  return this.render({ force: true });
}

async function actionRequestHuntAttempt(_event, target) {
  if (game.user.isGM) return;
  await requestGm("request-fieldwork", {
    type: FIELDWORK_TYPES.HUNT_ATTEMPT,
    huntId: target.dataset.huntId,
    stepId: target.dataset.stepId
  });
  notify("info", game.i18n.localize("HB.Notifications.FieldworkRequested"));
  return this.render({ force: true });
}

async function actionResolveFieldworkRequest(_event, target) {
  if (!game.user.isGM) return;
  await resolveFieldworkRequest(target.dataset.requestId, target.dataset.decision);
  notify("info", game.i18n.localize("HB.Notifications.FieldworkResolved"));
  return this.render({ force: true });
}

async function actionRandomRumor(_event, target) {
  const world = getWorldData();
  const allRumors = world.rumors ?? [];
  if (!allRumors.length) return;
  const actor = getSelectedActor();
  const approvalRequired = !game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL);
  const approvalRequestId = target?.dataset?.approvalRequestId ?? "";
  if (approvalRequired && !approvalRequestId) return notify("warn", game.i18n.localize("HB.Errors.FieldworkApprovalRequired"));

  if (!game.user.isGM) {
    const roll = await performFieldCheck({ actor, skillId: "inv", dc: 11, label: game.i18n.localize("HB.Actions.GatherRumor") });
    if (!roll) return;
    const result = await requestGm("resolve-rumor", { approvalRequestId: approvalRequestId || null, messageId: roll.messageId, actorUuid: roll.actorUuid });
    if (!result?.success) return this.render({ force: true });
    const rumor = allRumors.find(entry => entry.id === result?.rumorId);
    if (!rumor) return this.render({ force: true });
    const whisper = [game.user.id, ...game.users.filter(user => user.isGM).map(user => user.id)];
    await ChatMessage.create({
      user: game.user.id,
      whisper: Array.from(new Set(whisper)),
      content: `<section class="hb-chat-card"><header><i class="fa-solid fa-comments"></i> ${escapeHtml(game.i18n.localize("HB.Fields.Rumor"))}</header><p>${escapeHtml(localizeText(rumor.text))}</p></section>`,
      flags: { [MODULE_ID]: { kind: "rumor", rumorId: rumor.id } }
    });
    this.view.monsterId = result.monsterId ?? this.view.monsterId;
    if (result.newQuarry) notify("info", game.i18n.localize("HB.Notifications.NewQuarryRumored"));
    if (result.approvalReveals?.length) notify("info", game.i18n.localize("HB.Notifications.DiscoveryReviewQueued"));
    return this.render({ force: true });
  }

  const hunt = visibleHuntsFor(game.user).find(entry => entry.id === this.view.huntId) ?? null;
  const targetMonsterId = this.view.monsterId ?? hunt?.monsterId ?? null;
  const eligibleRumors = targetMonsterId ? allRumors.filter(rumor => !(rumor.monsterIds ?? []).length || rumor.monsterIds.includes(targetMonsterId)) : allRumors;
  const rumor = weightedChoice(eligibleRumors.length ? eligibleRumors : allRumors);
  const gmSuffix = `<p class="gm-only"><strong>${escapeHtml(game.i18n.localize("HB.Fields.Truth"))}:</strong> ${escapeHtml(game.i18n.localize(`HB.RumorTruth.${rumor.truth ?? "unknown"}`))}</p>`;
  await ChatMessage.create({ user: game.user.id, whisper: game.users.filter(user => user.isGM).map(user => user.id), content: `<section class="hb-chat-card"><header><i class="fa-solid fa-comments"></i> ${escapeHtml(game.i18n.localize("HB.Fields.Rumor"))}</header><p>${escapeHtml(localizeText(rumor.text))}</p>${gmSuffix}</section>`, flags: { [MODULE_ID]: { kind: "rumor", rumorId: rumor.id } } });
  return this.render({ force: true });
}

async function actionRandomTrack(_event, target) {
  const world = getWorldData();
  const tracks = world.tracks ?? [];
  if (!tracks.length) return;
  const hunt = visibleHuntsFor(game.user).find(entry => entry.id === this.view.huntId) ?? null;
  const progress = await getProgress(game.user.id);
  const targetMonsterId = progress.huntCycle?.activeMonsterId ?? this.view.monsterId ?? hunt?.monsterId ?? null;
  if (!targetMonsterId) return notify("warn", game.i18n.localize("HB.Errors.SelectFieldworkTarget"));
  if (!game.user.isGM) {
    const monsterIds = (world.monsters ?? []).map(entry => entry.id);
    const rules = getHuntRules(monsterIds);
    const record = progress.monsters?.[targetMonsterId] ?? {};
    const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
    const status = fieldworkProgressStatus({ record, level, rules, monsterId: targetMonsterId, monsterIds });
    if (!status.canSearchTracks) return notify("warn", game.i18n.format("HB.Errors.TrackLocked", { count: status.trackMinRumors }));
  }
  const eligibleTracks = tracks.filter(track => !(track.monsterIds ?? []).length || track.monsterIds.includes(targetMonsterId));
  const sourceTracks = eligibleTracks.length ? eligibleTracks : tracks;
  const track = sourceTracks[Math.floor(Math.random() * sourceTracks.length)];
  const actor = getSelectedActor();
  const approvalRequired = !game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL);
  const approvalRequestId = target?.dataset?.approvalRequestId ?? "";
  if (approvalRequired && !approvalRequestId) return notify("warn", game.i18n.localize("HB.Errors.FieldworkApprovalRequired"));

  const roll = await performFieldCheck({ actor, skillId: "sur", dc: track.baseDc, label: game.i18n.localize("HB.Actions.SearchTracks") });
  if (!roll) return;
  if (!game.user.isGM) {
    const resolution = await requestGm("resolve-track", { approvalRequestId: approvalRequestId || null, monsterId: targetMonsterId, trackId: track.id, messageId: roll.messageId, actorUuid: roll.actorUuid });
    if (!resolution?.success) return this.render({ force: true });
    if (resolution.sightingUnlocked) notify("info", game.i18n.localize("HB.Notifications.SightingUnlocked"));
    else if (resolution.queuedApprovalId) notify("info", game.i18n.localize("HB.Notifications.FieldworkUnlockQueued"));
  } else {
    await updateStatistics(game.user.id, { checksAttempted: 1, checksSucceeded: roll.success ? 1 : 0 });
    if (!roll.success) return this.render({ force: true });
    if (game.settings.get(MODULE_ID, SETTINGS.AUTO_AWARD)) await awardKnowledge(game.user.id, targetMonsterId, 1, "track", localizeText(track.name));
  }
  const whisper = [game.user.id, ...game.users.filter(user => user.isGM).map(user => user.id)];
  await ChatMessage.create({ user: game.user.id, whisper: Array.from(new Set(whisper)), content: `<section class="hb-chat-card"><header><i class="fa-solid fa-shoe-prints"></i> ${escapeHtml(localizeText(track.name))}</header><p>${escapeHtml(localizeText(track.description))}</p></section>`, flags: { [MODULE_ID]: { kind: "track", trackId: track.id } } });
  return this.render({ force: true });
}

async function actionDeferQuarry() {
  if (game.user.isGM) return;
  const progress = await getProgress(game.user.id);
  const monsterId = progress.huntCycle?.activeMonsterId;
  if (!monsterId) return notify("warn", game.i18n.localize("HB.Errors.NoActiveQuarry"));
  try {
    await requestGm("defer-quarry", { monsterId });
    notify("info", game.i18n.localize("HB.Notifications.QuarryDeferred"));
  } catch (error) {
    notify("warn", String(error?.message ?? error));
  }
  return this.render({ force: true });
}

async function actionRequestReactivateQuarry(_event, target) {
  if (game.user.isGM) return;
  const monsterId = target.dataset.monsterId;
  if (!monsterId) return;
  await requestGm("request-fieldwork", { type: FIELDWORK_TYPES.QUARRY_REACTIVATION, monsterId });
  notify("info", game.i18n.localize("HB.Notifications.ReactivationQueued"));
  return this.render({ force: true });
}

async function actionProposeHunt() {
  if (game.user.isGM) return;
  const progress = await getProgress(game.user.id);
  const monsterId = progress.huntCycle?.activeMonsterId;
  if (!monsterId) return notify("warn", game.i18n.localize("HB.Errors.NoActiveQuarry"));
  return new HuntEditorApp({ proposalMode: true, monsterId, knowledgeUserId: game.user.id, knowledgeActorName: getSelectedActor()?.name ?? game.user.character?.name ?? "" }).render({ force: true });
}

async function actionReadBook(_event, target) {
  const bookId = target.dataset.bookId;
  await markBookRead(game.user.id, bookId);
  notify("info", game.i18n.localize("HB.Notifications.BookRead"));
  return this.render({ force: true });
}

async function actionAwardKnowledge(_event, target) {
  if (!game.user.isGM) return;
  const panel = target.closest(".hb-gm-award");
  const userId = panel?.querySelector("select[name='userId']")?.value;
  const points = Number(panel?.querySelector("input[name='points']")?.value ?? 1);
  if (!userId || !this.view.monsterId) return;
  await awardKnowledge(userId, this.view.monsterId, points, "gm-award", game.i18n.localize("HB.Common.GMAdjustment"));
  notify("info", game.i18n.localize("HB.Notifications.KnowledgeAwarded"));
  return this.render({ force: true });
}

async function actionSetManualLevel(_event, target) {
  if (!game.user.isGM) return;
  const panel = target.closest(".hb-gm-award");
  const userId = panel?.querySelector("select[name='userId']")?.value;
  const levelValue = panel?.querySelector("select[name='manualLevel']")?.value;
  const manualLevel = levelValue === "auto" ? null : Number(levelValue);
  if (!userId || !this.view.monsterId) return;
  await setManualKnowledgeLevel(userId, this.view.monsterId, manualLevel);
  notify("info", game.i18n.localize("HB.Notifications.KnowledgeLevelSet"));
  return this.render({ force: true });
}

async function actionInstallLibrary(_event, target) {
  if (!game.user.isGM) return;
  await installReferenceLibrary({ updateExisting: target.dataset.update === "true" });
  return this.render({ force: true });
}

function actionNewMonster() {
  if (!game.user.isGM) return;
  return new MonsterEditorApp().render({ force: true });
}

function actionEditMonster() {
  if (!game.user.isGM || !this.view.monsterId) return;
  const monster = getWorldData().monsters.find(entry => entry.id === this.view.monsterId);
  if (!monster) return;
  return new MonsterEditorApp({ monster }).render({ force: true });
}

function actionOpenTransfer() {
  const existing = foundry.applications.instances.get("hunters-bestiary-transfer");
  if (existing) {
    if (!existing.rendered) existing.render({ force: true });
    else existing.bringToFront();
    return existing;
  }
  return new TransferApp().render({ force: true });
}

function actionChangeMonsterImage() {
  if (!game.user.isGM || !this.view.monsterId) return;
  const monsterId = this.view.monsterId;
  return openMonsterImagePicker(monsterId, {
    onSelected: async () => {
      notify("info", game.i18n.localize("HB.Notifications.ImageUpdated"));
      await this.render({ force: true });
    }
  });
}

async function actionResetMonsterImage() {
  if (!game.user.isGM || !this.view.monsterId) return;
  await resetMonsterImage(this.view.monsterId);
  notify("info", game.i18n.localize("HB.Notifications.ImageReset"));
  return this.render({ force: true });
}

async function actionOpenActor() {
  const monster = getWorldData().monsters.find(entry => entry.id === this.view.monsterId);
  if (!monster?.actorUuid) return notify("warn", game.i18n.localize("HB.Notifications.NoLinkedActor"));
  const actor = await fromUuid(monster.actorUuid);
  actor?.sheet?.render({ force: true });
}


async function actionProvisionActors(_event, target) {
  if (!game.user.isGM) return notify("error", game.i18n.localize("HB.Errors.GMOnly"));
  const monsterIds = target.dataset.scope === "selected" && this.view.monsterId ? [this.view.monsterId] : null;
  const updateExisting = target.dataset.update === "true";
  const result = await runProgressOperation({
    title: game.i18n.localize(updateExisting ? "HB.Progress.UpdateActors" : "HB.Progress.ImportActors"),
    root: this.element,
    runner: onProgress => provisionActors({ monsterIds, updateExisting, onProgress })
  });
  const summary = game.i18n.format("HB.Notifications.ActorsProvisioned", {
    created: result.created.length,
    updated: result.updated.length,
    linked: result.linked.length,
    skipped: result.skipped.length,
    failed: result.failed.length
  });
  notify(result.failed.length ? "warn" : "info", summary);
  if (result.failed.length) console.warn(`${MODULE_ID} | Actor provisioning failures`, result.failed);
  return this.render({ force: true });
}

function actionOpenPlayerPerspective() {
  if (!game.user?.isGM || this.isPlayerPerspective) return;
  const target = selectedPlayerPerspectiveTarget();
  if (!target) return notify("warn", game.i18n.localize("HB.PlayerPerspective.SelectToken"));
  return openPlayerPerspectiveDashboard({ user: target.user, actor: target.actor });
}

function actionOpenHuntRules() {
  if (!game.user?.isGM) return;
  return new HuntRulesApp().render({ force: true });
}

async function actionRequestResolution(_event, target) {
  if (game.user?.isGM) return;
  const card = target.closest(".hb-resolution-panel");
  const outcome = card?.querySelector('select[name="desiredOutcome"]')?.value;
  if (!outcome) return;
  await requestGm("request-hunt-resolution", { huntId: target.dataset.huntId, outcome });
  notify("info", game.i18n.localize("HB.Notifications.ResolutionRequested"));
  return this.render({ force: true });
}

async function actionAttemptResolution(_event, target) {
  if (game.user?.isGM) return;
  const hunt = visibleHuntsFor(game.user).find(entry => entry.id === target.dataset.huntId);
  if (!hunt?.resolution?.requestedOutcome) return;
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rule = resolutionRuleFor(getHuntRules(monsterIds), hunt.resolution.requestedOutcome, monsterIds);
  const card = target.closest(".hb-resolution-panel");
  const skillId = card?.querySelector('select[name="resolutionSkillId"]')?.value;
  const actor = getSelectedActor();
  if (!actor) return notify("warn", game.i18n.localize("HB.Notifications.SelectActor"));
  if (!skillId || !rule.skills.includes(skillId)) return;
  const roll = await performFieldCheck({ actor, skillId, dc: rule.dc, label: game.i18n.localize("HB.Hunts.ResolveTheHunt") });
  if (!roll) return;
  await requestGm("record-hunt-resolution-check", {
    huntId: hunt.id,
    skillId,
    actorUuid: actor.uuid,
    messageId: roll.messageId
  });
  notify("info", game.i18n.localize("HB.Notifications.ResolutionCheckSubmitted"));
  return this.render({ force: true });
}

async function actionGmResolveOutcome(_event, target) {
  if (!game.user?.isGM) return;
  const card = target.closest(".hb-resolution-panel");
  const outcome = card?.querySelector('select[name="actualOutcome"]')?.value;
  if (!outcome) return;
  await decideHuntResolution(target.dataset.huntId, outcome);
  Hooks.callAll(`${MODULE_ID}.huntChanged`, { huntId: target.dataset.huntId, resolution: true });
  notify("info", game.i18n.localize("HB.Notifications.HuntResolved"));
  return this.render({ force: true });
}

async function actionGmRejectResolution(_event, target) {
  if (!game.user?.isGM) return;
  await rejectHuntResolution(target.dataset.huntId);
  Hooks.callAll(`${MODULE_ID}.huntChanged`, { huntId: target.dataset.huntId, resolution: true });
  notify("info", game.i18n.localize("HB.Notifications.ResolutionRejected"));
  return this.render({ force: true });
}

async function actionResetWindow() {
  await this.resetWindowState();
}

async function actionResetSize() {
  await this.resetWindowSize();
  notify("info", game.i18n.localize("HB.Notifications.SizeReset"));
}

async function actionResetPosition() {
  await this.resetWindowPosition();
  notify("info", game.i18n.localize("HB.Notifications.PositionReset"));
}

async function actionOpenGuide() {
  this.view.tab = "guide";
  return this.render({ force: true });
}

export class MainApp extends PersistentApplication {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-control-centre",
    position: { width: 1120, height: 780 },
    window: {
      title: "HB.App.Title",
      icon: "fa-solid fa-book-open"
    },
    actions: {
      setTab: actionSetTab,
      selectMonster: actionSelectMonster,
      selectHunt: actionSelectHunt,
      addNote: actionAddNote,
      removeNote: actionRemoveNote,
      addSighting: actionAddSighting,
      addTrophy: actionAddTrophy,
      shareKnowledge: actionShareKnowledge,
      publishJournal: actionPublishJournal,
      newHunt: actionNewHunt,
      editHunt: actionEditHunt,
      deleteHunt: actionDeleteHunt,
      attemptStep: actionAttemptStep,
      advanceStep: actionAdvanceStep,
      revertStep: actionRevertStep,
      openAuditLog: actionOpenAuditLog,
      requestFieldwork: actionRequestFieldwork,
      requestHuntAttempt: actionRequestHuntAttempt,
      resolveFieldworkRequest: actionResolveFieldworkRequest,
      randomRumor: actionRandomRumor,
      randomTrack: actionRandomTrack,
      deferQuarry: actionDeferQuarry,
      requestReactivateQuarry: actionRequestReactivateQuarry,
      proposeHunt: actionProposeHunt,
      readBook: actionReadBook,
      awardKnowledge: actionAwardKnowledge,
      setManualLevel: actionSetManualLevel,
      installLibrary: actionInstallLibrary,
      newMonster: actionNewMonster,
      editMonster: actionEditMonster,
      openTransfer: actionOpenTransfer,
      openActor: actionOpenActor,
      changeMonsterImage: actionChangeMonsterImage,
      resetMonsterImage: actionResetMonsterImage,
      provisionActors: actionProvisionActors,
      resetWindow: actionResetWindow,
      resetSize: actionResetSize,
      resetPosition: actionResetPosition,
      openGuide: actionOpenGuide,
      openPlayerPerspective: actionOpenPlayerPerspective,
      openHuntRules: actionOpenHuntRules,
      requestResolution: actionRequestResolution,
      attemptResolution: actionAttemptResolution,
      gmResolveOutcome: actionGmResolveOutcome,
      gmRejectResolution: actionGmRejectResolution
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/main.hbs` }
  };

  #searchBinding = null;

  constructor(options = {}) {
    const { perspectiveUserId = null, perspectiveActor = null, ...applicationOptions } = options;
    super(applicationOptions);
    this.perspectiveUserId = game.user?.isGM && perspectiveUserId ? String(perspectiveUserId) : null;
    this.perspectiveActor = this.perspectiveUserId ? perspectiveActor : null;
    this.view = {
      tab: applicationOptions.initialTab ?? "bestiary",
      monsterId: applicationOptions.monsterId ?? null,
      huntId: applicationOptions.huntId ?? null,
      query: ""
    };
    this.applySavedViewState(this.view, { ignore: Boolean(applicationOptions.initialTab) || this.isPlayerPerspective });
  }

  get isPlayerPerspective() {
    return Boolean(this.perspectiveUserId && game.user?.isGM);
  }

  get perspectiveUser() {
    if (!this.isPlayerPerspective) return null;
    const user = game.users?.get?.(this.perspectiveUserId) ?? null;
    return user && !user.isGM ? user : null;
  }

  setPlayerPerspective({ user, actor = null } = {}) {
    if (!game.user?.isGM || !user || user.isGM) return false;
    this.perspectiveUserId = String(user.id);
    this.perspectiveActor = actor ?? user.character ?? null;
    this.view = { tab: "bestiary", monsterId: null, huntId: null, query: "" };
    return true;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#searchBinding?.destroy();
    this.#searchBinding = bindStableSearch(this.element, {
      inputSelector: '[data-hb-search="monsters"]',
      entrySelector: '[data-hb-list="monsters"] [data-search-text]',
      emptySelector: '[data-hb-search-empty="monsters"]',
      query: this.view.query,
      onQuery: query => { this.view.query = query; }
    });
    if (this.isPlayerPerspective) {
      this.element?.addEventListener("click", event => {
        const action = event.target?.closest?.("[data-action]")?.dataset?.action;
        if (!action || PLAYER_PERSPECTIVE_SAFE_ACTIONS.has(action)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        notify("info", game.i18n.localize("HB.PlayerPerspective.ReadOnly"));
      }, { capture: true, signal: this.renderListenerSignal });
    }
  }

  async _preClose(options) {
    this.#searchBinding?.destroy();
    this.#searchBinding = null;
    return super._preClose(options);
  }

  async _prepareContext(options) {
    const world = getWorldData();
    const viewer = this.isPlayerPerspective
      ? (this.perspectiveUser ?? { id: this.perspectiveUserId, isGM: false, character: null })
      : game.user;
    const isGM = Boolean(viewer?.isGM);
    const activeActor = this.isPlayerPerspective
      ? (this.perspectiveActor ?? viewer.character ?? null)
      : getSelectedActor();
    const selectedPlayer = game.user.isGM && !this.isPlayerPerspective
      ? selectActorPlayerOwner(activeActor, game.users?.contents ?? [], globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3)
      : null;
    const progress = await getProgress(viewer.id);
    const selectedPlayerProgress = selectedPlayer ? await getProgress(selectedPlayer.id) : null;
    const displayProgress = selectedPlayerProgress ?? progress;
    const allMonsters = world.monsters ?? [];
    const monsterIds = allMonsters.map(monster => monster.id);
    const huntRules = getHuntRules(monsterIds);
    const approvalRequired = !isGM && game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL);
    const fieldworkRequests = getFieldworkRequests(viewer);
    const monsterById = new Map(allMonsters.map(monster => [monster.id, monster]));
    const levelByNumber = new Map((world.knowledgeLevels ?? []).map(entry => [entry.level, entry]));
    const huntDisplayColors = getHuntDisplayColors();
    const visibleMonsters = allMonsters
      .map((monster, index) => {
        const entry = buildMonsterListEntry(monster, index, displayProgress, world.knowledgeLevels, isGM, world, levelByNumber, huntRules, monsterIds);
        if (selectedPlayer) {
          entry.huntDisplayState = classifyHuntMonsterState(displayProgress.monsters?.[monster.id] ?? {}, world.knowledgeLevels ?? []);
          entry.huntDisplayColor = huntMonsterColor(entry.huntDisplayState, huntDisplayColors);
          entry.selectedPlayerKnowledge = true;
        }
        return entry;
      })
      .filter(entry => isGM || entry.discovered);

    if (!this.view.monsterId || !visibleMonsters.some(entry => entry.id === this.view.monsterId)) {
      this.view.monsterId = visibleMonsters[0]?.id ?? null;
    }
    for (const entry of visibleMonsters) entry.selected = entry.id === this.view.monsterId;
    const selectedRaw = monsterById.get(this.view.monsterId) ?? null;
    const selectedMonster = selectedRaw ? buildMonsterDetail(selectedRaw, displayProgress, world.knowledgeLevels, isGM, world, levelByNumber, huntRules, monsterIds) : null;

    const hunts = visibleHuntsFor(viewer).map(hunt => localizeHunt(hunt, world, monsterById, { progress: displayProgress, levels: world.knowledgeLevels ?? [], isGM, huntRules, monsterIds }));
    if (!this.view.huntId || !hunts.some(hunt => hunt.id === this.view.huntId)) this.view.huntId = hunts[0]?.id ?? null;
    const selectedHunt = hunts.find(hunt => hunt.id === this.view.huntId) ?? null;

    if (approvalRequired) {
      for (const hunt of hunts) {
        for (const step of hunt.steps) {
          if (!step.active) continue;
          const request = fieldworkRequests.find(entry =>
            entry.type === FIELDWORK_TYPES.HUNT_ATTEMPT &&
            entry.huntId === hunt.id &&
            entry.stepId === step.id &&
            ["pending", "approved"].includes(entry.status)
          );
          step.attemptRequest = request ?? null;
          step.attemptPending = request?.status === "pending";
          step.attemptApproved = request?.status === "approved";
        }
      }
    }

    const fieldworkTargetId = displayProgress.huntCycle?.activeMonsterId ?? (isGM ? (this.view.monsterId ?? selectedHunt?.monsterId ?? null) : null);
    const rumorRequestRaw = fieldworkRequests.find(entry =>
      entry.type === FIELDWORK_TYPES.RUMOR &&
      entry.monsterId === fieldworkTargetId &&
      ["pending", "approved"].includes(entry.status)
    ) ?? null;
    const trackRequestRaw = fieldworkRequests.find(entry =>
      entry.type === FIELDWORK_TYPES.TRACK &&
      entry.monsterId === fieldworkTargetId &&
      ["pending", "approved"].includes(entry.status)
    ) ?? null;
    const rumorRequest = rumorRequestRaw ? { ...rumorRequestRaw, pending: rumorRequestRaw.status === "pending", approved: rumorRequestRaw.status === "approved" } : null;
    const trackRequest = trackRequestRaw ? { ...trackRequestRaw, pending: trackRequestRaw.status === "pending", approved: trackRequestRaw.status === "approved" } : null;
    const fieldworkRecord = fieldworkTargetId ? (displayProgress.monsters?.[fieldworkTargetId] ?? {}) : {};
    const fieldworkLevel = fieldworkTargetId ? knowledgeLevel(fieldworkRecord.points ?? 0, world.knowledgeLevels ?? [], fieldworkRecord.manualLevel) : 0;
    const fieldworkStatus = fieldworkTargetId ? fieldworkProgressStatus({ record: fieldworkRecord, level: fieldworkLevel, rules: huntRules, monsterId: fieldworkTargetId, monsterIds }) : null;
    const deferredQuarries = (displayProgress.huntCycle?.deferredMonsterIds ?? []).map(id => {
      const monster = monsterById.get(id);
      const record = displayProgress.monsters?.[id] ?? {};
      const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
      const entry = buildMonsterListEntry(monster ?? { id }, 0, displayProgress, world.knowledgeLevels, isGM, world, levelByNumber, huntRules, monsterIds);
      return { id, name: entry.name, difficultyLabel: difficultyDisplayLabel(difficultyBandFor(huntRules, id, monster, monsterIds)), fieldworkStatus: fieldworkProgressStatus({ record, level, rules: huntRules, monsterId: id, monsterIds }) };
    });
    const reactivationRequests = fieldworkRequests.filter(entry => entry.type === FIELDWORK_TYPES.QUARRY_REACTIVATION && ["pending", "approved"].includes(entry.status));
    const huntProposalRequest = fieldworkTargetId ? (fieldworkRequests.find(entry => entry.type === FIELDWORK_TYPES.HUNT_PROPOSAL && entry.monsterId === fieldworkTargetId && ["pending", "approved"].includes(entry.status)) ?? null) : null;

    const tabs = [
      tab("bestiary", "HB.Tabs.Bestiary", "fa-solid fa-book-skull", this.view.tab),
      tab("hunts", "HB.Tabs.Hunts", "fa-solid fa-location-crosshairs", this.view.tab),
      tab("fieldwork", "HB.Tabs.Fieldwork", "fa-solid fa-shoe-prints", this.view.tab),
      tab("library", "HB.Tabs.Library", "fa-solid fa-book", this.view.tab),
      ...(isGM ? [tab("gm", "HB.Tabs.GM", "fa-solid fa-lock", this.view.tab)] : []),
      tab("guide", "HB.Tabs.Guide", "fa-solid fa-circle-question", this.view.tab)
    ];

    const perspectiveTarget = game.user.isGM && !this.isPlayerPerspective ? selectedPlayerPerspectiveTarget() : null;
    const selectedPlayerRequests = selectedPlayer ? fieldworkRequestSummary(selectedPlayer.id) : null;
    const installed = game.settings.get(MODULE_ID, SETTINGS.INSTALLED_CONTENT) ?? {};
    const providerReports = isGM ? buildProviderReports(world).map(report => ({
      ...report,
      label: report.providerId === "core" ? game.i18n.localize("HB.Common.BuiltInContent") : report.providerId,
      monsters: report.monsters.map(monster => ({
        ...monster,
        name: localizeText(monsterById.get(monster.monsterId)?.name) || monster.monsterId,
        errorText: monster.errors.join(" · ")
      }))
    })) : [];
    const actorStatuses = isGM ? allMonsters.map(monster => actorProvisioningStatus(monster)) : [];
    const actorSummary = {
      linked: actorStatuses.filter(status => status.status === "linked").length,
      available: actorStatuses.filter(status => status.status === "available").length,
      notRequired: actorStatuses.filter(status => status.status === "not-required").length,
      incompatible: actorStatuses.filter(status => ["incompatible-system", "missing-adapter", "invalid"].includes(status.status)).length
    };
    const approvalQueue = isGM
      ? getFieldworkRequests(game.user)
          .filter(entry => ["pending", "approved"].includes(entry.status))
          .map(entry => mapApprovalRequest(entry, { hunts, monsterById }))
          .sort((a, b) => (a.status === b.status ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.status === "pending" ? -1 : 1))
      : [];
    const pendingApprovalCount = approvalQueue.filter(entry => entry.pending).length;
    const selectedPlayerApprovalQueue = selectedPlayer
      ? approvalQueue.filter(entry => entry.userId === selectedPlayer.id)
      : [];
    const selectedPlayerRecentRequests = selectedPlayerRequests
      ? selectedPlayerRequests.recent.slice(0, 8).map(entry => mapApprovalRequest(entry, { hunts, monsterById }))
      : [];
    const selectedPlayerRumors = selectedPlayerProgress
      ? selectedPlayerProgress.fieldLog.filter(entry => entry.type === "knowledge" && entry.source === "rumor").length
      : 0;
    const selectedPlayerTracks = selectedPlayerProgress
      ? selectedPlayerProgress.fieldLog.filter(entry => entry.type === "knowledge" && entry.source === "track").length
      : 0;
    return {
      isGM,
      canOpenPlayerPerspective: Boolean(game.user.isGM && !this.isPlayerPerspective),
      hasPlayerPerspectiveTarget: Boolean(perspectiveTarget),
      playerPerspectiveTargetName: perspectiveTarget?.user?.name ?? "",
      query: this.view.query,
      tabs,
      isBestiary: this.view.tab === "bestiary",
      isHunts: this.view.tab === "hunts",
      isFieldwork: this.view.tab === "fieldwork",
      isLibrary: this.view.tab === "library",
      isGMTab: this.view.tab === "gm",
      isGuide: this.view.tab === "guide",
      monsters: visibleMonsters,
      hasMonsters: visibleMonsters.length > 0,
      selectedMonster,
      hunts,
      hasHunts: hunts.length > 0,
      selectedHunt,
      tracks: (world.tracks ?? []).map(localizeRecord),
      books: (world.books ?? []).map(book => ({ ...localizeRecord(book), read: displayProgress.booksRead.includes(book.id) })),
      users: game.users.contents.filter(user => !user.isGM).map(user => ({ id: user.id, name: user.name, active: user.active })),
      activeActor: activeActor ? { id: activeActor.id, name: activeActor.name } : null,
      selectedPlayer: selectedPlayer ? {
        id: selectedPlayer.id,
        name: selectedPlayer.name,
        actorName: activeActor?.name ?? "",
        statistics: selectedPlayerProgress?.statistics ?? null,
        rumorsLearned: selectedPlayerRumors,
        tracksFound: selectedPlayerTracks,
        pendingApprovals: selectedPlayerApprovalQueue.filter(entry => entry.pending).length,
        approvedApprovals: selectedPlayerApprovalQueue.filter(entry => entry.approved).length
      } : null,
      selectedPlayerApprovalQueue,
      selectedPlayerRecentRequests,
      statistics: displayProgress.statistics,
      canAttempt: isGM || game.settings.get(MODULE_ID, SETTINGS.PLAYER_CAN_ATTEMPT),
      approvalRequired,
      rumorRequest,
      trackRequest,
      fieldworkTargetId,
      fieldworkStatus,
      canSearchTracks: isGM || Boolean(fieldworkStatus?.canSearchTracks),
      canRecordSighting: isGM || Boolean(fieldworkStatus?.canRecordSighting),
      canStartHunt: !isGM && Boolean(fieldworkStatus?.canStartHunt),
      deferredQuarries: deferredQuarries.map(entry => ({ ...entry, request: reactivationRequests.find(request => request.monsterId === entry.id) ?? null })),
      deferredCount: deferredQuarries.length,
      maxDeferredQuarries: huntRules.fieldwork?.maxDeferredQuarries ?? 2,
      huntProposalRequest,
      currentQuarry: displayProgress.huntCycle?.activeMonsterId ? {
        id: displayProgress.huntCycle.activeMonsterId,
        name: buildMonsterListEntry(monsterById.get(displayProgress.huntCycle.activeMonsterId) ?? {}, 0, displayProgress, world.knowledgeLevels, isGM, world, levelByNumber, huntRules, monsterIds).name,
        difficultyLabel: difficultyDisplayLabel(difficultyBandFor(huntRules, displayProgress.huntCycle.activeMonsterId, monsterById.get(displayProgress.huntCycle.activeMonsterId), monsterIds))
      } : null,
      canDeferQuarry: !isGM && Boolean(displayProgress.huntCycle?.activeMonsterId) && deferredQuarries.length < (huntRules.fieldwork?.maxDeferredQuarries ?? 2),
      huntRulesConfigured: true,
      approvalQueue,
      approvalCount: approvalQueue.length,
      pendingApprovalCount,
      showApprovalInbox: isGM && pendingApprovalCount > 0,
      canAddNotes: isGM || game.settings.get(MODULE_ID, SETTINGS.PLAYER_CAN_ADD_NOTES),
      canShare: isGM || game.settings.get(MODULE_ID, SETTINGS.PLAYER_CAN_SHARE),
      journalSync: game.settings.get(MODULE_ID, SETTINGS.JOURNAL_SYNC),
      installedContent: installed,
      installedAt: formatDate(installed.installedAt),
      providerReports,
      providerIncompleteCount: providerReports.reduce((sum, report) => sum + report.incompleteCount, 0),
      actorSummary,
      huntStatus: HUNT_STATUS,
      skillLabels: SKILL_LABELS,
      moduleVersion: game.modules.get(MODULE_ID)?.version ?? "1.8.0"
    };
  }
}

export function openPlayerPerspectiveDashboard({ user, actor = null } = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM may open a player-perspective dashboard.");
  if (!user || user.isGM) throw new Error("A non-GM player is required.");
  const existing = foundry.applications.instances.get(PLAYER_PERSPECTIVE_APP_ID);
  const app = existing instanceof MainApp
    ? existing
    : new MainApp({
        id: PLAYER_PERSPECTIVE_APP_ID,
        perspectiveUserId: user.id,
        perspectiveActor: actor ?? user.character ?? null
      });
  if (existing instanceof MainApp) app.setPlayerPerspective({ user, actor });
  const rendered = app.render({ force: true });
  void Promise.resolve(rendered).then(() => {
    if (app.rendered && app.element) app.bringToFront?.();
  }).catch(error => console.warn(`${MODULE_ID} | Could not foreground player-perspective dashboard`, error));
  return app;
}

export class AdminApp extends MainApp {
  static DEFAULT_OPTIONS = {
    id: "hunters-bestiary-administration",
    position: { width: 1120, height: 780 },
    window: {
      title: "HB.Admin.Title",
      icon: "fa-solid fa-compass-drafting"
    }
  };

  constructor(options = {}) {
    super({ ...options, initialTab: "gm" });
  }
}

function tab(id, label, icon, activeTab) {
  return { id, label, icon, active: id === activeTab };
}

function difficultyDisplayLabel(band) {
  if (!band) return "—";
  return band.customLabel || game.i18n.localize(band.localizationKey);
}

function buildMonsterListEntry(monster, index, progress, levels, isGM, world, levelByNumber = new Map((levels ?? []).map(entry => [entry.level, entry])), huntRules = {}, monsterIds = []) {
  if (!monster?.id) return { id: "", discovered: false, name: game.i18n.localize("HB.Common.UnknownBeast") };
  const record = progress.monsters[monster.id] ?? { points: 0, manualLevel: null, unlockedFields: [], legacyDisclosure: false };
  const level = knowledgeLevel(record.points ?? 0, levels, record.manualLevel);
  const discovered = Boolean(progress.monsters[monster.id]) && ((record.points ?? 0) > 0 || (record.sightings?.length ?? 0) > 0 || (record.trophies?.length ?? 0) > 0 || (record.hunts?.length ?? 0) > 0);
  const fields = disclosedFieldsFor({ record, level, rules: huntRules, monsterId: monster.id, isGM, monsterIds });
  const nameVisible = isGM || fields.has("name");
  const difficultyVisible = isGM || fields.has("difficulty") || fields.has("tier");
  const profileVisible = isGM || fields.has("summary");
  const localized = localizeRecord(monster);
  const currentLevel = levelByNumber.get(level);
  const currentThreshold = currentLevel?.threshold ?? 0;
  const nextThreshold = levelByNumber.get(Math.min(5, level + 1))?.threshold ?? currentThreshold;
  const progressPercent = level >= 5 ? 100 : Math.max(0, Math.min(100, Math.round(((record.points - currentThreshold) / Math.max(1, nextThreshold - currentThreshold)) * 100)));
  return {
    id: monster.id,
    imageOverridden: Boolean(imageOverrideFor(monster.id, world)),
    canChangeImage: isGM,
    name: nameVisible ? localized.name : `${game.i18n.localize("HB.Common.UnknownBeast")} ${index + 1}`,
    type: profileVisible ? localized.type : "",
    difficultyLabel: difficultyVisible ? difficultyDisplayLabel(difficultyBandFor(huntRules, monster.id, monster, monsterIds)) : "—",
    tags: profileVisible ? (monster.tags ?? []) : [],
    tagsText: profileVisible ? (monster.tags ?? []).join(" ") : "",
    points: record.points ?? 0,
    rumorsSucceeded: record.rumorsSucceeded ?? 0,
    progressPercent,
    level,
    levelName: localizeText(currentLevel?.name),
    discovered,
    selected: false,
    image: nameVisible ? resolveMonsterImage(monster, world) : `modules/${MODULE_ID}/assets/hunters-bestiary.svg`
  };
}

function buildMonsterDetail(monster, progress, levels, isGM, world, levelByNumber = new Map((levels ?? []).map(entry => [entry.level, entry])), huntRules = {}, monsterIds = []) {
  const localized = localizeRecord(monster);
  const record = progress.monsters[monster.id] ?? { points: 0, notes: [], sightings: [], trophies: [], discoveries: [], hunts: [], manualLevel: null, unlockedFields: [], legacyDisclosure: false };
  const level = knowledgeLevel(record.points ?? 0, levels, record.manualLevel);
  const fields = disclosedFieldsFor({ record, level, rules: huntRules, monsterId: monster.id, isGM, monsterIds });
  const value = key => (isGM || fields.has(key)) ? localized[key] : game.i18n.localize("HB.Common.LockedKnowledge");
  const nameVisible = isGM || fields.has("name");
  const difficultyVisible = isGM || fields.has("difficulty") || fields.has("tier");
  const profileVisible = isGM || fields.has("summary");
  const currentLevel = levelByNumber.get(level);
  const next = levelByNumber.get(Math.min(5, level + 1));
  const currentThreshold = currentLevel?.threshold ?? 0;
  const nextThreshold = next?.threshold ?? currentThreshold;
  const percent = level >= 5 ? 100 : Math.max(0, Math.min(100, Math.round(((record.points - currentThreshold) / Math.max(1, nextThreshold - currentThreshold)) * 100)));
  const habitatsValue = value("habitats");
  const signsValue = value("signs");
  const actorStatus = isGM ? actorProvisioningStatus(monster) : { status: "not-required", available: false };
  return {
    id: monster.id,
    image: nameVisible ? resolveMonsterImage(monster, world) : `modules/${MODULE_ID}/assets/hunters-bestiary.svg`,
    imageOverridden: Boolean(imageOverrideFor(monster.id, world)),
    canChangeImage: isGM,
    name: nameVisible ? localized.name : game.i18n.localize("HB.Common.UnknownBeast"),
    type: profileVisible ? localized.type : game.i18n.localize("HB.Common.LockedKnowledge"),
    difficultyLabel: difficultyVisible ? difficultyDisplayLabel(difficultyBandFor(huntRules, monster.id, monster, monsterIds)) : "—",
    tags: profileVisible ? (monster.tags ?? []) : [],
    level,
    levelName: localizeText(currentLevel?.name),
    points: record.points ?? 0,
    rumorsSucceeded: record.rumorsSucceeded ?? 0,
    nextThreshold,
    progressPercent: percent,
    minimumHuntLevel: minimumHuntKnowledgeLevel(huntRules, monster.id, monsterIds),
    fieldworkStatus: fieldworkProgressStatus({ record, level, rules: huntRules, monsterId: monster.id, monsterIds }),
    canStartHunt: isGM || fieldworkProgressStatus({ record, level, rules: huntRules, monsterId: monster.id, monsterIds }).canStartHunt,
    isActiveQuarry: progress.huntCycle?.activeMonsterId === monster.id,
    isDeferred: (progress.huntCycle?.deferredMonsterIds ?? []).includes(monster.id),
    summary: value("summary"),
    rumor: value("rumor"),
    habitats: Array.isArray(habitatsValue) ? habitatsValue : [habitatsValue],
    signs: Array.isArray(signsValue) ? signsValue : [signsValue],
    ecology: value("ecology"),
    behavior: value("behavior"),
    defenses: value("defenses"),
    weaknesses: value("weaknesses"),
    harvest: value("harvest"),
    gmSecrets: isGM ? localized.gmSecrets : null,
    actorUuid: monster.actorUuid,
    actorStatus: actorStatus.status,
    actorStatusLabel: game.i18n.localize(`HB.ActorStatus.${actorStatus.status}`),
    actorCanProvision: isGM && actorStatus.available && !monster.actorUuid,
    notes: (record.notes ?? []).map(note => ({ ...note, atDisplay: formatDate(note.at) })),
    sightings: (record.sightings ?? []).map(sighting => ({ ...sighting, atDisplay: formatDate(sighting.at) })).reverse(),
    trophies: (record.trophies ?? []).map(trophy => ({ ...trophy, atDisplay: formatDate(trophy.at) })).reverse(),
    hunts: (record.hunts ?? []).map(hunt => ({
      ...hunt,
      statusLabel: game.i18n.localize(`HB.HuntStatus.${hunt.status ?? "active"}`),
      outcomeLabel: hunt.outcome ? game.i18n.localize(`HB.Outcomes.${hunt.outcome}`) : "—",
      updatedAtDisplay: formatDate(hunt.updatedAt ?? hunt.resolvedAt ?? hunt.joinedAt)
    })).reverse(),
    discoveries: (record.discoveries ?? []).map(discovery => ({ ...discovery, atDisplay: formatDate(discovery.at) })).reverse().slice(0, 10),
    manualLevel: record.manualLevel,
    isMastered: level >= 5
  };
}

function localizeHunt(hunt, world, monsterById = new Map((world.monsters ?? []).map(entry => [entry.id, entry])), { progress = { monsters: {} }, levels = [], isGM = false, huntRules = {}, monsterIds = [] } = {}) {
  const monster = monsterById.get(hunt.monsterId);
  const record = progress.monsters?.[hunt.monsterId] ?? { points: 0, manualLevel: null, unlockedFields: [], legacyDisclosure: false };
  const level = knowledgeLevel(record.points ?? 0, levels, record.manualLevel);
  const fields = disclosedFieldsFor({ record, level, rules: huntRules, monsterId: hunt.monsterId, isGM, monsterIds });
  const nameVisible = isGM || fields.has("name");
  const requiredLevel = minimumHuntKnowledgeLevel(huntRules, hunt.monsterId, monsterIds);
  const resolutionStage = isResolutionStage(hunt);
  const requestedOutcome = hunt.resolution?.requestedOutcome ?? null;
  const requestedRule = requestedOutcome ? resolutionRuleFor(huntRules, requestedOutcome, monsterIds) : null;
  const reversibleId = isGM ? reversibleStepId(hunt) : null;
  return {
    ...hunt,
    monsterName: monster && nameVisible ? localizeText(monster.name) : game.i18n.localize("HB.Common.UnknownBeast"),
    updatedAtDisplay: formatDate(hunt.updatedAt),
    requiredKnowledgeLevel: requiredLevel,
    currentKnowledgeLevel: level,
    huntEligible: isGM || level >= requiredLevel,
    steps: hunt.steps.map(step => ({
      ...step,
      name: localizeText(step.name),
      successText: localizeText(step.success),
      failureText: localizeText(step.failure),
      active: step.status === "active",
      completed: step.status === "completed",
      locked: step.status === "locked",
      reversible: step.id === reversibleId,
      conclusion: step.kind === "conclusion",
      skillOptions: step.skills.map(skillId => ({ id: skillId, label: SKILL_LABELS[skillId] ?? skillId }))
    })),
    resolutionView: {
      available: resolutionStage,
      status: hunt.resolution?.status ?? "awaiting-choice",
      awaitingChoice: resolutionStage && (!hunt.resolution?.requestedOutcome || hunt.resolution?.status === "awaiting-choice"),
      pendingCheck: hunt.resolution?.status === "pending-check",
      pendingGM: hunt.resolution?.status === "pending-gm",
      requestedOutcome,
      requestedOutcomeLabel: requestedOutcome ? game.i18n.localize(`HB.Outcomes.${requestedOutcome}`) : "—",
      check: hunt.resolution?.check ?? null,
      checkSkills: (requestedRule?.skills ?? []).map(id => ({ id, label: SKILL_LABELS[id] ?? id })),
      checkDc: requestedRule?.dc ?? 0,
      desiredOutcomes: PLAYER_RESOLUTION_OUTCOMES.map(outcome => ({ outcome, label: game.i18n.localize(`HB.Outcomes.${outcome}`), modeLabel: game.i18n.localize(`HB.HuntRules.ResolutionMode.${resolutionRuleFor(huntRules, outcome, monsterIds).mode}`) })),
      actualOutcomes: OUTCOMES.filter(outcome => outcome !== "unknown").map(outcome => ({ outcome, label: game.i18n.localize(`HB.Outcomes.${outcome}`) }))
    },
    complications: hunt.complications.map(entry => ({ ...entry, atDisplay: formatDate(entry.at) })).reverse()
  };
}

function weightedChoice(items) {
  const weighted = items.map(item => ({ item, weight: Math.max(1, Number(item.weight ?? 1)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return entry.item;
  }
  return weighted.at(-1)?.item ?? null;
}

async function promptText({ title, label, multiline = false }) {
  const input = multiline
    ? `<textarea name="value" rows="8" autofocus></textarea>`
    : `<input name="value" type="text" autofocus>`;
  return DialogV2.prompt({
    ...coreDialogOptions(560),
    window: { title },
    content: `<div class="hb-dialog-fields"><label>${escapeHtml(label)}${input}</label></div>`,
    ok: {
      label: game.i18n.localize("HB.Common.Save"),
      callback: (_event, button) => button.form.elements.value.value.trim()
    },
    rejectClose: false,
    modal: true
  });
}
