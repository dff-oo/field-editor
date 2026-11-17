import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Character heads from @dffoogg/resources, served at /field-editor/characters/<image_id>.png. */
const from = resolve(dirname(createRequire(import.meta.url).resolve('@dffoogg/resources/characters.json')), 'characters');
const to = resolve(fileURLToPath(new URL('..', import.meta.url)), 'public', 'characters');

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`copied ${from} to ${to}`);
