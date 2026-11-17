import maps from './field-maps.json';

interface FieldMapEntry {
  file: string;
  scale: number;
}

const table = maps as Record<string, FieldMapEntry>;

/** The committed painting for a field, or null when this repo has none. */
export function fieldMapFor(field: number): { url: string; scale: number } | null {
  const entry = table[String(field)];
  if (!entry) return null;
  return { url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/field-maps/${entry.file}`, scale: entry.scale };
}
