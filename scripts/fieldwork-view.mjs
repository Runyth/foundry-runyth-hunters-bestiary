export function selectActorPlayerOwner(actor, users = [], ownerLevel = 3) {
  if (!actor) return null;
  const players = users.filter(user => user && !user.isGM);
  const assigned = players.filter(user => {
    const character = user.character;
    if (!character) return false;
    return (actor.id && character.id === actor.id) || (actor.uuid && character.uuid === actor.uuid);
  });
  if (assigned.length) return assigned.find(user => user.active) ?? assigned[0];

  const owners = players.filter(user => {
    if (typeof actor.testUserPermission === "function") {
      try { return actor.testUserPermission(user, ownerLevel); } catch { return false; }
    }
    return Number(actor.ownership?.[user.id] ?? actor.permission?.[user.id] ?? 0) >= ownerLevel;
  });
  return owners.find(user => user.active) ?? owners[0] ?? null;
}


export function selectControlledPlayerPerspectiveTarget(controlledTokens = [], users = [], ownerLevel = 3) {
  if (!Array.isArray(controlledTokens) || controlledTokens.length !== 1) return null;
  const token = controlledTokens[0];
  const actor = token?.actor ?? null;
  const user = selectActorPlayerOwner(actor, users, ownerLevel);
  if (!actor || !user) return null;
  return { user, actor, token };
}
