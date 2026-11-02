import { HUNT_STATUS } from "./constants.mjs";
import { clone, nowIso, randomId, boundedInteger } from "./utils.mjs";
import { getHunts, setHunts, appendAudit, recordHuntProgress, getProgress, getWorldData, knowledgeLevel } from "./state.mjs";
import { getHuntRules, minimumHuntKnowledgeLevel, resolutionRuleFor, isResolutionStage, isTerminalOutcome, PLAYER_RESOLUTION_OUTCOMES, fieldworkProgressStatus } from "./hunt-rules.mjs";

export function normalizeHunt(input = {}) {
  return {
    id: input.id ?? randomId(),
    title: String(input.title ?? "Untitled Hunt").slice(0, 200),
    monsterId: String(input.monsterId ?? ""),
    region: String(input.region ?? "").slice(0, 300),
    patron: String(input.patron ?? "").slice(0, 300),
    stakes: String(input.stakes ?? "").slice(0, 2000),
    status: Object.values(HUNT_STATUS).includes(input.status) ? input.status : HUNT_STATUS.DRAFT,
    visibility: input.visibility === "private" ? "private" : "participants",
    participantUserIds: Array.from(new Set(input.participantUserIds ?? [])).filter(Boolean),
    templateId: String(input.templateId ?? "classic-trail"),
    steps: Array.isArray(input.steps) ? clone(input.steps).map(normalizeStep) : [],
    currentStep: boundedInteger(input.currentStep, 0, Math.max(0, (input.steps?.length ?? 1) - 1), 0),
    complications: Array.isArray(input.complications) ? clone(input.complications).slice(-50) : [],
    contributions: Array.isArray(input.contributions) ? clone(input.contributions).slice(-500) : [],
    resolution: normalizeResolution(input.resolution),
    plannedOutcome: PLAYER_RESOLUTION_OUTCOMES.includes(input.plannedOutcome) ? input.plannedOutcome : null,
    outcome: input.outcome ?? null,
    notes: String(input.notes ?? "").slice(0, 10000),
    createdBy: input.createdBy ?? globalThis.game?.user?.id ?? null,
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: input.updatedAt ?? nowIso()
  };
}

function normalizeStep(step = {}, index = 0) {
  return {
    id: step.id ?? `step-${index + 1}`,
    name: step.name ?? `Step ${index + 1}`,
    kind: step.kind ?? "track",
    dc: boundedInteger(step.dc, 0, 40, 10),
    skills: Array.isArray(step.skills) ? step.skills : [],
    success: step.success ?? "",
    failure: step.failure ?? "",
    status: ["locked", "active", "completed", "failed", "skipped"].includes(step.status) ? step.status : (index === 0 ? "active" : "locked"),
    attempts: Array.isArray(step.attempts) ? clone(step.attempts).slice(-100) : []
  };
}

function normalizeResolution(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    status: ["awaiting-choice", "pending-check", "pending-gm", "decided"].includes(source.status) ? source.status : "awaiting-choice",
    requestedOutcome: source.requestedOutcome ? String(source.requestedOutcome) : null,
    requestedBy: source.requestedBy ? String(source.requestedBy) : null,
    requestedAt: source.requestedAt ?? null,
    check: source.check && typeof source.check === "object" ? clone(source.check) : null,
    decidedBy: source.decidedBy ? String(source.decidedBy) : null,
    decidedAt: source.decidedAt ?? null
  };
}

export function createHuntFromTemplate({ title, monsterId, region, patron, stakes, participantUserIds, template, plannedOutcome = null }) {
  const steps = clone(template?.steps ?? []).map((step, index) => normalizeStep({ ...step, status: index === 0 ? "active" : "locked" }, index));
  return normalizeHunt({
    title,
    monsterId,
    region,
    patron,
    stakes,
    participantUserIds,
    templateId: template?.id ?? "classic-trail",
    plannedOutcome,
    steps,
    status: HUNT_STATUS.ACTIVE
  });
}

