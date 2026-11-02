import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { formatDate, localizeText } from "./utils.mjs";

const CATEGORY_ORDER = Object.freeze({ hunt: 0, fieldwork: 1, knowledge: 2, evidence: 3, library: 4, notes: 5, system: 6 });

export function buildPlayerAuditTimeline({ userId, progress, world, hunts = [], fieldworkRequests = [], auditEntries = [] } = {}) {
  const monsterById = new Map((world?.monsters ?? []).filter(Boolean).map(entry => [entry.id, entry]));
  const bookById = new Map((world?.books ?? []).filter(Boolean).map(entry => [entry.id, entry]));
  const huntById = new Map((hunts ?? []).filter(Boolean).map(entry => [entry.id, entry]));
  const events = [];

  const push = event => {
    if (!event?.at) return;
    events.push({
      id: String(event.id ?? `${event.type ?? "event"}-${event.at}-${events.length}`),
      type: String(event.type ?? "event"),
      category: String(event.category ?? "system"),
      at: event.at,
      atDisplay: formatDate(event.at),
      titleKey: event.titleKey ?? "HB.Audit.Event.Generic",
      detail: String(event.detail ?? "").slice(0, 1200),
      monsterId: event.monsterId ?? null,
      monsterName: event.monsterId ? localizeText(monsterById.get(event.monsterId)?.name) || String(event.monsterId) : "",
      huntId: event.huntId ?? null,
      huntTitle: event.huntId ? huntById.get(event.huntId)?.title ?? String(event.huntId) : "",
      points: Number.isFinite(Number(event.points)) ? Number(event.points) : null,
      statusKey: event.status ? `HB.Approvals.Status.${event.status}` : null,
      source: event.source ? String(event.source) : "",
      searchText: ""
    });
  };

  for (const entry of progress?.fieldLog ?? []) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "knowledge") {
      const source = String(entry.source ?? "");
      push({
        id: entry.id,
        type: source === "rumor" ? "rumor" : source === "track" ? "track" : "knowledge",
        category: "knowledge",
        at: entry.at,
        titleKey: source === "rumor" ? "HB.Audit.Event.Rumor" : source === "track" ? "HB.Audit.Event.Track" : "HB.Audit.Event.Knowledge",
        detail: entry.detail,
        monsterId: entry.monsterId,
        points: entry.points,
        source
      });
      continue;
    }
    const titleByType = {
      note: "HB.Audit.Event.Note",
      sighting: "HB.Audit.Event.Sighting",
      trophy: "HB.Audit.Event.Trophy",
      book: "HB.Audit.Event.Book"
    };
    const categoryByType = { note: "notes", sighting: "evidence", trophy: "evidence", book: "library" };
    const bookName = entry.bookId ? localizeText(bookById.get(entry.bookId)?.name) : "";
    push({
      id: entry.id,
      type: entry.type,
      category: categoryByType[entry.type] ?? "system",
      at: entry.at,
      titleKey: titleByType[entry.type] ?? "HB.Audit.Event.Generic",
      detail: entry.detail || bookName,
      monsterId: entry.monsterId
    });
  }

  for (const [monsterId, record] of Object.entries(progress?.monsters ?? {})) {
    for (const discovery of record?.discoveries ?? []) {
      if (!discovery?.field) continue;
      push({
        id: `reveal-${discovery.id ?? `${monsterId}-${discovery.field}-${discovery.at}`}`,
        type: "reveal",
        category: "knowledge",
        at: discovery.at,
        titleKey: "HB.Audit.Event.Reveal",
        detail: globalThis.game?.i18n?.localize?.(`HB.HuntRules.Field.${discovery.field}`) ?? discovery.field,
        monsterId,
        source: discovery.source
      });
    }
    for (const huntRecord of record?.hunts ?? []) {
      if (huntRecord?.joinedAt) {
        push({
          id: `hunt-join-${huntRecord.id}-${huntRecord.joinedAt}`,
          type: "hunt-joined",
          category: "hunt",
          at: huntRecord.joinedAt,
          titleKey: "HB.Audit.Event.HuntJoined",
          detail: huntRecord.title,
          monsterId,
          huntId: huntRecord.id
        });
      }
      if (huntRecord?.resolvedAt) {
        push({
          id: `hunt-resolved-${huntRecord.id}-${huntRecord.resolvedAt}`,
          type: "hunt-resolved",
          category: "hunt",
          at: huntRecord.resolvedAt,
          titleKey: "HB.Audit.Event.HuntResolved",
          detail: huntRecord.outcome ?? huntRecord.status ?? "",
          monsterId,
          huntId: huntRecord.id
        });
      }
    }
  }

  for (const request of fieldworkRequests ?? []) {
    if (!request || request.userId !== userId) continue;
    push({
      id: `request-${request.id}-${request.createdAt}`,
      type: `request-${request.type}`,
      category: "fieldwork",
      at: request.createdAt,
      titleKey: "HB.Audit.Event.FieldworkRequested",
      detail: request.detail || globalThis.game?.i18n?.localize?.(`HB.Approvals.Type.${request.type}`) || request.type,
      monsterId: request.monsterId,
      huntId: request.huntId,
      status: "pending"
    });
    if (request.resolvedAt) {
      push({
        id: `request-resolved-${request.id}-${request.resolvedAt}`,
        type: `request-${request.type}-${request.status}`,
        category: "fieldwork",
        at: request.resolvedAt,
        titleKey: "HB.Audit.Event.FieldworkResolved",
        detail: request.detail || globalThis.game?.i18n?.localize?.(`HB.Approvals.Type.${request.type}`) || request.type,
        monsterId: request.monsterId,
        huntId: request.huntId,
        status: request.status
      });
    }
    if (request.consumedAt && request.consumedAt !== request.resolvedAt) {
      push({
        id: `request-consumed-${request.id}-${request.consumedAt}`,
        type: `request-${request.type}-consumed`,
        category: "fieldwork",
        at: request.consumedAt,
        titleKey: "HB.Audit.Event.FieldworkConsumed",
        detail: request.detail || globalThis.game?.i18n?.localize?.(`HB.Approvals.Type.${request.type}`) || request.type,
        monsterId: request.monsterId,
        huntId: request.huntId,
        status: "consumed"
      });
    }
  }

  const participantHuntIds = new Set((hunts ?? []).filter(hunt => hunt?.participantUserIds?.includes?.(userId)).map(hunt => hunt.id));
  for (const entry of auditEntries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const direct = entry.userId === userId || entry.targetUserId === userId;
    const sharedHunt = entry.huntId && participantHuntIds.has(entry.huntId) && ["hunt-step-advance", "hunt-step-revert", "hunt-resolve", "hunt-resolution-reject", "hunt-complication"].includes(entry.type);
    if (!direct && !sharedHunt) continue;
    const titleByType = {
      "hunt-attempt": "HB.Audit.Event.HuntAttempt",
      "hunt-step-advance": "HB.Audit.Event.HuntAdvance",
      "hunt-step-revert": "HB.Audit.Event.HuntRevert",
      "hunt-resolution-request": "HB.Audit.Event.ResolutionRequest",
      "hunt-resolution-check": "HB.Audit.Event.ResolutionCheck",
      "hunt-resolution-reject": "HB.Audit.Event.ResolutionRejected",
      "hunt-resolve": "HB.Audit.Event.HuntResolved",
      "hunt-complication": "HB.Audit.Event.Complication"
    };
    push({
      id: `audit-${entry.id}`,
      type: entry.type,
      category: "hunt",
      at: entry.at,
      titleKey: titleByType[entry.type] ?? "HB.Audit.Event.Generic",
      detail: auditDetail(entry),
      monsterId: entry.monsterId ?? huntById.get(entry.huntId)?.monsterId ?? null,
      huntId: entry.huntId,
      source: entry.source
    });
  }

  const seen = new Set();
  const unique = [];
  for (const event of events) {
    const fingerprint = `${event.type}|${event.at}|${event.monsterId ?? ""}|${event.huntId ?? ""}|${event.detail}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const localizedTitle = globalThis.game?.i18n?.localize?.(event.titleKey) ?? event.titleKey;
    const localizedStatus = event.statusKey ? globalThis.game?.i18n?.localize?.(event.statusKey) ?? event.statusKey : "";
    const categoryKey = `HB.Audit.Category.${event.category}`;
    const categoryLabel = globalThis.game?.i18n?.localize?.(categoryKey) ?? categoryKey;
    event.title = localizedTitle;
    event.statusLabel = localizedStatus;
    event.categoryLabel = categoryLabel;
    event.searchText = [localizedTitle, event.detail, event.monsterName, event.huntTitle, localizedStatus, categoryLabel, event.source].filter(Boolean).join(" ").toLocaleLowerCase();
    unique.push(event);
  }

  unique.sort((a, b) => {
    const time = String(b.at).localeCompare(String(a.at));
    if (time) return time;
    return (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
  });
  return unique;
}

export function getWorldAuditEntries() {
  const value = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.AUDIT_LOG);
  return Array.isArray(value) ? value : [];
}

function auditDetail(entry) {
  if (entry.type === "hunt-attempt" || entry.type === "hunt-resolution-check") {
    const resultKey = entry.success ? "HB.Audit.Result.Success" : "HB.Audit.Result.Failure";
    const result = globalThis.game?.i18n?.localize?.(resultKey) ?? resultKey;
    return `${entry.skillId ?? "check"}: ${entry.total ?? "?"}/${entry.dc ?? "?"} (${result})`;
  }
  if (entry.type === "hunt-step-advance") return entry.stepId ?? "";
  if (entry.type === "hunt-step-revert") return entry.stepId ?? "";
  if (entry.type === "hunt-resolution-request") return entry.outcome ?? "";
  if (entry.type === "hunt-resolve") return entry.outcome ?? "";
  if (entry.type === "hunt-complication") return entry.source ?? "";
  return String(entry.detail ?? entry.outcome ?? entry.stepId ?? "");
}
