import { fieldClearMarker } from './field/check';
import { formatField } from './field/format';
import { adjacent } from './field/hex';
import type { FieldFile, FieldSiteFile } from './field/schema';

export type Kind = FieldSiteFile['kind'];
export type HexAt = [number, number];

export const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'cutscene', label: 'Cutscene' },
  { kind: 'battle', label: 'Battle' },
  { kind: 'treasure', label: 'Treasure' },
  { kind: 'move', label: 'Move' },
  { kind: 'gate', label: 'Gate' },
];

export function emptyField(field: number): FieldFile {
  return { $schema: 'https://dffoogg.github.io/field-editor/field.schema.json', field, sites: [] };
}

export function fieldFileName(field: number): string {
  return `field-${String(field).padStart(3, '0')}.json`;
}

/** Every quest id the file uses, with the hex it sits on. */
export function questHexes(file: FieldFile): { questId: number; hex: HexAt; site: number }[] {
  const rows: { questId: number; hex: HexAt; site: number }[] = [];
  file.sites.forEach((site, index) => {
    if (site.kind === 'move') {
      site.hexes.forEach((hex, step) => rows.push({ questId: site.first_quest_id + step, hex, site: index }));
    } else rows.push({ questId: site.quest_id, hex: site.hex, site: index });
  });
  return rows;
}

export function suggestId(file: FieldFile, taken: readonly number[] = []): number {
  const ids = [...questHexes(file).map((row) => row.questId), ...taken];
  let next = (ids.length ? Math.max(...ids) : file.field * 1000) + 1;
  if (next === fieldClearMarker(file.field)) next += 1;
  return next;
}

/** Index of the site on this hex, or -1. */
export function siteAt(file: FieldFile, [x, y]: HexAt): number {
  return file.sites.findIndex((site) =>
    site.kind === 'move' ? site.hexes.some(([hexX, hexY]) => hexX === x && hexY === y) : site.hex[0] === x && site.hex[1] === y,
  );
}

function neighbours(file: FieldFile, [x, y]: HexAt) {
  return questHexes(file).filter((row) => row.site >= 0 && adjacent({ x, y }, { x: row.hex[0], y: row.hex[1] }));
}

/** Move strips with a hex next to this one, which a new move hex can extend. */
export function adjacentMoves(file: FieldFile, at: HexAt): number[] {
  return [...new Set(neighbours(file, at).map((row) => row.site))].filter((index) => file.sites[index].kind === 'move');
}

/** The newest neighbouring quest is the likeliest one to reveal a new site. */
export function defaultReveal(file: FieldFile, at: HexAt): number | null {
  const ids = neighbours(file, at).map((row) => row.questId);
  return ids.length ? Math.max(...ids) : null;
}

/** Highest quest id on the field apart from these, for a site with no neighbour. */
function newestOtherQuest(file: FieldFile, skip: readonly number[]): number | null {
  const own = new Set(skip);
  const ids = questHexes(file).map((row) => row.questId).filter((id) => !own.has(id));
  return ids.length ? Math.max(...ids) : null;
}

/** Kind and title, such as "Battle: Dark Forest Pt. 2" or "Move". */
export function siteLabel(file: FieldFile, siteIndex: number, talks: readonly { id: number; name: string }[]): string {
  const site = file.sites[siteIndex];
  if (!site) return '';
  switch (site.kind) {
    case 'cutscene': {
      const title = talks.find((talk) => talk.id === site.before_talk)?.name;
      return title ? `Cutscene: ${title}` : 'Cutscene';
    }
    case 'battle':
      return site.name.trim() ? `Battle: ${site.name}` : 'Battle (no name)';
    case 'treasure':
      return site.name ? `Treasure: ${site.name}` : 'Treasure';
    case 'gate':
      return 'Gate';
    default:
      return 'Move';
  }
}

