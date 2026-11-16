# DFFOO field editor

A browser editor for Dissidia Final Fantasy Opera Omnia story maps. A map is a JSON file. This repo is the editor. It does not contain the game server.

## Run it

The name tables are the private npm package `@dffoodev/resources` on GitHub Packages. `NODE_AUTH_TOKEN` has to be a token that can read packages from the `dffoodev` org (a classic token with `read:packages`, or `GITHUB_TOKEN` in this repo's Actions).

```bash
set NODE_AUTH_TOKEN=your-token
npm install
npm run dev
```

Open the page Next prints (port 3000). **New** starts an empty map, **Load** opens a story JSON file, and **Save as…** writes one. The editor does not write into this repo. [examples/field-001.json](examples/field-001.json) is Chapter 1 and can be loaded as a starting point.

See [docs/contributing-content.md](docs/contributing-content.md) for how a file is put together.

## Field paintings

The paintings are PNGs in [public/field-maps](public/field-maps), with their display scales in [src/lib/field-maps.json](src/lib/field-maps.json). The hosted site serves them as static files.

To rebuild them, a maintainer with the global client archive and the unpacker runs:

```bash
set DFFOO_ARCHIVE_ROOT=path\to\archive\gb
set DFFOO_UNPACKER=path\to\tools\re\package
npm run field-maps
```

`DFFOO_ARCHIVE_ROOT` defaults to `archive/gb` in this repo, and `DFFOO_UNPACKER` defaults to `tools/re/package`. Both directories are git-ignored. The script unpacks each FieldMap texture, decodes it, and writes `public/field-maps/NNN.png`. A texture that is not ETC1 is skipped and named in the script's output.
