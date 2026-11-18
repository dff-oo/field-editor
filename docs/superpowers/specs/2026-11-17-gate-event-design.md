# Gate event design

A gate is a new kind of field site. It blocks a hex until a set of conditions is met, then vanishes, and the sites it reveals appear. The first version supports one kind of condition: a list of quests on the same field, all of which must be cleared.

## Field file

The schema is mirrored in `dffoogg-field-editor/src/lib/field/schema.ts` and `dffoogg-server/src/field/schema.ts`.

```json
{ "quest_id": 217, "kind": "gate", "hex": [12, 4], "revealed_by": 310, "opens_when": [312], "notes": "…" }
```

- `quest_id`: the gate's quest id, unique on the field like every other site.
- `hex`: a single hex.
- `revealed_by`: required. A gate is never a start.
- `opens_when`: one or more quest ids on the same field. The gate opens once every one of them is cleared.
- `notes` and the usual provenance fields are optional.
- A gate has no name, rewards, waves or talks.

Sites revealed by the gate set `revealed_by` to the gate's `quest_id`. The reveal model is otherwise unchanged: a gate counts as "cleared" for reveal purposes once it is open.

A gate is open when it is revealed (its `revealed_by` is satisfied) and every quest in `opens_when` is cleared. Conditions cleared before the gate appears do not open it early. Gates may reveal gates, so openness is resolved in reveal order.

A site revealed by a gate may sit on the gate's own hex, which is how a hex "takes the gate's place". This is the pattern the field 1 portal already uses on the device: the portal at `[8,10]` is hidden once 303 is cleared, and a move hex on the same cell with `revealed_by: 303` replaces it.

### Field 1

The move strip `first_quest_id: 216` shrinks from `[[11,4],[12,4]]` to `[[11,4]]`, which frees quest id 217. The gate takes 217 at hex `[12,4]` with `revealed_by: 310` and `opens_when: [312]` (the cutscene playing talk 15, "Together We Forge On"). The sites the gate reveals are added later.

Field 1 exists in both `dffoogg-server/fields/field-001.json` and `dffoogg-fields/examples/field-001.json` (they differ only by `$schema`), so both get the edit, and the server fixture `test/fixtures/chapter-one-field.json` is regenerated.

## Checker rules

- Every quest in `opens_when` exists on the field, is not the gate itself, and is listed once.
- Every quest in `opens_when` is reachable without opening this gate. Cycle detection follows `opens_when` links as well as `revealed_by`, so a gate that waits on a quest only it (directly or through a chain) can reveal is reported as a deadlock.
- The touching rule ("adjacent to an earlier site", `check.ts`) does not count a gate as a neighbour for the sites it reveals, since the gate is gone when they appear. Connectivity to the start likewise does not route through a gate for those sites.
- Hex overlap: a gate may share its hex with sites it reveals, and with nothing else. All other overlap and revealer rules apply as for any single-hex site.
- The editor and server checkers are mirrors and get the same rules.

## Editor

- A Gate kind button using the `gate` game icon, and a Gate legend entry.
- Inspector: the hex, `revealed_by`, and an "Opens when cleared" multi-select picker that lists the field's other quests by their display name.
- Map: the gate sprite on its hex. The tooltip reads `Quest 217 · Gate · opens after <names>`.
- Reveal outlines are unchanged: green for the sites the gate reveals, purple for the gate's revealer.
- The share link and JSON format carry the new kind. The canonical key order is `quest_id, kind, hex, revealed_by, opens_when, notes`, then provenance.

## Server

- The schema, the compiler and the catalog accept gates.
- `FieldSite` gains kind `'gate'` and `opensWhen: number[]`. `SITE_QUEST_TYPE` is a `Record` over the kind, so the compiler forces a `quest_type` choice for gates.
- `visibleSites` builds a "satisfied" set (cleared quests plus open gates, resolved in reveal order) and filters `revealedBy` against it. A gate is sent while it is revealed and not open, and never once open.
- The client never clears a gate. Opening is worked out each time the field list is built, so no gate state is stored. The client refetches the field list after `quest_end`, which is how the portal already disappears.
- The gate row is sent with `is_clear: 1`, like move rows, so it gets no NEW badge and is never picked as `default_quest_id`.
- Client rendering: the `quest_type` or `symbol_label` that draws a gate is not yet known. Until it is found (testing on the device, reading the client's quest-type handling; the field_quest columns `complete_type` and `is_unlock` are leads), the gate is sent as a move row (`quest_type` 4). The party can walk onto it; a site revealed onto the gate's cell keeps the party on a real hex after it opens.
- `relate_complete_quest_info` is not used. The server sends it empty on purpose, because synthetic quest ids there caused a native null dereference after `quest_end`.

## Out of scope

- Other condition kinds (any-of, character in party, item owned).
- The vortex icon.
- An opened-gate state on the map, since the gate vanishes.

## Testing

- Editor: schema parsing, formatting key order, checker rules (missing condition, self-reference, deadlock, the touching rule when the gate opens) and compiler output.
- Server: visibility of the gate and of the sites it reveals, before and after all conditions are cleared, including a partly met gate, conditions cleared before the gate is revealed, and a gate revealed by a gate. The field-quest row for a gate has `is_clear: 1`.
