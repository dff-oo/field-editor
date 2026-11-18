import { adjacent, stranded } from './hex';
import { leaksPastGate, visibleWhenGateOpens } from './gates';
import { compileFieldFile, type CompiledFile } from './compile';
import { fieldFileSchema, type MissionFile, type RewardFile, type FieldFile } from './schema';

export interface NameTables {
  characters: ReadonlyMap<number, string>;
  enemies: ReadonlyMap<number, string>;
  abilities: ReadonlyMap<number, string>;
  summons: ReadonlyMap<number, string>;
  talks: ReadonlyMap<number, string>;
  stages: ReadonlySet<number>;
  items: ReadonlyMap<string, string>;
}

export interface FieldProblem {
  file: string;
  message: string;
}

interface Expanded {
  file: string;
  fieldId: number;
  compiled: CompiledFile;
}

function itemKey(type: number, id: number): string {
  return `${type}:${id}`;
}

function rewardIds(reward: RewardFile): { type: number; id: number } {
  if ('gems' in reward) return { type: 99, id: 2 };
  if ('gil' in reward) return { type: 99, id: 1 };
  return { type: reward.item_type, id: reward.item_id };
}

function missionRewards(mission: MissionFile): RewardFile[] {
  if (mission !== 'no_kos' && 'reward' in mission && mission.reward) return [mission.reward];
  return [];
}

export function checkFields(
  files: readonly { name: string; data: unknown }[],
  names: NameTables | null,
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const expanded: Expanded[] = [];
  const questFiles = new Map<number, string>();

  for (const file of files) {
    const parsed = fieldFileSchema.safeParse(file.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          file: file.name,
          message: `${issue.path.join('.') || '(file)'}: ${issue.message}`,
        });
      }
      continue;
    }
    const compiled = compileFieldFile(parsed.data);
    expanded.push({ file: file.name, fieldId: parsed.data.field, compiled });
    const ids = compiled.sites.map((site) => site.questId);
    for (const questId of ids) {
      const previous = questFiles.get(questId);
      if (previous) {
        problems.push({ file: file.name, message: `quest ${questId} is also used in ${previous}` });
      } else {
        questFiles.set(questId, file.name);
      }
      if (questId === fieldClearMarker(parsed.data.field)) {
        problems.push({
          file: file.name,
          message: `quest ${questId} is reserved for the field ${parsed.data.field} clear marker`,
        });
      }
    }
    for (const site of parsed.data.sites) {
      if (site.kind === 'cutscene' && !site.before_talk) {
        problems.push({ file: file.name, message: `cutscene ${site.quest_id} has no talk; its name comes from the talk title` });
      }
      if (site.kind === 'cutscene' && site.joins && !site.chara_icon) {
        problems.push({ file: file.name, message: `cutscene ${site.quest_id} joins nobody: the character on its icon joins, and it has no icon` });
      }
      if ((site.kind === 'cutscene' || site.kind === 'battle') && site.revealed_by === null && site.goal) {
        problems.push({ file: file.name, message: `quest ${site.quest_id} is both the start and the goal; a site can only be one` });
      }
      if (site.kind === 'battle' && site.strong_enemy && site.side_quest) {
        problems.push({ file: file.name, message: `quest ${site.quest_id} is both a strong enemy and a side quest; a battle can only be one` });
      }
    }
    if (names) problems.push(...referenceProblems(file.name, parsed.data, names));
  }

  const byField = new Map<number, Expanded[]>();
  for (const entry of expanded) {
    const group = byField.get(entry.fieldId) ?? [];
    group.push(entry);
    byField.set(entry.fieldId, group);
  }
  for (const [fieldId, group] of byField) {
    problems.push(...fieldProblems(fieldId, group));
  }
  return problems;
}