export function visibleHuntsFor(user = globalThis.game?.user) {
  const hunts = getHunts().map(normalizeHunt);
  if (user.isGM) return hunts;
  return hunts.filter(hunt => hunt.visibility !== "private" && hunt.participantUserIds.includes(user.id));
}

export async function saveHunt(hunt) {
  if (!game.user.isGM) throw new Error("Only a GM may save hunts.");
  const hunts = getHunts().map(normalizeHunt);
  const normalized = normalizeHunt(hunt);
  normalized.updatedAt = nowIso();
  const index = hunts.findIndex(entry => entry.id === normalized.id);
  if (normalized.status === HUNT_STATUS.ACTIVE) {
    await assertParticipantsMeetHuntRequirement(normalized);
    const previous = index >= 0 ? hunts[index] : null;
    if (!previous || previous.status !== HUNT_STATUS.ACTIVE) await assertParticipantsHuntCapacity(normalized, hunts);
  }
  if (index >= 0) hunts[index] = normalized;
  else hunts.push(normalized);
  await setHunts(hunts);
  await Promise.all([
    syncParticipantProgress(normalized),
    appendAudit({ type: index >= 0 ? "hunt-update" : "hunt-create", huntId: normalized.id, monsterId: normalized.monsterId })
  ]);
  return normalized;
}

export async function deleteHunt(huntId) {
  if (!game.user.isGM) throw new Error("Only a GM may delete hunts.");
  const hunts = getHunts().filter(hunt => hunt.id !== huntId);
  await setHunts(hunts);
  await appendAudit({ type: "hunt-delete", huntId });
}

export async function recordAttempt({ huntId, stepId, userId, actorName, skillId, total, dc, success, messageId = null }) {
  if (!game.user.isGM) throw new Error("Only a GM may resolve shared hunt attempts.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  const stepIndex = hunt.steps.findIndex(step => step.id === stepId);
  const step = hunt.steps[stepIndex];
  if (!step) throw new Error("Hunt step not found.");
  if (messageId && hunt.contributions.some(entry => entry.messageId === messageId)) {
    throw new Error("This field-check Chat message has already been applied to the hunt.");
  }
  if (hunt.status !== HUNT_STATUS.ACTIVE) throw new Error("This hunt is not active.");
  await assertUserMeetsHuntRequirement(hunt, userId);
  await assertUserQuarryAvailable(hunt, userId);
  if (step.status !== "active") throw new Error("This step is not active.");
  if (step.kind === "conclusion") throw new Error("The conclusion is resolved by choosing an outcome, not a normal hunt check.");
  const attempt = { id: randomId(), userId, actorName, skillId, total, dc, success: Boolean(success), messageId, at: nowIso() };
  step.attempts.push(attempt);
  hunt.contributions.push({ ...attempt, stepId });
  if (success) {
    step.status = "completed";
    if (stepIndex + 1 < hunt.steps.length) {
      hunt.steps[stepIndex + 1].status = "active";
      hunt.currentStep = stepIndex + 1;
    } else {
      hunt.resolution = normalizeResolution({ status: "awaiting-choice" });
    }
  }
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await Promise.all([
    syncParticipantProgress(hunt),
    appendAudit({ type: "hunt-attempt", huntId, stepId, userId, success: Boolean(success), total, dc })
  ]);
  return { hunt, step, attempt };
}

export async function completeStep(huntId, stepId) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may advance hunt steps directly.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  const stepIndex = hunt.steps.findIndex(step => step.id === stepId);
  const step = hunt.steps[stepIndex];
  if (!step) throw new Error("Hunt step not found.");
  if (step.status !== "active") throw new Error("This step is not active.");
  if (step.kind === "conclusion") throw new Error("Resolve the hunt through the outcome workflow.");
  step.status = "completed";
  if (stepIndex + 1 < hunt.steps.length) {
    hunt.steps[stepIndex + 1].status = "active";
    hunt.currentStep = stepIndex + 1;
  } else {
    hunt.resolution = normalizeResolution({ status: "awaiting-choice" });
  }
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await Promise.all([
    syncParticipantProgress(hunt),
    appendAudit({ type: "hunt-step-advance", huntId, stepId })
  ]);
  return { hunt, step };
}

