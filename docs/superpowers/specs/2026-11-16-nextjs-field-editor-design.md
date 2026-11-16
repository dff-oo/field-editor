# Next.js field editor

## Goal

Move the story map builder from `dffoodev/fields` (React 19 + Vite) into this repo as a Next.js 16 app that runs the same on a contributor's machine and when hosted (for example on Vercel). The editor's behaviour and look stay the same. The `fields` repo is not touched.

## Constraints

- Nothing is persisted by the app. State lives in memory for the page's lifetime; story JSON files the user saves are the only persistence.
- The app reads no local disk and runs no Node code at runtime, so it works hosted.
- The name tables stay in the private `dffoodev/resources` repo. This app installs them as the npm package `@dffoodev/resources` from GitHub Packages. Publishing them into the static site is the trade-off of hosting the editor.

## Architecture

- Next.js 16.4, App Router, React 19, TypeScript, `output: 'export'` (static files; `next dev` for local work).
- `src/app/layout.tsx`: title, global CSS. `src/app/page.tsx`: renders `<Editor />`.
- `src/components/`: `Editor.tsx` (the old `App.tsx`, marked `'use client'`), `SitePanel.tsx`, `NewField.tsx`, `SearchSelect.tsx`.
- `src/lib/story/`: `check`, `compile`, `format`, `hex`, `schema`, `story-content`, moved unchanged.
- `src/lib/edit.ts`: moved unchanged.
- `src/lib/resources.ts`: types, `EMPTY_RESOURCES`, the stage-name merge, and `loadResources()`, which loads each table with its own dynamic `import('@dffoodev/resources/<name>.json')`.
- `src/lib/field-map.ts`: `fieldMapFor(field)` reads `src/lib/field-maps.json` and returns the public PNG URL and display scale.
- `src/lib/stage-names.json`: moved unchanged.
- `src/app/globals.css`: the old `styles.css`.
- zod stays on 3.x.

## Names (resources)

`dffoodev/resources` is published as `@dffoodev/resources` to GitHub Packages. Its `package.json` exports `data/*.json`. A workflow publishes on a `v*` tag. The field-editor repository is granted read access to the package, so CI uses `GITHUB_TOKEN`. A local install needs `NODE_AUTH_TOKEN` (a `read:packages` token) and the committed `.npmrc`.

`loadResources()` loads the nine tables in parallel. A failure names the table that failed. `stage-names.json` is merged over `stages` as before. The tables are bundled into the static site, so the pickers are filled without a file upload.

## Field painting

`scripts/export-field-maps.ts` is run by hand by a maintainer. It reads the global client archive (`DFFOO_ARCHIVE_ROOT`, otherwise `archive/gb`) and the unpacker (`DFFOO_UNPACKER`, otherwise `tools/re/package`). For every `mst_field_disp` row with a `background_file_name` it unpacks the texture, decodes the ETC1 image, and writes `public/field-maps/NNN.png`. A texture that is not ETC1 (g1t format 0x6F) is skipped, with a warning, and left out of the manifest. It also writes `src/lib/field-maps.json` as `{ "<id>": { "file": "NNN.png", "scale": <disp_scale_x> } }`. Those files are committed. The site serves them from `/field-maps/`, so the hosted build needs no archive.

`fieldMapFor` is synchronous. "Hide field image" and the placement math are unchanged. A field with no entry has no painting.

## Repo contents

- `examples/field-001.json`, `docs/contributing-content.md`, `docs/stages.md`, `README.md`: port 3000, the npm resources install, and `npm run field-maps` for maintainers.
- `.gitignore`: `node_modules/`, `.next/`, `out/`, `next-env.d.ts`, `/archive/`, `/tools/`. PNGs under `public/field-maps/` are committed.
- `.github/workflows/ci.yml`: Node 22, `permissions: packages: read`, `npm ci` with `NODE_AUTH_TOKEN`, `npm test`, `npm run build`.

## Testing

- Vitest:
  - `checkStories` on `examples/field-001.json`, with the installed resources, finds no problems.
  - The stage-name merge.
  - Every `field-maps.json` entry has a PNG in `public/field-maps/`.
  - `decodeEtc1` on one known 4×4 block.
- `next build` typechecks and must succeed.

## Out of scope

UI redesign, zod 4, decoding `.g1t` in the browser, any persistence beyond saved story files, changes to `dffoodev/fields`. Fork pull requests from outside the org cannot read the private package.
