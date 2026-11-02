import { MODULE_ID, SOCKET_NAME, SETTINGS } from "./constants.mjs";
import { primaryActiveGm, randomId, notify, moduleError, localizeText } from "./utils.mjs";
import { recordAttempt, addComplication, requestHuntResolution, recordHuntResolutionCheck, pauseSoloHuntsForQuarry } from "./hunts.mjs";
import { awardKnowledge, getWorldData, getHunts, getProgress, knowledgeLevel, updateStatistics, recordRumorSuccess, recordTrackSuccess, unlockMonsterFields, unlockFieldworkCapabilities, deferActiveQuarry } from "./state.mjs";
import { createFieldworkRequest, consumeFieldworkRequest, FIELDWORK_TYPES } from "./fieldwork.mjs";
import { getHuntRules, chooseQuarryMonsterId, rollDisclosureOpportunities, resolutionRuleFor, rollFieldworkOpportunity, fieldworkProgressStatus } from "./hunt-rules.mjs";

const pending = new Map();
const handledRequests = new Map();
const ACTIONS = new Set([
  "record-attempt",
  "award-knowledge",
  "share-knowledge",
  "request-fieldwork",
  "consume-fieldwork",
  "resolve-rumor",
  "resolve-track",
  "evaluate-sighting",
  "defer-quarry",
  "request-hunt-resolution",
  "record-hunt-resolution-check"
]);
const REPLAY_TTL_MS = 5 * 60 * 1000;
const MAX_HANDLED_REQUESTS = 500;
let socketRegistered = false;

export function registerSocket() {
  if (socketRegistered) return false;
  game.socket.on(SOCKET_NAME, async payload => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (payload.kind === "response") return handleResponse(payload);
    if (payload.kind !== "request") return;
    const gm = primaryActiveGm();
    if (!gm || !game.user.isGM || gm.id !== game.user.id) return;
    await handleRequest(payload);
  });
  socketRegistered = true;
  return true;
}