export function reversibleStepId(huntInput) {
  const hunt = normalizeHunt(huntInput);
  if (hunt.status !== HUNT_STATUS.ACTIVE) return null;
  const activeIndex = hunt.steps.findIndex(step => step.status === "active");
  if (activeIndex <= 0) return null;
  const candidate = hunt.steps[activeIndex - 1];
  if (!candidate || candidate.status !== "completed" || candidate.kind === "conclusion") return null;
  const downstream = hunt.steps.slice(activeIndex);
  const activeStep = hunt.steps[activeIndex];
  if ((activeStep?.attempts?.length ?? 0) > 0) return null;
  if (downstream.slice(1).some(step => step.status !== "locked" || (step.attempts?.length ?? 0) > 0)) return null;
  if (activeStep?.kind === "conclusion" && !["awaiting-choice", null, undefined].includes(hunt.resolution?.status)) return null;
  return candidate.id;
}

export async function revertStepAdvance(huntId, stepId) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may reverse hunt-step advancement.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  const reversibleId = reversibleStepId(hunt);
  if (!reversibleId || reversibleId !== stepId) throw new Error("Only the most recently advanced untouched hunt step can be reversed.");
  const stepIndex = hunt.steps.findIndex(step => step.id === stepId);
  const step = hunt.steps[stepIndex];
  const previousActiveStepId = hunt.steps[stepIndex + 1]?.id ?? null;
  step.status = "active";
  for (let index = stepIndex + 1; index < hunt.steps.length; index += 1) hunt.steps[index].status = "locked";
  hunt.currentStep = stepIndex;
  hunt.resolution = normalizeResolution({ status: "awaiting-choice" });
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await Promise.all([
    syncParticipantProgress(hunt),
    appendAudit({ type: "hunt-step-revert", huntId, stepId, previousActiveStepId })
  ]);
  return { hunt, step };
}

export async function addComplication(huntId, text, source = "manual") {
  if (!game.user.isGM) throw new Error("Only a GM may add complications.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  hunt.complications.push({ id: randomId(), text: String(text).slice(0, 2000), source, at: nowIso() });
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await appendAudit({ type: "hunt-complication", huntId, source });
  return hunt;
}

export async function resolveHunt(huntId, outcome, notes = "") {
  if (!game.user.isGM) throw new Error("Only a GM may resolve hunts.");
  return decideHuntResolution(huntId, outcome, notes);
}

export async function requestHuntResolution({ huntId, userId, outcome }) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may mutate shared hunt resolution.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  if (!hunt.participantUserIds.includes(userId)) throw new Error("The requesting user is not assigned to this hunt.");
  if (!PLAYER_RESOLUTION_OUTCOMES.includes(outcome)) throw new Error("Unsupported desired hunt outcome.");
  if (!isResolutionStage(hunt)) throw new Error("This hunt has not reached its resolution stage.");
  await assertUserMeetsHuntRequirement(hunt, userId);
  await assertUserQuarryAvailable(hunt, userId);
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rule = resolutionRuleFor(getHuntRules(monsterIds), outcome, monsterIds);
  hunt.resolution = normalizeResolution({
    status: rule.mode === "check-gm" ? "pending-check" : rule.mode === "auto" ? "decided" : "pending-gm",
    requestedOutcome: outcome,
    requestedBy: userId,
    requestedAt: nowIso()
  });
  if (rule.mode === "auto") return finalizeResolution(hunts, hunt, outcome, "", userId);
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await Promise.all([
    syncParticipantProgress(hunt),
    appendAudit({ type: "hunt-resolution-request", huntId, userId, outcome, mode: rule.mode })
  ]);
  return { hunt, rule };
}

