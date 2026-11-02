import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { clone, nowIso, randomId } from "./utils.mjs";
import {
  getHunts,
  getProgress,
  getWorldData,
  awardKnowledge,
  unlockMonsterFields,
  unlockFieldworkCapabilities,
  activateDeferredQuarry
} from "./state.mjs";
import { getHuntRules, fieldworkProgressStatus, PLAYER_RESOLUTION_OUTCOMES } from "./hunt-rules.mjs";
import { activeHuntCountForUser, createHuntFromTemplate, resumeSoloHuntForQuarry, saveHunt } from "./hunts.mjs";
import { knowledgeLevel } from "./state.mjs";

export const FIELDWORK_TYPES = Object.freeze({
  RUMOR: "rumor",
  TRACK: "track",
  HUNT_ATTEMPT: "hunt-attempt",
  SIGHTING_CREDIT: "sighting-credit",
  TROPHY_CREDIT: "trophy-credit",
  DISCOVERY_REVEAL: "discovery-reveal",
  FIELDWORK_UNLOCK: "fieldwork-unlock",
  QUARRY_REACTIVATION: "quarry-reactivation",
  HUNT_PROPOSAL: "hunt-proposal"
});

const ACTIVE_STATUSES = new Set(["pending", "approved"]);
const VALID_TYPES = new Set(Object.values(FIELDWORK_TYPES));
let requestQueue = Promise.resolve();

export function getFieldworkRequests(user = globalThis.game?.user) {
  const all = normalizeRequests(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.FIELDWORK_REQUESTS));
  if (user?.isGM) return all;
  return all.filter(entry => entry.userId === user?.id);
}

export function getFieldworkRequest(requestId, user = globalThis.game?.user) {
  return getFieldworkRequests(user).find(entry => entry.id === requestId) ?? null;
}

export function findActiveFieldworkRequest({ userId, type, monsterId = null, huntId = null, stepId = null, recordId = null }) {
  return normalizeRequests(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.FIELDWORK_REQUESTS))
    .find(entry =>
      entry.userId === userId &&
      entry.type === type &&
      (monsterId == null || entry.monsterId === monsterId) &&
      (huntId == null || entry.huntId === huntId) &&
      (stepId == null || entry.stepId === stepId) &&
      (recordId == null || entry.recordId === recordId) &&
      ACTIVE_STATUSES.has(entry.status)
    ) ?? null;
}

export async function createFieldworkRequest(input = {}) {
  requireGm();
  return mutateRequests(async requests => {
    const request = await validateAndNormalizeRequest(input);
    const evidenceCredit = [FIELDWORK_TYPES.SIGHTING_CREDIT, FIELDWORK_TYPES.TROPHY_CREDIT].includes(request.type);
    const duplicate = requests.find(entry =>
      entry.userId === request.userId &&
      entry.type === request.type &&
      entry.monsterId === request.monsterId &&
      entry.huntId === request.huntId &&
      entry.stepId === request.stepId &&
      (evidenceCredit || entry.recordId === request.recordId) &&
      ACTIVE_STATUSES.has(entry.status)
    );
    if (duplicate) return { requests, result: duplicate, created: false };

    const record = {
      ...request,
      id: randomId(),
      status: "pending",
      createdAt: nowIso(),
      resolvedAt: null,
      resolvedBy: null,
      consumedAt: null
    };
    requests.push(record);
    return { requests: requests.slice(-500), result: record, created: true };
  });
}

export async function resolveFieldworkRequest(requestId, decision) {
  requireGm();
  if (!["approve", "deny", "revoke"].includes(decision)) throw new Error("Invalid fieldwork decision.");
  return mutateRequests(async requests => {
    const request = requests.find(entry => entry.id === requestId);
    if (!request) throw new Error("Fieldwork request not found.");
    if (decision === "approve") {
      if (request.status !== "pending") throw new Error("Only pending requests may be approved.");
      if ([FIELDWORK_TYPES.SIGHTING_CREDIT, FIELDWORK_TYPES.TROPHY_CREDIT].includes(request.type)) {
        if (globalThis.game?.settings?.get(MODULE_ID, SETTINGS.AUTO_AWARD)) {
          const source = `${request.type}:${request.id}`;
          const progress = await getProgress(request.userId);
          const alreadyAwarded = (progress.monsters?.[request.monsterId]?.discoveries ?? []).some(entry => entry.source === source);
          if (!alreadyAwarded) await awardKnowledge(request.userId, request.monsterId, 1, source, request.detail);
        }
        consume(request);
      } else if (request.type === FIELDWORK_TYPES.DISCOVERY_REVEAL) {
        if (!request.monsterId || !request.recordId) throw new Error("Discovery reveal is missing its quarry or field.");
        await unlockMonsterFields(request.userId, request.monsterId, [request.recordId], `gm-reveal:${request.id}`);
        consume(request);
      } else if (request.type === FIELDWORK_TYPES.FIELDWORK_UNLOCK) {
        if (!request.monsterId || !request.recordId) throw new Error("Fieldwork unlock is missing its quarry or capability.");
        await unlockFieldworkCapabilities(request.userId, request.monsterId, [request.recordId], `gm-fieldwork-unlock:${request.id}`);
        consume(request);
      } else if (request.type === FIELDWORK_TYPES.QUARRY_REACTIVATION) {
        const rules = currentRules();
        await activateDeferredQuarry(request.userId, request.monsterId, { maxDeferred: rules.fieldwork.maxDeferredQuarries });
        await resumeSoloHuntForQuarry(request.userId, request.monsterId);
        consume(request);
      } else if (request.type === FIELDWORK_TYPES.HUNT_PROPOSAL) {
        const hunt = await createApprovedHunt(request);
        request.huntId = hunt.id;
        consume(request);
      } else request.status = "approved";
    } else {
      if (!ACTIVE_STATUSES.has(request.status)) throw new Error("This request is already resolved.");
      request.status = decision === "revoke" ? "revoked" : "denied";
    }
    request.resolvedAt = nowIso();
    request.resolvedBy = globalThis.game?.user?.id ?? null;
    return { requests, result: request };
  });
}