export async function requestGm(action, data = {}, { timeout = 15000 } = {}) {
  if (!ACTIONS.has(action)) throw new Error(`Unknown Hunter's Bestiary socket action: ${action}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Socket request data must be an object.");
  if (game.user.isGM) return dispatch(action, data, game.user.id);
  const gm = primaryActiveGm();
  if (!gm) throw new Error(game.i18n.localize("HB.Errors.NoActiveGM"));
  const requestId = randomId();
  const promise = new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(game.i18n.localize("HB.Errors.GMRequestTimeout")));
    }, Math.max(1000, Math.min(Number(timeout) || 15000, 60000)));
    pending.set(requestId, { resolve, reject, handle });
  });
  game.socket.emit(SOCKET_NAME, {
    kind: "request",
    requestId,
    action,
    data,
    fromUserId: game.user.id,
    toUserId: gm.id
  });
  return promise;
}

export function validateSocketRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Invalid socket request.";
  if (payload.kind !== "request") return "Invalid socket request kind.";
  if (!validId(payload.requestId, 128)) return "Invalid request id.";
  if (!validId(payload.fromUserId, 128)) return "Invalid requesting user id.";
  if (payload.toUserId != null && !validId(payload.toUserId, 128)) return "Invalid target user id.";
  if (!ACTIONS.has(payload.action)) return "Unknown socket action.";
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) return "Invalid socket request data.";
  return null;
}

async function handleRequest(payload) {
  if (payload.toUserId && payload.toUserId !== game.user.id) return;
  cleanupHandledRequests();
  const validationError = validateSocketRequest(payload);
  if (validationError) return emitResponse(payload, { ok: false, error: validationError });

  const replayKey = `${payload.fromUserId}:${payload.requestId}`;
  const cached = handledRequests.get(replayKey);
  if (cached) {
    game.socket.emit(SOCKET_NAME, cached.response);
    return;
  }

  let response;
  try {
    const result = await dispatch(payload.action, payload.data, payload.fromUserId);
    response = createResponse(payload, { ok: true, result });
  } catch (error) {
    moduleError("Socket request failed", payload.action, error);
    response = createResponse(payload, { ok: false, error: safeErrorMessage(error) });
  }
  handledRequests.set(replayKey, { at: Date.now(), response });
  trimHandledRequests();
  game.socket.emit(SOCKET_NAME, response);
}

function emitResponse(payload, result) {
  game.socket.emit(SOCKET_NAME, createResponse(payload, result));
}

function createResponse(payload, result) {
  return {
    kind: "response",
    requestId: String(payload.requestId ?? ""),
    toUserId: String(payload.fromUserId ?? ""),
    ...result
  };
}

function handleResponse(payload) {
  if (!validId(payload.requestId, 128) || payload.toUserId !== game.user.id) return;
  const waiter = pending.get(payload.requestId);
  if (!waiter) return;
  pending.delete(payload.requestId);
  clearTimeout(waiter.handle);
  if (payload.ok) waiter.resolve(payload.result);
  else waiter.reject(new Error(String(payload.error || "GM request failed.").slice(0, 1000)));
}

async function dispatch(action, data, originUserId) {
  switch (action) {
    case "record-attempt":
      return handleAttempt(data, originUserId);
    case "award-knowledge":
      return handleKnowledge(data, originUserId);
    case "share-knowledge":
      return handleShare(data, originUserId);
    case "request-fieldwork":
      return handleFieldworkRequest(data, originUserId);
    case "consume-fieldwork":
      return handleFieldworkConsume(data, originUserId);
    case "resolve-rumor":
      return handleRumorResolution(data, originUserId);
    case "resolve-track":
      return handleTrackResolution(data, originUserId);
    case "evaluate-sighting":
      return handleSightingEvaluation(data, originUserId);
    case "defer-quarry":
      return handleDeferQuarry(data, originUserId);
    case "request-hunt-resolution":
      return handleHuntResolutionRequest(data, originUserId);
    case "record-hunt-resolution-check":
      return handleHuntResolutionCheck(data, originUserId);
    default:
      throw new Error(`Unknown Hunter's Bestiary socket action: ${action}`);
  }
}

async function handleAttempt(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser) throw new Error("Attempting user not found.");
  if (!game.settings.get(MODULE_ID, SETTINGS.PLAYER_CAN_ATTEMPT) && !originUser.isGM) {
    throw new Error(game.i18n.localize("HB.Errors.AttemptsDisabled"));
  }
  const userId = validId(data.userId, 128) ? data.userId : originUserId;
  if (userId !== originUserId && !originUser.isGM) throw new Error("Invalid attempt owner.");
  if (!validId(data.huntId, 128) || !validId(data.stepId, 128) || !validId(data.skillId, 32)) throw new Error("Invalid hunt attempt identifiers.");
  if (!validId(data.messageId, 128)) throw new Error("A module-owned field-check Chat message is required.");

  const hunt = getHunts().find(entry => entry.id === data.huntId);
  if (!hunt) throw new Error("Hunt not found.");
  if (!originUser.isGM && !hunt.participantUserIds?.includes(originUserId)) throw new Error("You are not a participant in this hunt.");
  const step = hunt.steps?.find(entry => entry.id === data.stepId);
  if (!step) throw new Error("Hunt step not found.");
  if (!step.skills?.includes(data.skillId)) throw new Error("That skill is not permitted for this hunt step.");

  let actor = null;
  if (data.actorUuid) {
    actor = await fromUuid(String(data.actorUuid)).catch(() => null);
    const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    if (!actor || actor.documentName !== "Actor" || (!originUser.isGM && !actor.testUserPermission(originUser, ownerLevel))) {
      throw new Error("The selected hunter is not owned by the attempting user.");
    }
  }

  const message = game.messages.get(data.messageId);
  validateAttemptMessage(message, { originUserId, actorUuid: actor?.uuid ?? null, skillId: data.skillId, dc: Number(step.dc) });

  if (!originUser.isGM && game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL)) {
    if (!validId(data.approvalRequestId, 128)) throw new Error("A GM-approved hunt attempt is required.");
    await consumeFieldworkRequest(data.approvalRequestId, {
      userId: originUserId,
      type: FIELDWORK_TYPES.HUNT_ATTEMPT,
      huntId: data.huntId,
      stepId: data.stepId
    });
  }
  const total = Number(message.rolls?.[0]?.total);
  if (!Number.isFinite(total)) throw new Error("The field-check total is invalid.");
  const dc = Number(step.dc);
  const success = total >= dc;
  const result = await recordAttempt({
    huntId: data.huntId,
    stepId: data.stepId,
    userId,
    actorName: String(data.actorName ?? actor?.name ?? "Hunter").slice(0, 200),
    skillId: data.skillId,
    total,
    dc,
    success,
    messageId: data.messageId
  });
  await updateStatistics(userId, { checksAttempted: 1, checksSucceeded: success ? 1 : 0 });
  if (success && game.settings.get(MODULE_ID, SETTINGS.AUTO_AWARD)) {
    await awardKnowledge(userId, result.hunt.monsterId, 1, "hunt-step", localizeText(result.step.name));
  } else if (!success) {
    const options = getWorldData().complications ?? [];
    if (options.length) {
      const selected = options[Math.floor(Math.random() * options.length)];
      await addComplication(result.hunt.id, localizeText(selected), "failed-check");
    }
  }
  Hooks.callAll(`${MODULE_ID}.huntAttemptResolved`, result);
  return { huntId: result.hunt.id, stepId: result.step.id, success };
}

