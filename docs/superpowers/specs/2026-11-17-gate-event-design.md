# Gate event design

A gate is a kind of field site. It holds back the hexes behind it until a set of conditions is met. Then the game plays its opening, the gate stays as a walkable hex, and the hexes it held back come out of the cloud. The first version supports one kind of condition: a list of quests on the same field, all of which must be cleared.

## Field file

The schema is mirrored in `dff-oo-field-editor/src/lib/field/schema.ts` and `dff-oo-server/src/field/schema.ts`.

```json
{ "quest_id": 209, "kind": "gate", "hex": [11, 7], "revealed_by": 304, "opens_when": [312], "notes": "…" }
```

- `quest_id`: the gate's quest id, unique on the field like every other site.
- `hex`: a single hex.
- `revealed_by`: required. A gate is never a start.
- `opens_when`: one or more quest ids on the same field. The gate opens once every one of them is cleared.
- `notes` and the usual provenance fields are optional.
- A gate has no name, rewards, waves or talks.

Sites behind the gate set `revealed_by` to the gate's `quest_id`. A gate counts as "cleared" for reveal purposes once it is open.

A gate is open when it is revealed (its `revealed_by` is satisfied) and every quest in `opens_when` is cleared. Conditions cleared before the gate appears do not open it early. Gates may reveal gates, so openness is resolved in reveal order.

No site may share the gate's hex. The open gate is itself the hex the party walks across.

### Field 1

Gate 209 at `[11, 7]` is revealed by 304 and opens when 312 ("Make Cloud an ally") is cleared. It holds back the cutscene 307 at `[9, 7]` and the move 366 at `[10, 7]`. Gate 213 at `[13, 5]` is revealed by 364 and opens when 312, 308 and 310 are all cleared.

Field 1 exists in `dff-oo-server/fields/field-001.json` (local only), `dff-oo-field-editor/examples/field-001.json` and `dff-oo-fields/examples/field-001.json`, and they are kept identical. The server fixture `test/fixtures/chapter-one-field.json` is its compiled form.

## How the client handles a gate

All of this was found in `libDelta.so` and confirmed on the device.

- A `field.api` row with `quest_type` 3 draws the gate: the purple door sprite in a red hex, with no NEW badge.
- A gate row with `is_clear` 1 is drawn as already open, so a gate is always sent with `is_clear` 0. The server never makes it the default tap.
- Tapping the gate lists its `get_quest_condition` rows with `cond_cl` 3 under Requirements. `cond_txt` is printed as sent. `cond_type` 6 reads "Make %s an ally" and 1 reads "Clear %s"; a condition on a cutscene where someone joins uses 6.
- `quest_cond_id` is `gate * 100 + index + 1`, so it is unique per gate. `quest_end` returns the rows a clear flips under `conditions`, and the client updates the slot holding each id.
- Back on the field, the client sees a newly cleared slot on a gate it is showing. It pans to the gate, shows Requirements with the condition CLEARED, and once Requirements is closed it plays the chains falling. The gate then stays as a walkable hex.
- The client decides what is visible itself, by walking hexes from the start through cleared and move hexes and open gates. A shut gate blocks that walk, so a hex the client can reach only through the gate stays in cloud. When the gate opens, those hexes come out of the cloud with the NEW animation.
- The client keeps its own record of which gates it has opened and which conditions it has shown, saved on the device per quest id. The server sends nothing when a gate opens. A device that has already opened a gate will not replay it, even if the server state is reset.
- `relate_complete_quest_info` is not the gate mechanism. The server sends it empty, because synthetic quest ids there cause a native null dereference after `quest_end`.

## Server

- The schema, the compiler and the catalog accept gates. `SITE_QUEST_TYPE.gate` is 3.
- `visibleOnField` sends every revealed site, plus the sites behind every gate that is on the map, open or shut. The client keeps the ones behind a shut gate in cloud. `revealedOnField` is the set the player can actually see; the default tap is picked from it.
- `get_quest_condition` sends one row per condition of every revealed gate, open ones included, with `clear` set once the condition is met.
- `quest_end` sends the condition rows that the clear flips, for gates that were already on the map.

## Checker rules

- Every quest in `opens_when` exists on the field, is not the gate itself, and is listed once.
- Cycle detection follows `opens_when` links as well as `revealed_by`, so a gate that waits on a quest only it can reveal is reported as a deadlock.
- A site behind a gate may touch only the gate and other sites behind it. If it touches any other hex, the client can reach it without the gate and shows it before the gate opens.
- A site behind a gate must touch a hex that is showing when the gate opens: the gate, its chain, or the chain of any of its conditions.
- No site shares a hex with a gate.
- The editor and server checkers are mirrors and get the same rules. `src/field/gates.ts` and `src/lib/field/gates.ts` are identical.

## Editor

- A Gate kind button using the `gate` game icon, and a Gate legend entry.
- Inspector: the hex, `revealed_by`, and an "Opens when cleared" multi-select of the field's other quests. Below it, a Requirements preview lists each condition as the game prints it ("Make Cloud an ally", "Clear Together We Forge On").
- Map: the gate sprite on its red hex. The tooltip reads `Quest 209 · Gate · Requirements: Make Cloud an ally`.
- The map draws hexes behind a gate like any other hex. What stays in cloud is the server's and the client's rule, not the editor's.
- Reveal outlines are unchanged: green for the sites a hex reveals, purple for its revealer.
- The share link and JSON format carry the kind. The canonical key order is `quest_id, kind, hex, revealed_by, opens_when, notes`, then provenance.

## Out of scope

- Other condition kinds (any-of, character in party, item owned).
- Resetting the device's own record of opened gates.

## Testing

- Editor: schema parsing, key order, the checker rules (missing condition, self-reference, deadlock, a site behind a gate touching another hex, touching a showing hex when the gate opens), the visibility rules, and the requirement wording.
- Server: visibility of the gate and of what it holds back before and after its conditions are cleared, including a partly met gate, conditions cleared before the gate is revealed, and a gate revealed by a gate. Condition rows per gate. In Chapter 1 the gate row has `quest_type` 3 and `is_clear` 0, is never the default tap, and lists "Make Cloud an ally".