export async function consumeFieldworkRequest(requestId, { userId, type, huntId = null, stepId = null } = {}) {
  requireGm();
  return mutateRequests(async requests => {
    const request = requests.find(entry => entry.id === requestId);
    if (!request) throw new Error("Fieldwork approval not found.");
    if (request.status !== "approved") throw new Error("This fieldwork approval is not available.");
    if (request.userId !== userId) throw new Error("This fieldwork approval belongs to another user.");
    if (request.type !== type) throw new Error("Fieldwork approval type mismatch.");
    if (huntId != null && request.huntId !== huntId) throw new Error("Fieldwork approval hunt mismatch.");
    if (stepId != null && request.stepId !== stepId) throw new Error("Fieldwork approval step mismatch.");
    consume(request);
    return { requests, result: request };
  });
}

export function fieldworkRequestSummary(userId) {
  const requests = normalizeRequests(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.FIELDWORK_REQUESTS))
    .filter(entry => entry.userId === userId);
  return {
    pending: requests.filter(entry => entry.status === "pending"),
    approved: requests.filter(entry => entry.status === "approved"),
    recent: requests.slice(-20).reverse()
  };
}

async function validateAndNormalizeRequest(input) {
  const userId = String(input.userId ?? "");
  const type = String(input.type ?? "");
  const monsterId = input.monsterId ? String(input.monsterId) : null;
  const huntId = input.huntId ? String(input.huntId) : null;
  const stepId = input.stepId ? String(input.stepId) : null;
  const recordId = input.recordId ? String(input.recordId) : null;
  const detail = String(input.detail ?? "").slice(0, 1000);
  const payload = sanitizePayload(type, input.payload);

  if (!globalThis.game?.users?.get?.(userId)) throw new Error("Requesting user not found.");
  if (!VALID_TYPES.has(type)) throw new Error("Unknown fieldwork request type.");

  const world = getWorldData();
  if (monsterId && !(world.monsters ?? []).some(monster => monster.id === monsterId)) throw new Error("Unknown quarry.");

  if (huntId) {
    const hunt = getHunts().find(entry => entry.id === huntId);
    if (!hunt) throw new Error("Hunt not found.");
    if (!globalThis.game?.users?.get?.(userId)?.isGM && !hunt.participantUserIds?.includes(userId)) {
      throw new Error("The requesting user is not assigned to this hunt.");
    }
    if (monsterId && hunt.monsterId && hunt.monsterId !== monsterId) {
      throw new Error("The requested quarry does not match the assigned hunt.");
    }
    if (stepId && !(hunt.steps ?? []).some(step => step.id === stepId && step.status === "active")) {
      throw new Error("The requested hunt step is not active.");
    }
  }

  if (type === FIELDWORK_TYPES.TRACK && !monsterId && !huntId) throw new Error("Track searches require a known quarry or assigned hunt.");
  if (type === FIELDWORK_TYPES.HUNT_ATTEMPT && (!huntId || !stepId)) throw new Error("Hunt attempts require an active hunt step.");
  if ([FIELDWORK_TYPES.SIGHTING_CREDIT, FIELDWORK_TYPES.TROPHY_CREDIT].includes(type) && (!monsterId || !recordId)) {
    throw new Error("Evidence-credit requests require a quarry and record id.");
  }
  if ([FIELDWORK_TYPES.DISCOVERY_REVEAL, FIELDWORK_TYPES.FIELDWORK_UNLOCK].includes(type) && (!monsterId || !recordId)) {
    throw new Error("Unlock requests require a quarry and field/capability id.");
  }

  if (type === FIELDWORK_TYPES.TRACK && monsterId && !huntId) {
    const { status } = await playerFieldworkState(userId, monsterId, world);
    if (!status.canSearchTracks) throw new Error(`At least ${status.trackMinRumors} successful rumors are required before searching for tracks.`);
  }

  if (type === FIELDWORK_TYPES.QUARRY_REACTIVATION) {
    const progress = await getProgress(userId);
    if (!monsterId || !(progress.huntCycle?.deferredMonsterIds ?? []).includes(monsterId)) throw new Error("Only a deferred quarry can be reactivated.");
  }

  if (type === FIELDWORK_TYPES.HUNT_PROPOSAL) {
    if (!monsterId || !payload?.title) throw new Error("A Hunt proposal requires a quarry and title.");
    const progress = await getProgress(userId);
    if (progress.huntCycle?.activeMonsterId !== monsterId) throw new Error("Only the currently active quarry can be proposed for a Hunt.");
    const { status, rules } = await playerFieldworkState(userId, monsterId, world);
    if (!status.canStartHunt) throw new Error("The configured fieldwork and knowledge requirements for starting this Hunt are not yet met.");
    if (activeHuntCountForUser(userId) >= rules.fieldwork.maxActiveHunts) throw new Error("The active Hunt limit has been reached.");
  }

  return { userId, type, monsterId, huntId, stepId, recordId, detail, payload };
}