function validateAttemptMessage(message, expected) {
  if (!message) throw new Error("The field-check Chat message was not found.");
  const authorId = message.user?.id ?? message.user;
  if (authorId !== expected.originUserId) throw new Error("The field-check Chat message belongs to another user.");
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (flags.kind !== "field-check") throw new Error("The Chat message is not a Hunter's Bestiary field check.");
  if (flags.skillId !== expected.skillId) throw new Error("The field-check skill does not match the hunt step.");
  if (Number(flags.dc) !== Number(expected.dc)) throw new Error("The field-check DC does not match the hunt step.");
  if (expected.actorUuid && flags.actorUuid !== expected.actorUuid) throw new Error("The field-check Actor does not match the submitted hunter.");
}

function validateFieldCheckMessage(message, expected) {
  if (!message) throw new Error("The field-check Chat message was not found.");
  const authorId = message.user?.id ?? message.user;
  if (authorId !== expected.originUserId) throw new Error("The field-check Chat message belongs to another user.");
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (flags.kind !== "field-check") throw new Error("The Chat message is not a Hunter's Bestiary field check.");
  if (flags.skillId !== expected.skillId) throw new Error("The field-check skill does not match the requested fieldwork.");
  if (Number(flags.dc) !== Number(expected.dc)) throw new Error("The field-check DC does not match the requested fieldwork.");
  if (expected.actorUuid && flags.actorUuid !== expected.actorUuid) throw new Error("The field-check Actor does not match the submitted hunter.");
  return message;
}

async function handleKnowledge(data, originUserId) {
  if (!game.users.get(originUserId)?.isGM) throw new Error("Only a GM may award knowledge directly.");
  const user = game.users.get(data.userId);
  const monster = getWorldData().monsters?.find(entry => entry.id === data.monsterId);
  if (!user || !monster) throw new Error("Unknown user or monster.");
  const points = Math.max(-999, Math.min(999, Number(data.points) || 0));
  return awardKnowledge(user.id, monster.id, points, String(data.source ?? "gm").slice(0, 100), String(data.detail ?? "").slice(0, 1000));
}

