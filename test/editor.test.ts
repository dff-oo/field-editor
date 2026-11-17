import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import characters from '@dffoogg/resources/characters.json';
import enemies from '@dffoogg/resources/enemies.json';
import abilities from '@dffoogg/resources/abilities.json';
import items from '@dffoogg/resources/items.json';
import summons from '@dffoogg/resources/summons.json';
import stages from '@dffoogg/resources/stages.json';
import talks from '@dffoogg/resources/talks.json';
import { decodeEtc1 } from '../scripts/export-field-maps';
import { fieldFileName } from '../src/lib/edit';
import { cdnSrc } from '../src/lib/cdn';
import { fieldMapFor } from '../src/lib/field-map';
import fieldMaps from '../src/lib/field-maps.json';
import { withStageNames, type Stage } from '../src/lib/resources';
import stageNames from '../src/lib/stage-names.json';
import Ajv from 'ajv';
import { checkFields, type NameTables } from '../src/lib/field/check';
import { fieldFileSchema, type FieldFile } from '../src/lib/field/schema';
import { fieldJsonSchema } from '../scripts/export-schema';
import { decodeField, encodeField, linkToken } from '../src/lib/share';

const root = fileURLToPath(new URL('..', import.meta.url));

function named(rows: { id: number; name: string }[]): Map<number, string> {
  return new Map(rows.map((row) => [row.id, row.name]));
}

function nameTables(): NameTables {
  return {
    characters: named(characters),
    enemies: named(enemies),
    abilities: named(abilities),
    summons: named(summons),
    talks: named(talks),
    stages: new Set(withStageNames(stages as Stage[], stageNames).map((stage) => stage.id)),
    items: new Map(items.map((item) => [`${item.item_type}:${item.item_id}`, item.name])),
  };
}

describe('stage names', () => {
  it('merges checked names over the extracted stages', () => {
    const merged = withStageNames(
      [{ id: 1, name: '', model: 'S001' }, { id: 50, name: '', model: 'S050' }],
      stageNames,
    );
    expect(merged.find((stage) => stage.id === 1)).toMatchObject({
      name: 'Prairie',
      confirmed: true,
      model: 'S001',
    });
    expect(merged.find((stage) => stage.id === 4)).toMatchObject({ name: 'Ruined temple', confirmed: false });
    expect(merged.find((stage) => stage.id === 50)?.name).toBe('');
    expect(merged.map((stage) => stage.id)).toEqual([...merged.map((stage) => stage.id)].sort((a, b) => a - b));
  });
});

describe('example map', () => {
  it('finds no problems when the installed resources are loaded', () => {
    const data = JSON.parse(readFileSync(join(root, 'examples', 'field-001.json'), 'utf8')) as { field: number };
    const problems = checkFields([{ name: fieldFileName(data.field), data }], nameTables());
    expect(problems).toEqual([]);
  });

  it('reports a battle that is both a strong enemy and a side quest', () => {
    const data = JSON.parse(readFileSync(join(root, 'examples', 'field-001.json'), 'utf8')) as { field: number; sites: { kind: string; quest_id: number; strong_enemy?: true; side_quest?: true }[] };
    const battle = data.sites.find((site) => site.kind === 'battle')!;
    battle.strong_enemy = true;
    battle.side_quest = true;
    const problems = checkFields([{ name: fieldFileName(data.field), data }], nameTables());
    expect(problems.map((problem) => problem.message)).toContain(`quest ${battle.quest_id} is both a strong enemy and a side quest; a battle can only be one`);
  });

  it('reports a site that is both the start and the goal', () => {
    const data = JSON.parse(readFileSync(join(root, 'examples', 'field-001.json'), 'utf8')) as { field: number; sites: { quest_id: number; revealed_by?: number | null; goal?: true }[] };
    const start = data.sites.find((site) => site.revealed_by === null)!;
    start.goal = true;
    const problems = checkFields([{ name: fieldFileName(data.field), data }], nameTables());
    expect(problems.map((problem) => problem.message)).toContain(`quest ${start.quest_id} is both the start and the goal; a site can only be one`);
  });

  it('reports a revealed hex that touches nothing already showing', () => {
    const data = JSON.parse(readFileSync(join(root, 'examples', 'field-001.json'), 'utf8')) as { field: number; sites: { quest_id?: number; hex?: [number, number] }[] };
    data.sites.find((site) => site.quest_id === 305)!.hex = [2, 2];
    const problems = checkFields([{ name: fieldFileName(data.field), data }], nameTables());
    expect(problems.map((problem) => problem.message)).toContain('clearing quest 304 reveals quests 305, which touch no hex already showing');
  });
});

describe('field links', () => {
  const example = (): FieldFile => fieldFileSchema.parse(JSON.parse(readFileSync(join(root, 'examples', 'field-001.json'), 'utf8')));

  it('round-trips a field through a link token', async () => {
    const field = example();
    const token = await encodeField(field);
    expect(token.startsWith('v1.')).toBe(true);
    expect(await decodeField(token)).toEqual(field);
  });

  it('rejects a token from another version', async () => {
    await expect(decodeField('v0.aaaa')).rejects.toThrow(/does not know/);
  });

  it('finds the token in a pasted link, fragment or bare token', () => {
    expect(linkToken('https://dffoogg.github.io/field-editor/#f=v1.abc_-')).toBe('v1.abc_-');
    expect(linkToken('  #f=v1.abc\n')).toBe('v1.abc');
    expect(linkToken('f=v1.abc')).toBe('v1.abc');
    expect(linkToken('v1.abc')).toBe('v1.abc');
    expect(linkToken('https://dffoogg.github.io/field-editor/')).toBe(null);
    expect(linkToken('https://dffoogg.github.io/field-editor/#other')).toBe(null);
    expect(linkToken('   ')).toBe(null);
  });

  it('publishes a schema that accepts the example', () => {
    const validate = new Ajv({ strict: false }).compile(fieldJsonSchema());
    expect(validate(example())).toBe(true);
  });
});

describe('field maps', () => {
  it('points every manifest entry at a CDN map, and at a file when the CDN is checked out', () => {
    const entries = Object.entries(fieldMaps as Record<string, { file: string; scale: number }>);
    expect(entries.length).toBeGreaterThan(0);
    const cdn = join(root, '..', 'dffoogg-cdn', 'maps');
    for (const [id, entry] of entries) {
      if (existsSync(cdn)) expect(existsSync(join(cdn, entry.file)), `field ${id}`).toBe(true);
      expect(fieldMapFor(Number(id))).toEqual({ url: cdnSrc(`maps/${entry.file}`), scale: entry.scale });
    }
  });
});

describe('decodeEtc1', () => {
  it('decodes an individual-mode 4x4 block', () => {
    const block = Buffer.alloc(8);
    block.writeUInt32BE(0x80000000, 0);
    const rgba = decodeEtc1(block, 4, 4);
    expect(rgba).toHaveLength(64);
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([138, 2, 2, 255]);
    const second = 2 * 4;
    expect([rgba[second], rgba[second + 1], rgba[second + 2], rgba[second + 3]]).toEqual([2, 2, 2, 255]);
  });
});
