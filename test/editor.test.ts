import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import characters from '@dffoodev/resources/characters.json';
import enemies from '@dffoodev/resources/enemies.json';
import abilities from '@dffoodev/resources/abilities.json';
import items from '@dffoodev/resources/items.json';
import summons from '@dffoodev/resources/summons.json';
import stages from '@dffoodev/resources/stages.json';
import talks from '@dffoodev/resources/talks.json';
import { decodeEtc1 } from '../scripts/export-field-maps';
import { storyFileName } from '../src/lib/edit';
import { fieldMapFor } from '../src/lib/field-map';
import fieldMaps from '../src/lib/field-maps.json';
import { withStageNames, type Stage } from '../src/lib/resources';
import stageNames from '../src/lib/stage-names.json';
import { checkStories, type NameTables } from '../src/lib/story/check';

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
    const problems = checkStories([{ name: storyFileName(data.field), data }], nameTables());
    expect(problems).toEqual([]);
  });
});

describe('field maps', () => {
  it('points every manifest entry at a committed PNG', () => {
    const entries = Object.entries(fieldMaps as Record<string, { file: string; scale: number }>);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(existsSync(join(root, 'public', 'field-maps', entry.file)), `field ${id}`).toBe(true);
      expect(fieldMapFor(Number(id))).toEqual({ url: `/field-maps/${entry.file}`, scale: entry.scale });
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