export async function recordHuntResolutionCheck({ huntId, userId, skillId, total, dc, success, messageId = null }) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may record shared hunt resolution checks.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  if (hunt.resolution.status !== "pending-check" || hunt.resolution.requestedBy !== userId) throw new Error("No matching resolution check is pending.");
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rule = resolutionRuleFor(getHuntRules(monsterIds), hunt.resolution.requestedOutcome, monsterIds);
  if (rule.mode !== "check-gm" || !rule.skills.includes(skillId)) throw new Error("That skill is not permitted for this resolution.");
  hunt.resolution.check = { userId, skillId, total: Number(total), dc: Number(dc), success: Boolean(success), messageId, at: nowIso() };
  hunt.resolution.status = "pending-gm";
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await appendAudit({ type: "hunt-resolution-check", huntId, userId, skillId, total, dc, success: Boolean(success) });
  return { hunt, rule };
}

export async function rejectHuntResolution(huntId) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may reject hunt resolution requests.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  hunt.resolution = normalizeResolution({ status: "awaiting-choice" });
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await appendAudit({ type: "hunt-resolution-reject", huntId });
  return hunt;
}

export async function decideHuntResolution(huntId, actualOutcome, notes = "") {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may decide hunt outcomes.");
  const hunts = getHunts().map(normalizeHunt);
  const hunt = hunts.find(entry => entry.id === huntId);
  if (!hunt) throw new Error("Hunt not found.");
  return finalizeResolution(hunts, hunt, actualOutcome, notes, globalThis.game?.user?.id ?? null);
}

async function finalizeResolution(hunts, hunt, actualOutcome, notes, decidedBy) {
  if (!actualOutcome) throw new Error("A final hunt outcome is required.");
  const conclusion = hunt.steps.find(step => step.kind === "conclusion" && step.status === "active");
  if (conclusion) conclusion.status = "completed";
  hunt.status = isTerminalOutcome(actualOutcome) ? HUNT_STATUS.RESOLVED : HUNT_STATUS.FAILED;
  hunt.outcome = actualOutcome;
  hunt.notes = String(notes ?? hunt.notes ?? "").slice(0, 10000);
  hunt.resolution = normalizeResolution({ ...hunt.resolution, status: "decided", decidedBy, decidedAt: nowIso() });
  hunt.updatedAt = nowIso();
  await setHunts(hunts);
  await Promise.all([
    syncParticipantProgress(hunt),
    appendAudit({ type: "hunt-resolve", huntId: hunt.id, outcome: actualOutcome, requestedOutcome: hunt.resolution.requestedOutcome })
  ]);
  return hunt;
}

export async function huntEligibilityForUser(hunt, userId) {
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const rules = getHuntRules(monsterIds);
  const requiredLevel = minimumHuntKnowledgeLevel(rules, hunt.monsterId, monsterIds);
  const progress = await getProgress(userId);
  const record = progress.monsters?.[hunt.monsterId] ?? { points: 0, manualLevel: null };
  const level = knowledgeLevel(record.points ?? 0, world.knowledgeLevels ?? [], record.manualLevel);
  const fieldwork = fieldworkProgressStatus({ record, level, rules, monsterId: hunt.monsterId, monsterIds });
  return {
    eligible: level >= requiredLevel && (!fieldwork.requiresDifficulty || fieldwork.difficultyKnown),
    level,
    requiredLevel,
    difficultyKnown: fieldwork.difficultyKnown,
    requiresDifficulty: fieldwork.requiresDifficulty
  };
}

export function activeHuntCountForUser(userId, hunts = getHunts(), { excludeHuntId = null } = {}) {
  return (hunts ?? []).map(normalizeHunt).filter(hunt =>
    hunt.id !== excludeHuntId &&
    hunt.status === HUNT_STATUS.ACTIVE &&
    hunt.participantUserIds.includes(userId)
  ).length;
}