async function handleShare(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser) throw new Error("Sharing user not found.");
  if (!game.settings.get(MODULE_ID, SETTINGS.PLAYER_CAN_SHARE) && !originUser.isGM) {
    throw new Error(game.i18n.localize("HB.Errors.SharingDisabled"));
  }
  const monster = getWorldData().monsters?.find(entry => entry.id === data.monsterId);
  if (!monster) throw new Error("Unknown monster.");
  const targetUserIds = Array.from(new Set(Array.isArray(data.targetUserIds) ? data.targetUserIds : []))
    .filter(id => validId(id, 128) && game.users.has(id) && id !== originUserId)
    .slice(0, 50);
  if (!targetUserIds.length) return { shared: 0 };
  const detail = String(data.detail ?? "").slice(0, 1000);
  const senderProgress = await getProgress(originUserId);
  const senderRecord = senderProgress.monsters?.[monster.id] ?? { points: 0, manualLevel: null };
  const senderLevel = knowledgeLevel(senderRecord.points ?? 0, getWorldData().knowledgeLevels ?? [], senderRecord.manualLevel);
  if (!originUser.isGM && senderLevel <= 0) throw new Error("You need discovered knowledge before you can share an insight.");

  const source = originUser.isGM ? "shared-insight:gm" : `shared-insight:${originUserId}:level-${senderLevel}`;
  let shared = 0;
  let skipped = 0;
  await Promise.all(targetUserIds.map(async targetUserId => {
    if (!originUser.isGM) {
      const targetProgress = await getProgress(targetUserId);
      const discoveries = targetProgress.monsters?.[monster.id]?.discoveries ?? [];
      if (discoveries.some(entry => entry.source === source)) {
        skipped += 1;
        return;
      }
    }
    await awardKnowledge(targetUserId, monster.id, 1, source, detail);
    shared += 1;
  }));
  notify("info", game.i18n.format("HB.Notifications.KnowledgeSharedGM", { count: shared }));
  Hooks.callAll(`${MODULE_ID}.knowledgeShared`, { originUserId, monsterId: monster.id, detail, targetUserIds, shared, skipped, senderLevel });
  return { shared, skipped, senderLevel };
}

async function handleFieldworkRequest(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser) throw new Error("Requesting user not found.");
  if (originUser.isGM) throw new Error("GM fieldwork does not require approval.");
  const alwaysApprovedTypes = new Set([FIELDWORK_TYPES.QUARRY_REACTIVATION, FIELDWORK_TYPES.HUNT_PROPOSAL]);
  if (!game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL) && !alwaysApprovedTypes.has(data.type)) {
    throw new Error("Fieldwork approval is disabled.");
  }
  const request = await createFieldworkRequest({
    userId: originUserId,
    type: data.type,
    monsterId: data.monsterId ?? null,
    huntId: data.huntId ?? null,
    stepId: data.stepId ?? null,
    recordId: data.recordId ?? null,
    detail: data.detail ?? "",
    payload: data.payload ?? null
  });
  return request;
}

async function handleFieldworkConsume(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser) throw new Error("Requesting user not found.");
  if (!validId(data.requestId, 128)) throw new Error("Invalid fieldwork approval id.");
  const request = await consumeFieldworkRequest(data.requestId, {
    userId: originUserId,
    type: data.type
  });
  return request;
}

