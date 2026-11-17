import { cdnSrc } from './cdn';
import maps from './field-maps.json';

interface FieldMapEntry {
  file: string;
  scale: number;
}

const table = maps as Record<string, FieldMapEntry>;

/** The painting for a field in the CDN's maps/, or null when there is none. */
export function fieldMapFor(field: number): { url: string; scale: number } | null {
  const entry = table[String(field)];
  if (!entry) return null;
  return { url: cdnSrc(`maps/${entry.file}`), scale: entry.scale };
}
