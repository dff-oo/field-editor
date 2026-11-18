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

/** Move rows and gates are never played, so the client treats them as already clear. */
export function shownCleared(kind: string, cleared: boolean): boolean {
  return kind === 'move' || kind === 'gate' || cleared;
}

/** Sites on the map: revealed, and not a gate that has already opened. */
export function visibleOnField<T extends RevealSite>(sites: readonly T[], cleared: readonly number[]): T[] {
  const satisfied = satisfiedQuests(sites, cleared);
  return sites.filter((site) => {
    if (site.revealedBy !== null && !satisfied.has(site.revealedBy)) return false;
    return !(site.kind === 'gate' && satisfied.has(site.questId));
  });
}

/** True when a step would use a gate as a bridge to a site that appears only after the gate is gone. */
export function blocksGateStep(from: RevealSite | undefined, to: RevealSite | undefined): boolean {
  if (from?.kind === 'gate' && to?.revealedBy === from.questId) return true;
  if (to?.kind === 'gate' && from?.revealedBy === to.questId) return true;
  return false;
}

/** What is showing when a gate opens (its chain and each condition's chain, without the gate) plus the sites it reveals. */
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
  showing.delete(gate.questId);
  return sites.filter((site) => {
    if (site.questId === gate.questId) return false;
    if (site.revealedBy === gate.questId) return true;
    return site.revealedBy === null || showing.has(site.revealedBy);
  });
}