async function handleRumorResolution(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser || originUser.isGM) throw new Error("A player is required for rumor resolution.");
  if (!validId(data.messageId, 128)) throw new Error("A module-owned rumor field-check Chat message is required.");
  const message = game.messages.get(data.messageId);
  validateFieldCheckMessage(message, { originUserId, actorUuid: data.actorUuid ?? null, skillId: "inv", dc: 11 });
  if (game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL)) {
    if (!validId(data.approvalRequestId, 128)) throw new Error("A GM-approved rumor opportunity is required.");
    await consumeFieldworkRequest(data.approvalRequestId, { userId: originUserId, type: FIELDWORK_TYPES.RUMOR });
  }
  const total = Number(message.rolls?.[0]?.total);
  if (!Number.isFinite(total)) throw new Error("The rumor field-check total is invalid.");
  const success = total >= 11;
  await updateStatistics(originUserId, { checksAttempted: 1, checksSucceeded: success ? 1 : 0 });
  if (!success) return { success: false };

  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  const progressBefore = await getProgress(originUserId);
  let monsterId = progressBefore.huntCycle?.activeMonsterId;
  if (!monsterId || !monsterIds.includes(monsterId)) {
    monsterId = chooseQuarryMonsterId({
      rules,
      monsterIds,
      lastMonsterId: progressBefore.huntCycle?.lastCompletedMonsterId ?? null,
      excludedMonsterIds: progressBefore.huntCycle?.deferredMonsterIds ?? []
    });
  }
  if (!monsterId) throw new Error("No non-deferred quarry is available in the GM-configured hunt pool.");
  const candidates = (world.rumors ?? []).filter(rumor => (rumor.monsterIds ?? []).includes(monsterId));
  const useful = candidates.filter(rumor => rumor.truth !== "false");
  const rumor = weightedChoiceSocket(useful.length ? useful : candidates.length ? candidates : (world.rumors ?? []));
  if (!rumor) throw new Error("No rumor content is available.");
  let progress = await recordRumorSuccess(originUserId, monsterId, { detail: localizeText(rumor.text), setActiveQuarry: true });
  const record = progress.monsters?.[monsterId] ?? {};
  const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
  const opportunities = rollDisclosureOpportunities({ record, level, rules, monsterId, monsterIds });
  if (opportunities.automatic.length) progress = await unlockMonsterFields(originUserId, monsterId, opportunities.automatic, "rumor-reveal");
  const queued = [];
  for (const field of opportunities.approvals) {
    const request = await createFieldworkRequest({
      userId: originUserId,
      type: FIELDWORK_TYPES.DISCOVERY_REVEAL,
      monsterId,
      recordId: field,
      detail: field
    });
    queued.push(request.id);
  }
  Hooks.callAll(`${MODULE_ID}.rumorResolved`, { userId: originUserId, monsterId, rumorId: rumor.id, automatic: opportunities.automatic, approvals: opportunities.approvals });
  return {
    success: true,
    monsterId,
    rumorId: rumor.id,
    newQuarry: progressBefore.huntCycle?.activeMonsterId !== monsterId,
    automaticReveals: opportunities.automatic,
    approvalReveals: opportunities.approvals,
    queuedApprovalIds: queued
  };
}

