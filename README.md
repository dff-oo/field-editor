# DFFOO field editor

A browser editor for Dissidia Final Fantasy Opera Omnia story maps. A map is a JSON file. This repo is the editor. It does not contain the game server.

The hosted editor is at <https://dffoogg.github.io/field-editor/>. Every push to `main` rebuilds and deploys it with the [Pages workflow](.github/workflows/pages.yml).

## Run it

The name tables come from the public [resources](https://github.com/dffoogg/resources) repository, installed as `@dffoogg/resources`. No token is required.

```bash
npm install
npm run dev
```

Open the page Next prints (port 3000). **New** starts an empty map, **Load** opens a story JSON file, and **Save as…** writes one. The editor does not write into this repo. [examples/field-001.json](examples/field-001.json) is Chapter 1 and can be loaded as a starting point.

See [docs/contributing-content.md](docs/contributing-content.md) for how a file is put together.

## Field paintings

The paintings are PNGs in [public/field-maps](public/field-maps), with their display scales in [src/lib/field-maps.json](src/lib/field-maps.json). The hosted site serves them as static files.

To rebuild them, a maintainer with the global client archive and the unpacker runs:

```bash
set DFFOO_UNPACKER=path\to\tools\re\package
npm run field-maps
```

The archive is read from the [game](https://github.com/dffoogg/game) repo, checked out next to this one as `../dffoogg-game` (`DFFOO_GAME_DIR` overrides that). `DFFOO_UNPACKER` defaults to `tools/re/package` in this repo, which is git-ignored. The script unpacks each FieldMap texture, decodes it, and writes `public/field-maps/NNN.png`. A texture that is not ETC1 is skipped and named in the script's output.
