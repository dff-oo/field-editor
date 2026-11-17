# DFFOO field editor

A browser editor for Dissidia Final Fantasy Opera Omnia fields. A field is a JSON file. This repo is the editor. It does not contain the game server.

The hosted editor is at <https://dffoogg.github.io/field-editor/>. Every push to `main` rebuilds and deploys it with the [Pages workflow](.github/workflows/pages.yml).

## Run it

The name tables come from the public [resources](https://github.com/dffoogg/resources) repository, installed as `@dffoogg/resources`. No token is required.

```bash
npm install
npm run dev
```

Open the page Next prints (port 3000). **New** starts an empty map, **Load** opens a field JSON file, and **Save as…** writes one. **Copy link** copies a link that opens this field. The editor does not write into this repo. [examples/field-001.json](examples/field-001.json) is Chapter 1 and can be loaded as a starting point. A file the game server should serve is copied, by hand, into that server's `fields/`. The schema is [field.schema.json](https://dffoogg.github.io/field-editor/field.schema.json), written into `public/` by `predev` and `prebuild`.

See [docs/contributing-content.md](docs/contributing-content.md) for how a file is put together.

## Field paintings

The paintings are PNGs in [public/field-maps](public/field-maps), with their display scales in [src/lib/field-maps.json](src/lib/field-maps.json). The hosted site serves them as static files.

To rebuild them, a maintainer with the global client archive runs:

```bash
npm run field-maps
```

The archive is read from the [game](https://github.com/dffoogg/game) repo, checked out next to this one as `../dffoogg-game` (`DFFOO_GAME_DIR` overrides that). Textures are unpacked with [oo_tool](https://www.npmjs.com/package/oo_tool), a pinned devDependency; `DFFOO_UNPACKER` points at another copy of it. The script unpacks each FieldMap texture, decodes it, and writes `public/field-maps/NNN.png`. A texture that is not ETC1 is skipped and named in the script's output.
