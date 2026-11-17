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

export interface Character extends Named {
  /** Names the head image, characters/<image_id>.png in the CDN. */
  image_id?: number;
}

export interface Resources {
  characters: Character[];
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
  characters: () => import('@dffoogg/resources/characters.json'),
  enemies: () => import('@dffoogg/resources/enemies.json'),
  abilities: () => import('@dffoogg/resources/abilities.json'),
  items: () => import('@dffoogg/resources/items.json'),
  summons: () => import('@dffoogg/resources/summons.json'),
  fields: () => import('@dffoogg/resources/fields.json'),
  stages: () => import('@dffoogg/resources/stages.json'),
  talks: () => import('@dffoogg/resources/talks.json'),
  missions: () => import('@dffoogg/resources/missions.json'),
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

/** Name tables from @dffoogg/resources, with the checked stage names merged over the extracted stages. */
export async function loadResources(): Promise<Resources> {
  const entries = await Promise.all(TABLES.map(async (name) => [name, await loadTable(name)] as const));
  const loaded = Object.fromEntries(entries) as unknown as Resources;
  return { ...loaded, stages: withStageNames(loaded.stages, stageNames) };
}