async function handleTrackResolution(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser || originUser.isGM) throw new Error("A player is required for track resolution.");
  const world = getWorldData();
  const monster = (world.monsters ?? []).find(entry => entry.id === data.monsterId);
  const track = (world.tracks ?? []).find(entry => entry.id === data.trackId);
  if (!monster || !track) throw new Error("Unknown quarry or track type.");
  const progressBefore = await getProgress(originUserId);
  if (progressBefore.huntCycle?.activeMonsterId !== monster.id) throw new Error("Track searches must target the active quarry.");
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  const recordBefore = progressBefore.monsters?.[monster.id] ?? {};
  const level = knowledgeLevel(recordBefore.points ?? 0, world.knowledgeLevels ?? [], recordBefore.manualLevel);
  const status = fieldworkProgressStatus({ record: recordBefore, level, rules, monsterId: monster.id, monsterIds });
  if (!status.canSearchTracks) throw new Error(`At least ${status.trackMinRumors} successful rumors are required before searching for tracks.`);
  if (!validId(data.messageId, 128)) throw new Error("A module-owned track field-check Chat message is required.");
  const message = game.messages.get(data.messageId);
  validateFieldCheckMessage(message, { originUserId, actorUuid: data.actorUuid ?? null, skillId: "sur", dc: Number(track.baseDc) });
  if (game.settings.get(MODULE_ID, SETTINGS.REQUIRE_FIELDWORK_APPROVAL)) {
    if (!validId(data.approvalRequestId, 128)) throw new Error("A GM-approved track opportunity is required.");
    await consumeFieldworkRequest(data.approvalRequestId, { userId: originUserId, type: FIELDWORK_TYPES.TRACK });
  }
  const total = Number(message.rolls?.[0]?.total);
  if (!Number.isFinite(total)) throw new Error("The track field-check total is invalid.");
  const success = total >= Number(track.baseDc);
  await updateStatistics(originUserId, { checksAttempted: 1, checksSucceeded: success ? 1 : 0 });
  if (!success) return { success: false };
  const progress = await recordTrackSuccess(originUserId, monster.id, { points: game.settings.get(MODULE_ID, SETTINGS.AUTO_AWARD) ? 1 : 0, detail: localizeText(track.name) });
  const record = progress.monsters?.[monster.id] ?? {};
  const opportunity = rollFieldworkOpportunity({ kind: "sighting", record, rules, monsterId: monster.id, monsterIds });
  let sightingUnlocked = false;
  let queuedApprovalId = null;
  if (opportunity.success) {
    if (opportunity.gmApproval) {
      const request = await createFieldworkRequest({ userId: originUserId, type: FIELDWORK_TYPES.FIELDWORK_UNLOCK, monsterId: monster.id, recordId: "sighting", detail: "sighting" });
      queuedApprovalId = request.id;
    } else {
      await unlockFieldworkCapabilities(originUserId, monster.id, ["sighting"], "track-fieldwork-unlock");
      sightingUnlocked = true;
    }
  }
  Hooks.callAll(`${MODULE_ID}.trackResolved`, { userId: originUserId, monsterId: monster.id, trackId: track.id, sightingUnlocked, queuedApprovalId });
  return { success: true, sightingUnlocked, queuedApprovalId, unlockRolled: opportunity.eligible };
}

async function handleSightingEvaluation(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser || originUser.isGM) throw new Error("A player is required for sighting evaluation.");
  const world = getWorldData();
  const monster = (world.monsters ?? []).find(entry => entry.id === data.monsterId);
  if (!monster || !validId(data.recordId, 128)) throw new Error("Unknown quarry or sighting record.");
  const progress = await getProgress(originUserId);
  const record = progress.monsters?.[monster.id] ?? {};
  if (!(record.sightings ?? []).some(entry => entry.id === data.recordId)) throw new Error("The sighting record was not found.");
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
  const status = fieldworkProgressStatus({ record, level, rules, monsterId: monster.id, monsterIds });
  if (!status.canRecordSighting) throw new Error("Sighting recording has not been unlocked for this quarry.");
  const opportunity = rollFieldworkOpportunity({ kind: "difficulty", record, rules, monsterId: monster.id, monsterIds });
  if (!opportunity.success) return { revealed: false, rolled: opportunity.eligible };
  if (opportunity.gmApproval) {
    const request = await createFieldworkRequest({ userId: originUserId, type: FIELDWORK_TYPES.DISCOVERY_REVEAL, monsterId: monster.id, recordId: "difficulty", detail: "difficulty" });
    return { revealed: false, rolled: true, queuedApprovalId: request.id };
  }
  await unlockMonsterFields(originUserId, monster.id, ["difficulty"], "sighting-difficulty-reveal");
  return { revealed: true, rolled: true };
}

async function handleDeferQuarry(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser || originUser.isGM) throw new Error("A player is required to defer a quarry.");
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  if (!monsterIds.includes(data.monsterId)) throw new Error("Unknown quarry.");
  const rules = getHuntRules(monsterIds);
  await pauseSoloHuntsForQuarry(originUserId, data.monsterId);
  const progress = await deferActiveQuarry(originUserId, data.monsterId, { maxDeferred: rules.fieldwork.maxDeferredQuarries });
  Hooks.callAll(`${MODULE_ID}.quarryDeferred`, { userId: originUserId, monsterId: data.monsterId });
  return { activeMonsterId: progress.huntCycle.activeMonsterId, deferredMonsterIds: progress.huntCycle.deferredMonsterIds };
}

