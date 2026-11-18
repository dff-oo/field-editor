import type { ComboboxOption } from '@dff-oo/omnia-ui';

export type Option = ComboboxOption;

/** Options for an id/name resource list, labelled "Name (id)" so typing either finds it. */
export function namedOptions(rows: readonly { id: number; name: string }[]): Option[] {
  return rows.map((row) => ({ value: String(row.id), label: `${row.name || 'unnamed'} (${row.id})` }));
}

/** Confirmed names plain, guesses with a question mark, and the rest by id. */
export function stageOptions(rows: readonly { id: number; name: string; confirmed?: boolean }[]): Option[] {
  return rows.map((row) => ({
    value: String(row.id),
    label: row.name ? `${row.name}${row.confirmed ? '' : '?'} (${row.id})` : `Stage ${row.id}`,
  }));
}
