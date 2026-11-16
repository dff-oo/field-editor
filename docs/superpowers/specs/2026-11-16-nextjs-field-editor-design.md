# Next.js field editor

## Goal

Move the story map builder from `dffoodev/fields` (React 19 + Vite) into this repo as a Next.js 16 app that runs the same on a contributor's machine and when hosted (for example on Vercel). The editor's behaviour and look stay the same. The `fields` repo is not touched.

## Constraints

- The names extracted from the client (`dffoodev/resources`, private) must not be committed to or served from this public repo.
- Nothing is persisted by the app. State lives in memory for the page's lifetime; story JSON files the user saves are the only persistence.
- The app reads no local disk and runs no Node code at runtime, so it works hosted.

## Architecture

- Next.js 16.4, App Router, React 19, TypeScript, `output: 'export'` (static files; `next dev` for local work).
- `src/app/layout.tsx`: title, global CSS. `src/app/page.tsx`: renders `<Editor />`.
- `src/components/`: `Editor.tsx` (the old `App.tsx`, marked `'use client'`), `SitePanel.tsx`, `NewField.tsx`, `SearchSelect.tsx`.
- `src/lib/story/`: `check`, `compile`, `format`, `hex`, `schema`, `story-content`, moved unchanged.
- `src/lib/edit.ts`: moved unchanged.
- `src/lib/resources.ts`: types, `EMPTY_RESOURCES`, stage-name merge, and `readResourceFiles(files)` which builds `Resources` from user-picked files.
- `src/lib/stage-names.json`: moved unchanged.
- `src/app/globals.css`: the old `styles.css`.
- zod stays on 3.x.

## Names (resources)

- Toolbar button **Resources…** opens a file picker for the JSON files in the resources repo's `data/` folder (`characters.json`, `enemies.json`, `abilities.json`, `items.json`, `summons.json`, `fields.json`, `stages.json`, `talks.json`, `missions.json`). Multiple selection; a whole folder can also be chosen.
- Files are matched by name. Unknown files are ignored. A table that is not picked stays empty. A file that is not a JSON array is reported by name in the bottom bar and its table stays empty.
- `stage-names.json` is merged over `stages` as before, also when no resources are loaded.
- With no resources the bottom bar says so and the pickers are empty, as today.

## Field painting

- Toolbar button **Painting…** (enabled when a map is open) takes an image file (`image/*`, normally the PNG of the field's `FieldMap` texture, unpacked and decoded outside the app).
- It becomes an object URL used as the background, placed exactly as today with display scale 2 (Chapter 1, the only field checked in the client). The URL is revoked when replaced, when the field changes, or on unmount.
- "Hide field image" works as before.

## Repo contents

- `examples/field-001.json`, `docs/contributing-content.md`, `docs/stages.md`, `README.md`, adapted: port 3000, the Resources… and Painting… buttons, no `resources/`, `archive/` or `tools/` folders.
- `.gitignore`: `node_modules/`, `.next/`, `out/`, `next-env.d.ts`, `*.png`.
- `.github/workflows/ci.yml`: `npm ci`, `npm test`, `npm run build` on Node 22.

## Testing

- Vitest:
  - `readResourceFiles`: picks tables by file name, leaves missing ones empty, reports a malformed file, merges stage names.
  - `checkStories` on `examples/field-001.json` finds no problems (guards the move of `src/lib/story`).
- `next build` typechecks and must succeed.

## Out of scope

UI redesign, zod 4, decoding `.g1t` in the app, any persistence beyond saved story files, changes to `dffoodev/fields`.