async function playerFieldworkState(userId, monsterId, world = getWorldData()) {
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  const progress = await getProgress(userId);
  const record = progress.monsters?.[monsterId];
  if (!record) throw new Error("The quarry is not yet present in this user's Bestiary.");
  const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
  return { progress, rules, status: fieldworkProgressStatus({ record, level, rules, monsterId, monsterIds }) };
}

async function createApprovedHunt(request) {
  const world = getWorldData();
  const rules = currentRules(world);
  if (activeHuntCountForUser(request.userId) >= rules.fieldwork.maxActiveHunts) throw new Error("The active Hunt limit was reached before this proposal could be approved.");
  const progress = await getProgress(request.userId);
  if (progress.huntCycle?.activeMonsterId !== request.monsterId) throw new Error("The proposed quarry is no longer active.");
  const template = (world.trailTemplates ?? []).find(entry => entry.id === request.payload?.templateId) ?? world.trailTemplates?.[0];
  if (!template) throw new Error("No Hunt trail template is available.");
  const hunt = createHuntFromTemplate({
    title: request.payload.title,
    monsterId: request.monsterId,
    region: request.payload.region,
    patron: request.payload.patron,
    stakes: request.payload.stakes,
    participantUserIds: [request.userId],
    template,
    plannedOutcome: request.payload.plannedOutcome
  });
  hunt.visibility = "participants";
  hunt.notes = String(request.payload.playerNotes ?? "").slice(0, 10000);
  return saveHunt(hunt);
}

function sanitizePayload(type, payload) {
  if (type !== FIELDWORK_TYPES.HUNT_PROPOSAL) return null;
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    title: String(source.title ?? "").trim().slice(0, 200),
    region: String(source.region ?? "").trim().slice(0, 300),
    patron: String(source.patron ?? "").trim().slice(0, 300),
    stakes: String(source.stakes ?? "").trim().slice(0, 2000),
    templateId: String(source.templateId ?? "").slice(0, 128),
    plannedOutcome: PLAYER_RESOLUTION_OUTCOMES.includes(source.plannedOutcome) ? source.plannedOutcome : null,
    playerNotes: String(source.playerNotes ?? "").trim().slice(0, 10000)
  };
}

function normalizeRequests(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)).map(entry => ({
    id: String(entry.id ?? ""),
    userId: String(entry.userId ?? ""),
    type: String(entry.type ?? ""),
    monsterId: entry.monsterId ? String(entry.monsterId) : null,
    huntId: entry.huntId ? String(entry.huntId) : null,
    stepId: entry.stepId ? String(entry.stepId) : null,
    recordId: entry.recordId ? String(entry.recordId) : null,
    detail: String(entry.detail ?? "").slice(0, 1000),
    payload: sanitizePayload(String(entry.type ?? ""), entry.payload),
    status: ["pending", "approved", "denied", "revoked", "consumed"].includes(entry.status) ? entry.status : "pending",
    createdAt: entry.createdAt ?? null,
    resolvedAt: entry.resolvedAt ?? null,
    resolvedBy: entry.resolvedBy ?? null,
    consumedAt: entry.consumedAt ?? null
  }));
}

function currentRules(world = getWorldData()) {
  return getHuntRules((world.monsters ?? []).map(entry => entry.id));
}

function consume(request) {
  request.status = "consumed";
  request.consumedAt = nowIso();
}

function mutateRequests(mutator) {
  const current = requestQueue.catch(() => undefined).then(async () => {
    const requests = normalizeRequests(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.FIELDWORK_REQUESTS));
    const outcome = await mutator(requests);
    const nextRequests = clone(outcome.requests);
    await globalThis.game.settings.set(MODULE_ID, SETTINGS.FIELDWORK_REQUESTS, nextRequests);
    globalThis.Hooks?.callAll?.(`${MODULE_ID}.fieldworkChanged`, nextRequests);
    return clone(outcome.result);
  });
  requestQueue = current;
  return current;
}

function requireGm() {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may mutate fieldwork approvals.");
}

export function resetFieldworkStateForTests() {
  requestQueue = Promise.resolve();
}
