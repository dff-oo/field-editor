import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fieldFileSchema } from '../src/lib/field/schema';

/** JSON Schema for a field file, published at /field-editor/field.schema.json. */
export function fieldJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(fieldFileSchema as never, { name: 'FieldFile', $refStrategy: 'none' }) as Record<string, unknown>;
}

const out = resolve(fileURLToPath(new URL('..', import.meta.url)), 'public', 'field.schema.json');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void writeFile(out, `${JSON.stringify(fieldJsonSchema(), null, 2)}\n`).then(() => {
    console.log(`wrote ${out}`);
  });
}