export async function pauseSoloHuntsForQuarry(userId, monsterId) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may pause hunts.");
  const hunts = getHunts().map(normalizeHunt);
  const changed = [];
  for (const hunt of hunts) {
    if (hunt.status !== HUNT_STATUS.ACTIVE || hunt.monsterId !== monsterId || !hunt.participantUserIds.includes(userId)) continue;
    if (hunt.participantUserIds.length > 1) throw new Error("A shared active Hunt cannot be deferred automatically. Ask the GM to pause it first.");
    hunt.status = HUNT_STATUS.PAUSED;
    hunt.updatedAt = nowIso();
    changed.push(hunt.id);
  }
  if (changed.length) {
    await setHunts(hunts);
    await Promise.all(changed.map(huntId => appendAudit({ type: "hunt-pause-defer", huntId, userId, monsterId })));
  }
  return changed;
}

export async function resumeSoloHuntForQuarry(userId, monsterId) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM may resume hunts.");
  const hunts = getHunts().map(normalizeHunt);
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const maxActive = getHuntRules(monsterIds).fieldwork.maxActiveHunts;
  if (activeHuntCountForUser(userId, hunts) >= maxActive) return [];
  const candidate = hunts.find(hunt => hunt.status === HUNT_STATUS.PAUSED && hunt.monsterId === monsterId && hunt.participantUserIds.length === 1 && hunt.participantUserIds[0] === userId);
  if (!candidate) return [];
  candidate.status = HUNT_STATUS.ACTIVE;
  candidate.updatedAt = nowIso();
  await setHunts(hunts);
  await appendAudit({ type: "hunt-resume-reactivation", huntId: candidate.id, userId, monsterId });
  return [candidate.id];
}

async function assertUserMeetsHuntRequirement(hunt, userId) {
  const result = await huntEligibilityForUser(hunt, userId);
  if (result.level < result.requiredLevel) throw new Error(`Hunter knowledge level ${result.level} is below the required level ${result.requiredLevel}.`);
  // Difficulty is a start-of-Hunt requirement. Once a Hunt is active, later field checks
  // and final resolution must not be retroactively blocked if the campaign predates
  // this rule or the GM deliberately changed rules mid-Hunt.
  return result;
}

async function assertUserQuarryAvailable(hunt, userId) {
  const progress = await getProgress(userId);
  if ((progress.huntCycle?.deferredMonsterIds ?? []).includes(hunt.monsterId)) throw new Error("This quarry is currently deferred for this hunter.");
  const active = progress.huntCycle?.activeMonsterId;
  if (active && active !== hunt.monsterId) throw new Error("Another quarry is currently active for this hunter.");
}

async function assertParticipantsHuntCapacity(hunt, hunts) {
  const world = getWorldData();
  const monsterIds = (world.monsters ?? []).map(entry => entry.id);
  const maxActive = getHuntRules(monsterIds).fieldwork.maxActiveHunts;
  const blocked = (hunt.participantUserIds ?? []).filter(userId => activeHuntCountForUser(userId, hunts, { excludeHuntId: hunt.id }) >= maxActive);
  if (blocked.length) {
    const names = blocked.map(userId => globalThis.game?.users?.get?.(userId)?.name ?? userId).join(", ");
    throw new Error(`Active Hunt limit (${maxActive}) reached for: ${names}.`);
  }
}

async function assertParticipantsMeetHuntRequirement(hunt) {
  const results = await Promise.all((hunt.participantUserIds ?? []).map(async userId => ({ userId, ...(await huntEligibilityForUser(hunt, userId)) })));
  const blocked = results.filter(entry => !entry.eligible);
  if (blocked.length) {
    const names = blocked.map(entry => globalThis.game?.users?.get?.(entry.userId)?.name ?? entry.userId).join(", ");
    throw new Error(`The hunt cannot start yet. Required quarry knowledge is not met by: ${names}.`);
  }
  return results;
}



async function syncParticipantProgress(hunt) {
  const userIds = [...new Set(hunt.participantUserIds ?? [])];
  const settled = await Promise.allSettled(userIds.map(userId => recordHuntProgress(userId, hunt)));
  const failures = settled.filter(result => result.status === "rejected").map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, `Failed to synchronize ${failures.length} hunt participant(s).`);
}
