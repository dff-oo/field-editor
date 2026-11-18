# Contributing fields

Field files are JSON. The editor loads and saves them in the browser; nothing in this repo is written by the editor. [examples/field-001.json](../examples/field-001.json) is a complete Chapter 1 field. A file you want the game server to serve is copied, by hand, into that server's `fields/`. **Save** shares a link that loads the field on screen, or downloads the JSON.

## Names

Enemy, character, ability, item, summon and field names, cutscene titles and mission texts come from `@dff-oo/resources`, installed from the public [resources](https://github.com/dff-oo/resources) repository. Stage names that have been checked live in [src/lib/stage-names.json](../src/lib/stage-names.json) and are merged over the extracted stage list. Mission kinds come from the resources package too.

## Run the editor

```bash
npm install
npm run dev
```

Open the page Next prints (port 3000). The editor never writes to the repo.

The toolbar has three buttons:

- **New**: search for the field and press Create. The map starts empty.
- **Load**: paste a field link (the whole URL, its `#f=…` part, or the `v1.…` code) or choose a field JSON file. A field that fails the schema is rejected, with the problems listed.
- **Save**: a link that opens this exact field, and a download of the JSON. Browsers that support it ask where to write the file; others download it. Both stay unavailable while the field has problems.

The editor does not remember which file you opened. The field on screen is all there is, and nothing is kept when the page closes, unless you copied a link: opening that link loads the field it holds.

Click a hex, then choose what is on it: cutscene, battle, treasure or move. An occupied hex opens its details. The cutscene, enemy, stage, character, ability, item and summon fields are searchable lists of the installed resources. Picking a cutscene sets `before_talk`. Cutscenes and battles have Start and Goal ticks, shown in the game as S and G. Start is the site nothing reveals (`revealed_by: null`), and Goal sets `goal`; clearing it clears the field. A field needs one of each. Only a cutscene has a character icon, and its "joins the party" tickbox adds that same character. A cutscene has no name in the file: the server sends the talk's title from the client, so the game shows the real one. A battle must have a name, because the client shows whatever name the server sends and has none of its own; Save stays closed to sharing until every battle has one. On an empty hex next to the end of a move strip, "Extend move" adds that hex to the strip. "Delete" removes what is on the selected hex (a strip cut in the middle becomes two). The first site on an empty field has to be a cutscene or a battle, because only those can be the start. Undo and Redo are in the toolbar; Ctrl+Z and Ctrl+Y do the same, except while typing in a field, which keeps its own undo. Hover a hex for its quest and name. Arrows show which quest reveals each site, and a move strip's hexes are numbered in travel order; "Hide reveal arrows" turns the arrows off. A legend in the corner names the colours. "Hide field image" in the toolbar hides the painting to see the hexes plainly. The bar at the bottom is the same check the server's `content:check` runs.

The download writes the canonical layout, so a diff is only the change you made.

The field's painting is `maps/NNN.png` in the [CDN](https://github.com/dff-oo/cdn). It is placed by its size in hexes, measured in the client on Chapter 1: the square texture spans 20.83 columns and 21.17 rows, and hex (1, 1) sits 2.77 columns in from its left edge and 5.39 rows down from its top. Even columns sit half a row south. Fields with a different horizontal display scale are sized in proportion; only Chapter 1 has been checked in the client. A maintainer rebuilds the paintings with `npm run field-maps` when the client archive is on disk. See the [README](../README.md).

## What a file contains

One file is one field, or one act of a field. Files that share a `field` id are combined by the server: only one of them may set `world` or `goal`. Numeric ids are stored without names. The editor and error messages show the names from `@dff-oo/resources`.

Put the video or page that shows a site in `sources`. `notes` can still be written by hand; the editor keeps it but does not edit it, and the server ignores it.

Quest ids must be unique and must not use the field clear marker (`field id * 100 + 99`, so 199 on field 1). The editor suggests the next free id. Chapter 1 uses 191-364. Whether other unused ids work in the client without a matching client master is still unverified, so keep a new act in its own file until that is checked.

## Check before a pull request

`npm test` checks the example map and the field paintings. `npm run build` typechecks the editor and writes the static site. The shape of a map (schema, unique quest ids, one start and one goal, no shared hexes, reveal links, a connected path, three missions on every battle) is the bar at the bottom of the editor. It also checks that enemy, ability, item, character, stage and summon ids exist, and that ability and character labels match the installed names.

Do not invent battles to fill a gap.