export function newSite(file: FieldFile, kind: Kind, at: HexAt): FieldSiteFile {
  const questId = suggestId(file);
  const revealed = defaultReveal(file, at);
  // A move or treasure cannot be the start, so with no neighbour it follows the newest quest.
  const follows = revealed ?? newestOtherQuest(file, [questId]) ?? questId;
  switch (kind) {
    case 'move':
      return { kind, hexes: [at], first_quest_id: questId, revealed_by: follows };
    case 'treasure':
      return { kind, quest_id: questId, hex: at, revealed_by: follows, treasure: [{ gil: 1000 }] };
    case 'gate':
      return { kind, quest_id: questId, hex: at, revealed_by: follows, opens_when: [] };
    case 'battle':
      return {
        kind, quest_id: questId, name: '', hex: at, revealed_by: revealed,
        waves: [[{ enemy: 1, level: 1 }]], goal_score: 1000, score_reward: { gems: 20 },
        missions: ['no_kos', { within_turns: 20 }, { breaks: 1 }],
      };
    default:
      return { kind: 'cutscene', quest_id: questId, hex: at, revealed_by: revealed, before_talk: 0 };
  }
}

/** Swap a site's kind, keeping its quest id, hex, reveal, name and notes. */
export function changeKind(file: FieldFile, site: FieldSiteFile, kind: Kind, at: HexAt): FieldSiteFile {
  const fresh = newSite(file, kind, at);
  const questId = site.kind === 'move' ? site.first_quest_id + site.hexes.findIndex(([x, y]) => x === at[0] && y === at[1]) : site.quest_id;
  const own = site.kind === 'move' ? site.hexes.map((_, step) => site.first_quest_id + step) : [site.quest_id];
  const follows = site.revealed_by ?? newestOtherQuest(file, own) ?? questId;
  const name = site.kind === 'battle' || site.kind === 'treasure' ? site.name : undefined;
  const keep = { notes: site.notes, sources: site.sources };
  if (fresh.kind === 'move') return { ...fresh, ...keep, first_quest_id: questId, revealed_by: follows };
  if (fresh.kind === 'treasure') return { ...fresh, ...keep, quest_id: questId, name, revealed_by: follows };
  if (fresh.kind === 'gate') {
    return {
      ...fresh,
      ...keep,
      quest_id: questId,
      revealed_by: site.revealed_by ?? follows,
      opens_when: site.kind === 'gate' ? site.opens_when : [],
    };
  }
  if (fresh.kind === 'battle') return { ...fresh, ...keep, quest_id: questId, name: name ?? '', revealed_by: site.revealed_by };
  return { ...fresh, ...keep, quest_id: questId, revealed_by: site.revealed_by };
}

/**
 * Remove whatever is on a hex. A move strip loses only that hex, and the hexes
 * left keep their quest ids: a strip cut in the middle becomes two strips.
 */
export function clearHex(file: FieldFile, at: HexAt): FieldFile {
  const index = siteAt(file, at);
  if (index < 0) return file;
  const site = file.sites[index];
  const sites = file.sites.slice();
  if (site.kind !== 'move' || site.hexes.length === 1) {
    sites.splice(index, 1);
    return { ...file, sites };
  }
  const step = site.hexes.findIndex(([x, y]) => x === at[0] && y === at[1]);
  const before = site.hexes.slice(0, step);
  const after = site.hexes.slice(step + 1);
  const replacement: FieldSiteFile[] = [];
  if (before.length) replacement.push({ ...site, hexes: before });
  if (after.length) {
    replacement.push({
      ...site,
      hexes: after,
      first_quest_id: site.first_quest_id + step + 1,
      revealed_by: before.length ? site.first_quest_id + step - 1 : site.revealed_by,
    });
  }
  sites.splice(index, 1, ...replacement);
  return { ...file, sites };
}

/** Add a hex to the end of a move strip. */
export function extendMove(file: FieldFile, index: number, at: HexAt): FieldFile {
  const site = file.sites[index];
  if (site.kind !== 'move') return file;
  const sites = file.sites.slice();
  sites[index] = { ...site, hexes: [...site.hexes, at] };
  return { ...file, sites };
}

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;

/** Asks where to save; browsers without a save dialog download the file instead. */
export async function saveFileAs(name: string, file: FieldFile): Promise<void> {
  const blob = new Blob([formatField(file)], { type: 'application/json' });
  const picker = (window as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    let handle;
    try {
      handle = await picker({ suggestedName: name, types: [{ description: 'Field', accept: { 'application/json': ['.json'] } }] });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
