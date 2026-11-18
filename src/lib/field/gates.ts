/** A compiled site, as far as opening a gate needs to know. */
export interface RevealSite {
  questId: number;
  kind: string;
  revealedBy: number | null;
  opensWhen?: readonly number[];
}

/**
 * Cleared quest ids plus every gate that is open.
 * A gate opens once it has been revealed and every quest in `opensWhen` is satisfied,
 * so a condition cleared before the gate appears does not open it, and a gate can wait on a gate.
 */
export function satisfiedQuests(sites: readonly RevealSite[], cleared: readonly number[]): Set<number> {
  const satisfied = new Set<number>(cleared);
  const gates = sites.filter((site) => site.kind === 'gate');
  let grew = true;
  while (grew) {
    grew = false;
    for (const gate of gates) {
      if (satisfied.has(gate.questId)) continue;
      const revealed = gate.revealedBy === null || satisfied.has(gate.revealedBy);
      const open = (gate.opensWhen ?? []).every((id) => satisfied.has(id));
      if (revealed && open) {
        satisfied.add(gate.questId);
        grew = true;
      }
    }
  }
  return satisfied;
}

/**
 * Move rows are never played, so the client treats them as already clear.
 * A gate stays 0: the client draws a gate sent as clear as already open, and it keeps its own
 * record of which gates it has opened.
 */
export function shownCleared(kind: string, cleared: boolean): boolean {
  return kind === 'move' || (kind !== 'gate' && cleared);
}

/**
 * Sites on the map: revealed ones, plus the sites behind every gate on the map.
 * The client hides a hex it can only reach through a shut gate, and reveals it with the NEW
 * animation once it has played the gate's opening. An open gate stays as a walkable hex.
 */
export function visibleOnField<T extends RevealSite>(sites: readonly T[], cleared: readonly number[]): T[] {
  const revealed = new Set(revealedOnField(sites, cleared));
  const gatesShown = new Set([...revealed].filter((site) => site.kind === 'gate').map((site) => site.questId));
  return sites.filter((site) => revealed.has(site) || (site.revealedBy !== null && gatesShown.has(site.revealedBy)));
}

/** Sites the player can see: the start, and every site whose revealer is cleared or an open gate. */
export function revealedOnField<T extends RevealSite>(sites: readonly T[], cleared: readonly number[]): T[] {
  const satisfied = satisfiedQuests(sites, cleared);
  return sites.filter((site) => site.revealedBy === null || satisfied.has(site.revealedBy));
}

/** One condition of a gate that is on the map. */
export interface GateCondition {
  gateQuestId: number;
  condQuestId: number;
  /** Position in the gate's opensWhen list. */
  index: number;
  cleared: boolean;
}

/**
 * Every condition of every gate on the map, with the met ones marked cleared.
 * The client lists them when the gate is tapped, so an open gate keeps its rows.
 * A gate that is not revealed yet contributes nothing.
 */
export function gateConditions(sites: readonly RevealSite[], cleared: readonly number[]): GateCondition[] {
  const satisfied = satisfiedQuests(sites, cleared);
  const rows: GateCondition[] = [];
  for (const site of sites) {
    if (site.kind !== 'gate') continue;
    const revealed = site.revealedBy === null || satisfied.has(site.revealedBy);
    if (!revealed) continue;
    (site.opensWhen ?? []).forEach((condQuestId, index) => {
      rows.push({
        gateQuestId: site.questId,
        condQuestId,
        index,
        cleared: satisfied.has(condQuestId),
      });
    });
  }
  return rows;
}

/**
 * Gates that a clear opens and that were already on the map before it.
 * The client can only play the opening on a gate it is showing.
 */
export function gatesOpenedBy<T extends RevealSite>(
  sites: readonly T[],
  before: readonly number[],
  after: readonly number[],
): T[] {
  const was = satisfiedQuests(sites, before);
  const now = satisfiedQuests(sites, after);
  return sites.filter(
    (site) =>
      site.kind === 'gate' &&
      !was.has(site.questId) &&
      now.has(site.questId) &&
      (site.revealedBy === null || was.has(site.revealedBy)),
  );
}

/**
 * Sites the gate reveals that touch a hex outside the gate's own reveals, as [site, neighbour].
 * The client works out visibility by walking hexes from the start, so a site behind a shut gate
 * stays hidden only while the gate is the one way to reach it.
 */
export function leaksPastGate<T extends RevealSite & { hexX: number; hexY: number }>(
  sites: readonly T[],
  gate: T,
  adjacent: (a: { x: number; y: number }, b: { x: number; y: number }) => boolean,
): [number, number][] {
  const byId = new Map(sites.map((site) => [site.questId, site]));
  const behind = (site: T): boolean => {
    const seen = new Set<number>();
    for (let id = site.revealedBy; id !== null && !seen.has(id); id = byId.get(id)?.revealedBy ?? null) {
      if (id === gate.questId) return true;
      seen.add(id);
    }
    return false;
  };
  const leaks: [number, number][] = [];
  for (const site of sites) {
    if (site.revealedBy !== gate.questId) continue;
    for (const other of sites) {
      if (other === gate || other === site || behind(other)) continue;
      if (adjacent({ x: site.hexX, y: site.hexY }, { x: other.hexX, y: other.hexY })) leaks.push([site.questId, other.questId]);
    }
  }
  return leaks;
}

/** What is showing when a gate opens (the gate, its chain and each condition's chain) plus the sites it reveals. */
export function visibleWhenGateOpens<T extends RevealSite>(sites: readonly T[], gate: T): T[] {
  const byId = new Map(sites.map((site) => [site.questId, site]));
  const showing = new Set<number>();
  const addChain = (id: number) => {
    for (let current: number | null = id; current !== null && !showing.has(current); current = byId.get(current)?.revealedBy ?? null) {
      showing.add(current);
    }
  };
  addChain(gate.questId);
  for (const cond of gate.opensWhen ?? []) addChain(cond);
  return sites.filter((site) => site.revealedBy === null || site.revealedBy === gate.questId || showing.has(site.revealedBy));
}
