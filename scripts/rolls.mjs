import { MODULE_ID, SETTINGS, SKILL_LABELS } from "./constants.mjs";
import { gmIds, getSelectedActor, notify, escapeHtml } from "./utils.mjs";
import { rollFieldCheckWithSystemAdapter } from "./system-adapters.mjs";

export function actorSkillModifier(actor, skillId) {
  if (!actor || !skillId) return 0;
  const skill = actor.system?.skills?.[skillId];
  if (Number.isFinite(skill?.mod)) return Number(skill.mod);
  if (Number.isFinite(skill?.total)) return Number(skill.total);
  if (Number.isFinite(skill?.value)) return Number(skill.value);
  const abilityId = {
    ath: "str", acr: "dex", slt: "dex", ste: "dex",
    arc: "int", his: "int", inv: "int", nat: "int", rel: "int",
    ani: "wis", ins: "wis", med: "wis", prc: "wis", sur: "wis",
    dec: "cha", itm: "cha", prf: "cha", per: "cha"
  }[skillId];
  const ability = actor.system?.abilities?.[abilityId];
  return Number(ability?.mod ?? 0);
}

export async function performFieldCheck({ actor = null, skillId = "sur", dc = 10, label = "Field Check", extraModifier = 0 } = {}) {
  actor ??= getSelectedActor();
  if (!actor) {
    notify("warn", game.i18n.localize("HB.Notifications.SelectActor"));
    return null;
  }
  const skillModifier = actorSkillModifier(actor, skillId);
  let totalModifier = skillModifier + Number(extraModifier ?? 0);
  const systemResult = await rollFieldCheckWithSystemAdapter({
    actor,
    skillId,
    dc: Number(dc),
    label,
    skillModifier,
    extraModifier: Number(extraModifier ?? 0),
    modifier: totalModifier,
    rollMode: game.settings.get(MODULE_ID, SETTINGS.ROLL_MODE)
  });
  const formula = game.settings.get(MODULE_ID, SETTINGS.DEFAULT_FORMULA) || "1d20 + @mod";
  const roll = systemResult?.roll ?? await new Roll(formula, { mod: totalModifier }).evaluate();
  totalModifier = Number(systemResult?.modifier ?? totalModifier);
  const success = Number(systemResult?.success ?? (Number(roll.total) >= Number(dc)));
  const rollMode = game.settings.get(MODULE_ID, SETTINGS.ROLL_MODE);
  const whisper = rollMode === "publicroll" ? [] : gmIds();
  const blind = rollMode === "blindroll";
  const skillKey = `DND5E.Skill${skillId.charAt(0).toUpperCase()}${skillId.slice(1)}`;
  const skillLabel = systemResult?.skillLabel
    ?? (game.i18n.has?.(skillKey) ? game.i18n.localize(skillKey) : (SKILL_LABELS[skillId] ?? skillId));
  const content = `
    <section class="hb-chat-card ${success ? "is-success" : "is-failure"}">
      <header><i class="fa-solid fa-paw"></i> ${escapeHtml(label)}</header>
      <p><strong>${escapeHtml(actor.name)}</strong> — ${escapeHtml(skillLabel)} vs DC ${Number(dc)}</p>
      <p class="result">${success ? game.i18n.localize("HB.Common.Success") : game.i18n.localize("HB.Common.Failure")}: <strong>${Number(roll.total)}</strong></p>
    </section>`;
  const message = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    whisper,
    blind,
    flags: { [MODULE_ID]: { kind: "field-check", skillId, dc: Number(dc), success, actorUuid: actor.uuid, userId: game.user.id, systemAdapterId: systemResult?.adapterId ?? null } }
  });
  return { actorId: actor.id, actorUuid: actor.uuid, actorName: actor.name, skillId, modifier: totalModifier, dc: Number(dc), total: Number(roll.total), success, messageId: message.id, roll };
}
