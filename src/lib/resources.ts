import stageNames from './stage-names.json';

export interface Named {
  id: number;
  name: string;
}

export interface Stage extends Named {
  model?: string;
  confirmed?: boolean;
  notes?: string;
}

export interface Resources {
  characters: Named[];
  enemies: Named[];
  abilities: (Named & { description?: string })[];
  items: { item_type: number; item_id: number; name: string }[];
  summons: Named[];
  fields: (Named & { story_part?: number })[];
  stages: Stage[];
  talks: Named[];
  missions: Named[];
}

interface StageName {
  id: number;
  name?: string;
  confirmed?: boolean;
  notes?: string;
}

/** The client has no stage names, so the ones we have checked live with the editor. */
export function withStageNames(stages: Stage[], names: StageName[]): Stage[] {
  const byId = new Map(stages.map((stage) => [stage.id, { ...stage }]));
  for (const entry of names) {
    const stage = byId.get(entry.id) ?? { id: entry.id, name: '' };
    if (entry.name) stage.name = entry.name;
    if (entry.confirmed !== undefined) stage.confirmed = entry.confirmed;
    if (entry.notes) stage.notes = entry.notes;
    byId.set(entry.id, stage);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export const EMPTY_RESOURCES: Resources = {
  characters: [], enemies: [], abilities: [], items: [], summons: [], fields: [], stages: [], talks: [], missions: [],
};

const TABLES = ['characters', 'enemies', 'abilities', 'items', 'summons', 'fields', 'stages', 'talks', 'missions'] as const;

type TableName = (typeof TABLES)[number];

const tableImports: Record<TableName, () => Promise<{ default: unknown }>> = {
  characters: () => import('@dffoodev/resources/characters.json'),
  enemies: () => import('@dffoodev/resources/enemies.json'),
  abilities: () => import('@dffoodev/resources/abilities.json'),
  items: () => import('@dffoodev/resources/items.json'),
  summons: () => import('@dffoodev/resources/summons.json'),
  fields: () => import('@dffoodev/resources/fields.json'),
  stages: () => import('@dffoodev/resources/stages.json'),
  talks: () => import('@dffoodev/resources/talks.json'),
  missions: () => import('@dffoodev/resources/missions.json'),
};

async function loadTable(name: TableName): Promise<unknown> {
  let value: unknown;
  try {
    const imported = await tableImports[name]();
    value = imported.default;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load ${name}: ${detail}`);
  }
  if (!Array.isArray(value)) throw new Error(`Could not load ${name}: expected an array`);
  return value;
}

/** Name tables from @dffoodev/resources, with the checked stage names merged over the extracted stages. */
export async function loadResources(): Promise<Resources> {
  const entries = await Promise.all(TABLES.map(async (name) => [name, await loadTable(name)] as const));
  const loaded = Object.fromEntries(entries) as unknown as Resources;
  return { ...loaded, stages: withStageNames(loaded.stages, stageNames) };
}
