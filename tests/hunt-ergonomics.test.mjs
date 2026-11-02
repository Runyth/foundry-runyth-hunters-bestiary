import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPlayerAuditTimeline } from "../scripts/audit-log.mjs";

function makeHunt() {
  return {
    id: "hunt-1",
    title: "Marsh Stalker",
    monsterId: "stalker",
    status: "active",
    participantUserIds: ["player"],
    currentStep: 1,
    steps: [
      { id: "rumors", name: "Rumors", kind: "investigate", status: "completed", attempts: [{ id: "a1", success: true }] },
      { id: "tracks", name: "Tracks", kind: "track", status: "active", attempts: [] },
      { id: "resolve", name: "Resolve", kind: "conclusion", status: "locked", attempts: [] }
    ],
    resolution: { status: "awaiting-choice" }
  };
}

test("only the latest untouched Hunt advancement is reversible", async () => {
  const previousGame = globalThis.game;
  globalThis.game = { user: { id: "gm", isGM: true } };
  try {
    const { reversibleStepId } = await import(`../scripts/hunts.mjs?reversible=${Date.now()}`);
    assert.equal(reversibleStepId(makeHunt()), "rumors");
    const touched = makeHunt();
    touched.steps[1].attempts.push({ id: "later", success: false });
    assert.equal(reversibleStepId(touched), null);
    const progressed = makeHunt();
    progressed.steps[1].status = "completed";
    progressed.steps[2].status = "active";
    assert.equal(reversibleStepId(progressed), "tracks");
  } finally {
    globalThis.game = previousGame;
  }
});

test("reverting an accidental advance restores the previous step and records an audit event", async () => {
  const previousGame = globalThis.game;
  const previousFoundry = globalThis.foundry;
  let hunts = [makeHunt()];
  let audit = [];
  let progress = { monsters: {}, fieldLog: [], booksRead: [], statistics: {}, huntCycle: {} };
  const gm = { id: "gm", isGM: true, getFlag: () => null, setFlag: async () => null };
  const player = {
    id: "player", isGM: false,
    getFlag: () => structuredClone(progress),
    setFlag: async (_module, _key, value) => { progress = structuredClone(value); return value; }
  };
  const users = new Map([["gm", gm], ["player", player]]);
  globalThis.game = {
    user: gm,
    users,
    settings: {
      get: (_module, key) => structuredClone(key === "hunts" ? hunts : key === "auditLog" ? audit : key === "worldData" ? { knowledgeLevels: [] } : null),
      set: async (_module, key, value) => {
        if (key === "hunts") hunts = structuredClone(value);
        if (key === "auditLog") audit = structuredClone(value);
        return value;
      }
    }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "audit-id" } };
  try {
    const { revertStepAdvance } = await import(`../scripts/hunts.mjs?revert=${Date.now()}`);
    const result = await revertStepAdvance("hunt-1", "rumors");
    assert.equal(result.hunt.steps[0].status, "active");
    assert.equal(result.hunt.steps[1].status, "locked");
    assert.equal(result.hunt.steps[2].status, "locked");
    assert.equal(result.hunt.currentStep, 0);
    assert.equal(result.hunt.steps[0].attempts.length, 1, "history is retained rather than erased");
    assert.equal(audit.at(-1).type, "hunt-step-revert");
    assert.equal(audit.at(-1).stepId, "rumors");
  } finally {
    globalThis.game = previousGame;
    globalThis.foundry = previousFoundry;
  }
});

test("selected-player audit timeline reconstructs rumor, evidence, approvals and Hunt history", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: { localize: key => key },
    settings: { get: () => [] }
  };
  try {
    const events = buildPlayerAuditTimeline({
      userId: "player",
      world: {
        monsters: [{ id: "stalker", name: "Marsh Stalker" }],
        books: [{ id: "book-1", name: "Wetland Signs" }]
      },
      hunts: [{ id: "hunt-1", title: "Marsh Hunt", monsterId: "stalker", participantUserIds: ["player"] }],
      progress: {
        fieldLog: [
          { id: "r1", type: "knowledge", source: "rumor", monsterId: "stalker", detail: "It sings before rain.", points: 1, at: "2026-10-10T10:00:00.000Z" },
          { id: "s1", type: "sighting", monsterId: "stalker", detail: "Reeds bent eastward.", at: "2026-10-10T11:00:00.000Z" },
          { id: "b1", type: "book", bookId: "book-1", at: "2026-10-10T12:00:00.000Z" }
        ],
        monsters: {
          stalker: {
            discoveries: [{ id: "d1", field: "name", source: "gm-reveal", at: "2026-10-10T13:00:00.000Z" }],
            hunts: [{ id: "hunt-1", title: "Marsh Hunt", joinedAt: "2026-10-10T09:00:00.000Z", resolvedAt: null }]
          }
        }
      },
      fieldworkRequests: [{ id: "f1", userId: "player", type: "rumor", monsterId: "stalker", status: "approved", createdAt: "2026-10-10T08:00:00.000Z", resolvedAt: "2026-10-10T08:05:00.000Z" }],
      auditEntries: [{ id: "a1", type: "hunt-attempt", userId: "player", huntId: "hunt-1", stepId: "tracks", total: 17, dc: 14, success: true, at: "2026-10-10T14:00:00.000Z" }]
    });
    assert.ok(events.some(event => event.type === "rumor" && event.detail.includes("sings before rain")));
    assert.ok(events.some(event => event.type === "sighting"));
    assert.ok(events.some(event => event.type === "reveal" && event.detail.includes("name")));
    assert.ok(events.some(event => event.type === "hunt-attempt" && event.huntTitle === "Marsh Hunt"));
    assert.ok(events.some(event => event.type === "request-rumor-approved"));
    assert.equal(events[0].type, "hunt-attempt", "timeline is newest first");
  } finally {
    globalThis.game = previousGame;
  }
});

test("GM dashboard exposes reversal and selected-Actor audit ergonomics without adding player controls", async () => {
  const [template, main, auditTemplate] = await Promise.all([
    readFile(new URL("../templates/main.hbs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/apps/main-app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../templates/audit-log.hbs", import.meta.url), "utf8")
  ]);
  assert.match(template, /data-action="revertStep"/);
  assert.match(template, /data-action="openAuditLog"/);
  assert.match(main, /selectActorPlayerOwner/);
  assert.match(main, /AuditLogApp/);
  assert.match(auditTemplate, /data-hb-search="audit"/);
  assert.match(auditTemplate, /data-hb-list="audit"/);
});
