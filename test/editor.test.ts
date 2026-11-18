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
import { fieldFileName, gateRequirement } from '../src/lib/edit';
import { cdnSrc } from '../src/lib/cdn';
import { fieldMapFor } from '../src/lib/field-map';
import fieldMaps from '../src/lib/field-maps.json';
import { withStageNames, type Stage } from '../src/lib/resources';
import stageNames from '../src/lib/stage-names.json';
import Ajv from 'ajv';
import { checkFields, type NameTables } from '../src/lib/field/check';
import { compileFieldFile } from '../src/lib/field/compile';
import { formatField } from '../src/lib/field/format';
import { revealedOnField, shownCleared, visibleOnField } from '../src/lib/field/gates';
import { fieldFileSchema, type FieldFile, type FieldSiteFile } from '../src/lib/field/schema';
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

function cutscene(questId: number, hex: [number, number], revealedBy: number | null, goal = false): FieldSiteFile {
  return {
    quest_id: questId,
    kind: 'cutscene',
    hex,
    revealed_by: revealedBy,
    before_talk: 4,
    ...(goal ? { goal: true as const } : {}),
  };
}

/** Start at (1, 1), goal at (1, 2), and a gate at (1, 3) that opens once the goal is cleared. */
function gateField(gate: FieldSiteFile, extra: FieldSiteFile[] = []): FieldFile {
  return {
    field: 7,
    sites: [
      cutscene(1, [1, 1], null),
      cutscene(2, [1, 2], 1, true),
      gate,
      ...extra,
    ],
  };
}

describe('gates', () => {
  const gate: FieldSiteFile = {
    quest_id: 3,
    kind: 'gate',
    hex: [1, 3],
    revealed_by: 1,
    opens_when: [2],
  };

  it('parses a gate and keeps canonical key order', () => {
    const file = fieldFileSchema.parse(gateField(gate));
    const formatted = formatField(file);
    const saved = JSON.parse(formatted) as { sites: Record<string, unknown>[] };
    const savedGate = saved.sites.find((site) => site.kind === 'gate');
    expect(savedGate && Object.keys(savedGate)).toEqual(['quest_id', 'kind', 'hex', 'revealed_by', 'opens_when']);
    expect(compileFieldFile(file).sites.find((site) => site.questId === 3)).toMatchObject({
      kind: 'gate',
      hexX: 1,
      hexY: 3,
      revealedBy: 1,
      opensWhen: [2],
    });
  });

  it('round-trips a gate through a link token', async () => {
    const file = fieldFileSchema.parse(gateField(gate));
    expect(await decodeField(await encodeField(file))).toEqual(file);
  });

  it('accepts a gate with no checker problems', () => {
    const problems = checkFields([{ name: 'gate.json', data: gateField(gate) }], nameTables());
    expect(problems).toEqual([]);
  });

  it('reports a gate that lists itself, a missing quest, or a quest twice', () => {
    const messages = (opens: number[]) => checkFields(
      [{ name: 'gate.json', data: gateField({ ...gate, opens_when: opens }) }],
      nameTables(),
    ).map((problem) => problem.message);
    expect(messages([3])).toContain('quest 3 opens when it is cleared itself');
    expect(messages([99])).toContain('quest 3 opens when 99, which is not on this field');
    expect(messages([2, 2])).toContain('quest 3 lists quest 2 twice');
  });

  it('rejects a gate with no conditions', () => {
    const problems = checkFields(
      [{ name: 'gate.json', data: gateField({ ...gate, opens_when: [] }) }],
      nameTables(),
    );
    expect(problems.some((problem) => problem.message.includes('opens_when'))).toBe(true);
  });

  it('reports a gate that waits on a quest only it reveals', () => {
    const behind = cutscene(4, [1, 4], 3);
    const problems = checkFields(
      [{ name: 'gate.json', data: gateField({ ...gate, opens_when: [4] }, [behind]) }],
      nameTables(),
    );
    expect(problems.map((problem) => problem.message).join('\n')).toMatch(/reveal cycle/);
  });

  it('lets no site share the gate hex, even one the gate reveals', () => {
    const replacement = cutscene(4, [1, 3], 3);
    const problems = checkFields([{ name: 'gate.json', data: gateField(gate, [replacement]) }], nameTables());
    expect(problems.map((problem) => problem.message)).toContain('quest 4 shares hex 1,3 with quest 3');
  });

  it('connects the sites a gate reveals through the open gate hex', () => {
    const beyond = cutscene(4, [1, 4], 3);
    const further = { kind: 'move' as const, hexes: [[1, 5]] as [number, number][], first_quest_id: 5, revealed_by: 3 };
    const problems = checkFields([{ name: 'gate.json', data: gateField(gate, [beyond, further]) }], nameTables());
    expect(problems).toEqual([]);
  });

  it('requires a site the gate reveals to touch a hex that is showing when the gate opens', () => {
    const away = cutscene(4, [5, 5], 3);
    const problems = checkFields([{ name: 'gate.json', data: gateField(gate, [away]) }], nameTables());
    expect(problems.map((problem) => problem.message)).toContain(
      'clearing quest 3 reveals quests 4, which touch no hex already showing',
    );
  });

  it('sends what a shut gate holds back, which the game keeps in cloud until it opens', () => {
    const sites = compileFieldFile(gateField(gate, [cutscene(4, [2, 2], 3)])).sites;
    expect(visibleOnField(sites, []).map((site) => site.questId)).toEqual([1]);
    expect(visibleOnField(sites, [1]).map((site) => site.questId)).toEqual([1, 2, 3, 4]);
    expect(revealedOnField(sites, [1]).map((site) => site.questId)).toEqual([1, 2, 3]);
    expect(visibleOnField(sites, [2]).map((site) => site.questId)).toEqual([1]);
    expect(revealedOnField(sites, [1, 2]).map((site) => site.questId)).toEqual([1, 2, 3, 4]);
  });

  it('never sends a gate as cleared, since the game draws that as already open', () => {
    expect(shownCleared('gate', true)).toBe(false);
    expect(shownCleared('move', false)).toBe(true);
  });

  it('reports a site behind a gate that another showing hex touches', () => {
    const behind = cutscene(4, [1, 4], 3);
    const sideDoor = cutscene(5, [1, 5], 2);
    const problems = checkFields([{ name: 'gate.json', data: gateField(gate, [behind, sideDoor]) }], nameTables());
    expect(problems.map((problem) => problem.message)).toContain(
      'quest 4 is behind gate 3 but touches quest 5, so it shows before the gate opens',
    );
    const deeper = cutscene(5, [1, 5], 4);
    const sealed = checkFields([{ name: 'gate.json', data: gateField(gate, [behind, deeper]) }], nameTables());
    expect(sealed.map((problem) => problem.message).filter((message) => message.includes('behind gate'))).toEqual([]);
  });

  it('words each requirement as the game does', () => {
    const cloud = characters.find((character) => character.id === 1)!;
    const joins: FieldSiteFile = { ...cutscene(2, [1, 2], 1, true), chara_icon: 1, joins: true } as FieldSiteFile;
    const file = gateField(gate);
    const names = { talks, characters };
    expect(gateRequirement({ ...file, sites: [file.sites[0], joins, gate] }, 2, names)).toBe(`Make ${cloud.name} an ally`);
    const title = talks.find((talk) => talk.id === 4)!.name;
    expect(gateRequirement(file, 2, names)).toBe(`Clear ${title}`);
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