async function handleHuntResolutionRequest(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser) throw new Error("Requesting user not found.");
  if (!validId(data.huntId, 128) || !validId(data.outcome, 64)) throw new Error("Invalid hunt resolution request.");
  const result = await requestHuntResolution({ huntId: data.huntId, userId: originUserId, outcome: data.outcome });
  Hooks.callAll(`${MODULE_ID}.huntChanged`, { huntId: data.huntId, resolution: true });
  return { huntId: data.huntId, status: result.hunt?.resolution?.status ?? result.status ?? null, outcome: data.outcome };
}

async function handleHuntResolutionCheck(data, originUserId) {
  const originUser = game.users.get(originUserId);
  if (!originUser) throw new Error("Requesting user not found.");
  if (!validId(data.huntId, 128) || !validId(data.skillId, 32) || !validId(data.messageId, 128)) throw new Error("Invalid hunt resolution check.");
  const hunt = getHunts().find(entry => entry.id === data.huntId);
  if (!hunt) throw new Error("Hunt not found.");
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rule = resolutionRuleFor(getHuntRules(monsterIds), hunt.resolution?.requestedOutcome, monsterIds);
  if (rule.mode !== "check-gm" || !rule.skills.includes(data.skillId)) throw new Error("That skill is not permitted for this resolution.");
  let actor = null;
  if (data.actorUuid) {
    actor = await fromUuid(String(data.actorUuid)).catch(() => null);
    const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    if (!actor || actor.documentName !== "Actor" || !actor.testUserPermission(originUser, ownerLevel)) throw new Error("The selected hunter is not owned by the requesting user.");
  }
  const message = game.messages.get(data.messageId);
  validateAttemptMessage(message, { originUserId, actorUuid: actor?.uuid ?? null, skillId: data.skillId, dc: Number(rule.dc) });
  const total = Number(message.rolls?.[0]?.total);
  if (!Number.isFinite(total)) throw new Error("The resolution-check total is invalid.");
  const success = total >= Number(rule.dc);
  const result = await recordHuntResolutionCheck({
    huntId: data.huntId,
    userId: originUserId,
    skillId: data.skillId,
    total,
    dc: rule.dc,
    success,
    messageId: data.messageId
  });
  await updateStatistics(originUserId, { checksAttempted: 1, checksSucceeded: success ? 1 : 0 });
  Hooks.callAll(`${MODULE_ID}.huntChanged`, { huntId: data.huntId, resolution: true });
  return { huntId: data.huntId, success, total, dc: rule.dc, status: result.hunt.resolution.status };
}

function weightedChoiceSocket(items) {
  const source = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!source.length) return null;
  const total = source.reduce((sum, item) => sum + Math.max(0, Number(item.weight ?? 1)), 0);
  if (total <= 0) return source[Math.floor(Math.random() * source.length)];
  let cursor = Math.random() * total;
  for (const item of source) {
    cursor -= Math.max(0, Number(item.weight ?? 1));
    if (cursor <= 0) return item;
  }
  return source.at(-1);
}

function cleanupHandledRequests() {
  const cutoff = Date.now() - REPLAY_TTL_MS;
  for (const [key, entry] of handledRequests) if (entry.at < cutoff) handledRequests.delete(key);
}

function trimHandledRequests() {
  while (handledRequests.size > MAX_HANDLED_REQUESTS) handledRequests.delete(handledRequests.keys().next().value);
}

function validId(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9._:-]+$/.test(value);
}

function safeErrorMessage(error) {
  return String(error?.message ?? "Socket request failed.").slice(0, 1000);
}

export function resetSocketStateForTests() {
  socketRegistered = false;
  for (const waiter of pending.values()) clearTimeout(waiter.handle);
  pending.clear();
  handledRequests.clear();
}