function fieldProblems(fieldId: number, group: Expanded[]): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const file = group.map((entry) => entry.file).join(', ');
  const sites = group.flatMap((entry) => entry.compiled.sites);
  if (sites.length === 0) return problems;
  const starts = sites.filter((site) => site.revealedBy === null);
  if (starts.length !== 1) {
    problems.push({ file, message: `field ${fieldId} has ${starts.length} start sites; it needs one` });
  }
  const goals = group.map((entry) => entry.compiled.goalQuestId).filter((id) => id !== null);
  if (goals.length !== 1) {
    problems.push({ file, message: `field ${fieldId} has ${goals.length} goals; it needs one` });
  }
  const byId = new Map(sites.map((site) => [site.questId, site]));
  const hexes = new Map<string, number[]>();
  for (const site of sites) {
    const key = `${site.hexX},${site.hexY}`;
    const group = hexes.get(key) ?? [];
    group.push(site.questId);
    hexes.set(key, group);
  }
  for (const [key, occupants] of hexes) {
    if (occupants.length < 2) continue;
    problems.push({ file, message: `quest ${occupants[1]} shares hex ${key} with quest ${occupants[0]}` });
  }
  const known = new Set(sites.map((site) => site.questId));
  for (const site of sites) {
    if (site.revealedBy !== null && !known.has(site.revealedBy)) {
      problems.push({ file, message: `quest ${site.questId} is revealed by ${site.revealedBy}, which is not on this field` });
    }
    if (site.kind !== 'gate') continue;
    const listed = new Set<number>();
    for (const cond of site.opensWhen ?? []) {
      if (cond === site.questId) {
        problems.push({ file, message: `quest ${site.questId} opens when it is cleared itself` });
      } else if (listed.has(cond)) {
        problems.push({ file, message: `quest ${site.questId} lists quest ${cond} twice` });
      } else if (!known.has(cond)) {
        problems.push({ file, message: `quest ${site.questId} opens when ${cond}, which is not on this field` });
      }
      listed.add(cond);
    }
  }
  const seen = new Set<number>();
  const visit = (questId: number, stack: number[]): void => {
    if (stack.includes(questId)) {
      problems.push({ file, message: `reveal cycle ${[...stack, questId].join(' -> ')}` });
      return;
    }
    if (seen.has(questId)) return;
    seen.add(questId);
    const site = sites.find((entry) => entry.questId === questId);
    if (site?.revealedBy != null) visit(site.revealedBy, [...stack, questId]);
    for (const cond of site?.opensWhen ?? []) visit(cond, [...stack, questId]);
  };
  for (const site of sites) visit(site.questId, []);
  if (starts.length === 1) {
    const cells = sites.map((site) => ({ id: site.questId, x: site.hexX, y: site.hexY }));
    const lost = stranded(cells, starts[0].questId);
    if (lost.length) {
      problems.push({ file, message: `quests not connected to the start: ${lost.join(', ')}` });
    }
    for (const revealer of sites) {
      if (!sites.some((site) => site.revealedBy === revealer.questId)) continue;
      if (revealer.kind === 'gate') {
        for (const [site, neighbour] of leaksPastGate(sites, revealer, adjacent)) {
          problems.push({
            file,
            message: `quest ${site} is behind gate ${revealer.questId} but touches quest ${neighbour}, so it shows before the gate opens`,
          });
        }
      }
      // An open gate stays as a hex, so its sites may touch it, its chain or any condition's chain.
      // Otherwise only hexes on the revealer's own chain are sure to be showing; other branches depend on play order.
      let visible = sites;
      if (revealer.kind === 'gate') visible = visibleWhenGateOpens(sites, revealer);
      else {
        const chain = new Set<number>();
        for (let id: number | null = revealer.questId; id !== null && !chain.has(id); id = byId.get(id)?.revealedBy ?? null) chain.add(id);
        visible = sites.filter((site) => site.revealedBy === null || chain.has(site.revealedBy));
      }
      const lost = stranded(visible.map((site) => ({ id: site.questId, x: site.hexX, y: site.hexY })), starts[0].questId)
        .filter((id) => byId.get(id)?.revealedBy === revealer.questId);
      if (lost.length) {
        problems.push({
          file,
          message: `clearing quest ${revealer.questId} reveals quests ${lost.join(', ')}, which touch no hex already showing`,
        });
      }
    }
  }
  return problems;
}

function referenceProblems(file: string, field: FieldFile, names: NameTables): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const expect = (kind: string, id: number, table: ReadonlyMap<number, string>, label?: string) => {
    if (table.size === 0) return;
    const found = table.get(id);
    if (!found) problems.push({ file, message: `${kind} ${id} is not in the resources` });
    else if (label !== undefined && found !== label) {
      problems.push({ file, message: `${kind} ${id} is ${found}, not ${label}` });
    }
  };
  for (const site of field.sites) {
    if (site.kind === 'move' || site.kind === 'gate') continue;
    if (site.kind === 'cutscene' && site.chara_icon) expect('character', site.chara_icon, names.characters);
    if (site.kind !== 'treasure' && site.grants_summon) expect('summon', site.grants_summon, names.summons);
    if (site.kind === 'cutscene' && site.before_talk) expect('talk', site.before_talk, names.talks);
    if (site.kind !== 'battle') continue;
    if (site.stage_id !== undefined && names.stages.size > 0 && !names.stages.has(site.stage_id)) {
      problems.push({ file, message: `stage ${site.stage_id} is not in the resources` });
    }
    for (const wave of site.waves) {
      for (const enemy of wave) expect('enemy', enemy.enemy, names.enemies);
    }
    for (const mission of site.missions) {
      if (mission !== 'no_kos' && 'in_party' in mission) expect('character', mission.in_party, names.characters, mission.label);
      if (mission !== 'no_kos' && 'use_ability' in mission) expect('ability', mission.use_ability, names.abilities, mission.label);
      for (const reward of missionRewards(mission)) checkReward(file, reward, names, problems);
    }
    checkReward(file, site.score_reward, names, problems);
    for (const reward of site.clear_bonus ?? []) checkReward(file, reward, names, problems);
  }
  for (const site of field.sites) {
    if (site.kind !== 'treasure') continue;
    for (const reward of site.treasure) checkReward(file, reward, names, problems);
  }
  return problems;
}

function checkReward(file: string, reward: RewardFile, names: NameTables, problems: FieldProblem[]): void {
  if (names.items.size === 0) return;
  const { type, id } = rewardIds(reward);
  if (!names.items.has(itemKey(type, id))) {
    problems.push({ file, message: `item type ${type} id ${id} is not in the resources` });
  }
}

/** Field-clear marker. Must match questIdForField in catalog.ts, and content must not use it. */
export function fieldClearMarker(fieldId: number): number {
  return fieldId * 100 + 99;
}

export function itemKeyOf(type: number, id: number): string {
  return itemKey(type, id);
}
