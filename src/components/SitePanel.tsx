import { useMemo, type ReactNode } from 'react';
import { Button, Checkbox, CloseIcon, Combobox, IconButton, PlusIcon, Select, TextField, TrashIcon } from '@dffoogg/omnia-ui';
import { MISSION_TYPES } from '@/lib/field/compile';
import type { MissionFile, RewardFile, FieldFile, FieldSiteFile } from '@/lib/field/schema';
import type { Resources } from '@/lib/resources';
import { KINDS, adjacentMoves, changeKind, clearHex, defaultReveal, extendMove, newSite, questHexes, siteAt, siteLabel, type HexAt, type Kind } from '@/lib/edit';
import { namedOptions, stageOptions, type Option } from '@/lib/options';
import styles from './SitePanel.module.css';

type Battle = Extract<FieldSiteFile, { kind: 'battle' }>;
type Placed = Extract<FieldSiteFile, { kind: 'cutscene' | 'battle' }>;

const KIND_OPTIONS = KINDS.map(({ kind, label }) => ({ value: kind, label }));

/** A short visible label with extra words for screen readers, e.g. "Level" read as "Level, enemy B". */
function Label(props: { text: string; context: string }) {
  return (
    <>
      {props.text}
      <span className="omnia-sr-only">, {props.context}</span>
    </>
  );
}

function Group(props: { legend: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={props.className ? `${styles.group} ${props.className}` : styles.group}>
      <legend className={styles.legend}>{props.legend}</legend>
      {props.children}
    </fieldset>
  );
}

export function SitePanel(props: {
  file: FieldFile;
  at: HexAt;
  resources: Resources;
  onChange: (file: FieldFile) => void;
}) {
  const { file, at, resources } = props;
  const index = siteAt(file, at);
  const site = index >= 0 ? file.sites[index] : undefined;
  const options = useMemo(() => ({
    characters: namedOptions(resources.characters),
    enemies: namedOptions(resources.enemies),
    abilities: namedOptions(resources.abilities),
    summons: namedOptions(resources.summons),
    stages: stageOptions(resources.stages),
    talks: namedOptions(resources.talks),
    items: resources.items.map((item) => ({ value: `${item.item_type}:${item.item_id}`, label: `${item.name} (${item.item_type}:${item.item_id})` })),
  }), [resources]);
  const quests = useMemo(() => questOptions(file, resources.talks), [file, resources.talks]);

  function put(next: FieldSiteFile) {
    const sites = file.sites.slice();
    sites[index] = next;
    props.onChange({ ...file, sites });
  }

  if (!site) {
    const taken = new Set(questHexes(file).map((row) => row.questId));
    const extendable = adjacentMoves(file, at).filter((move) => {
      const strip = file.sites[move];
      return strip.kind === 'move' && !taken.has(strip.first_quest_id + strip.hexes.length);
    });
    const kinds = file.sites.length ? KINDS : KINDS.filter(({ kind }) => kind === 'cutscene' || kind === 'battle');
    return (
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.heading}>Hex {at[0]}, {at[1]}</h2>
          <p className={styles.meta}>What is on this hex?</p>
        </header>
        <div className={styles.kinds}>
          {kinds.map(({ kind, label }) => (
            <Button key={kind} onClick={() => props.onChange({ ...file, sites: [...file.sites, newSite(file, kind, at)] })}>
              {label}
            </Button>
          ))}
        </div>
        {file.sites.length === 0 && <p className={styles.meta}>The first site has to be the start, so it must be a cutscene or a battle.</p>}
        {extendable.map((move) => {
          const strip = file.sites[move];
          if (strip.kind !== 'move') return null;
          return (
            <Button key={move} variant="outline" block onClick={() => props.onChange(extendMove(file, move, at))}>
              Extend move from {strip.first_quest_id} (quest {strip.first_quest_id + strip.hexes.length})
            </Button>
          );
        })}
      </div>
    );
  }

  const ownIds = site.kind === 'move'
    ? site.hexes.map((_, step) => site.first_quest_id + step)
    : [site.quest_id];
  const revealOptions = quests.filter((option) => !ownIds.includes(Number(option.value)));

  const step = site.kind === 'move' ? Math.max(0, site.hexes.findIndex(([x, y]) => x === at[0] && y === at[1])) : 0;
  const questId = site.kind === 'move' ? site.first_quest_id + step : site.quest_id;

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.heading}>{siteLabel(file, index, resources.talks)}</h2>
        <p className={styles.meta}>
          Hex {at[0]}, {at[1]} · quest {questId}
          {site.kind === 'move' ? `, step ${step + 1} of ${site.hexes.length}` : ''}
        </p>
      </header>

      <div className={styles.pair}>
        <Select
          label="Type"
          options={KIND_OPTIONS}
          value={site.kind}
          onValueChange={(kind) => kind && put(changeKind(file, site, kind as Kind, at))}
        />
        {site.kind === 'move' ? (
          <TextField
            label="First quest id"
            description={`${site.hexes.length} hex${site.hexes.length === 1 ? '' : 'es'}`}
            type="number"
            value={site.first_quest_id}
            onChange={(event) => put({ ...site, first_quest_id: Number(event.target.value) })}
          />
        ) : (
          <TextField
            label="Quest id"
            type="number"
            value={site.quest_id}
            onChange={(event) => put({ ...site, quest_id: Number(event.target.value) })}
          />
        )}
      </div>

      {site.kind === 'cutscene' && (
        <Combobox
          label="Cutscene"
          description="The game shows the cutscene's title as its name."
          options={options.talks}
          value={site.before_talk ? String(site.before_talk) : null}
          onValueChange={(key) => put({ ...site, before_talk: key === null ? 0 : Number(key) })}
          clearable
          placeholder="Search cutscene titles"
        />
      )}

      {site.kind === 'battle' && (
        <TextField label="Name" value={site.name} onChange={(event) => put({ ...site, name: event.target.value })} />
      )}
      {site.kind === 'treasure' && (
        <TextField
          label="Name"
          description="Optional."
          value={site.name ?? ''}
          onChange={(event) => put({ ...site, name: event.target.value || undefined })}
        />
      )}

      {(site.kind === 'cutscene' || site.kind === 'battle') && (
        <div className={styles.checks}>
          <Checkbox
            label="Start"
            checked={site.revealed_by === null}
            disabled={site.revealed_by === null && defaultReveal(file, at) === null}
            onCheckedChange={(checked) => put({ ...site, revealed_by: checked ? null : defaultReveal(file, at) })}
          />
          <Checkbox
            label="Goal"
            checked={site.goal === true}
            onCheckedChange={(checked) => put({ ...site, goal: checked ? true : undefined })}
          />
        </div>
      )}

      {site.revealed_by !== null && (
        <Combobox
          label="Revealed by"
          options={revealOptions}
          value={String(site.revealed_by)}
          onValueChange={(key) => {
            if (key !== null) put({ ...site, revealed_by: Number(key) });
          }}
        />
      )}

      {(site.kind === 'cutscene' || site.kind === 'battle') && (
        <PlacedFields site={site} options={options} onChange={put} />
      )}

      {site.kind === 'battle' && <BattleFields site={site} resources={resources} options={options} onChange={put} />}

      {site.kind === 'treasure' && (
        <RewardList
          label="Contents"
          rewards={site.treasure}
          items={options.items}
          minimum={1}
          onChange={(treasure) => put({ ...site, treasure })}
        />
      )}

      <div className={styles.actions}>
        <Button variant="danger" size="sm" startIcon={<TrashIcon size={16} />} onClick={() => props.onChange(clearHex(file, at))}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function questOptions(file: FieldFile, talks: Resources['talks']): Option[] {
  return questHexes(file)
    .filter((row) => row.site >= 0)
    .map((row) => ({ value: String(row.questId), label: `${row.questId} ${siteLabel(file, row.site, talks)} (${row.hex[0]}, ${row.hex[1]})` }))
    .sort((a, b) => Number(a.value) - Number(b.value));
}

interface PanelOptions {
  characters: Option[];
  enemies: Option[];
  abilities: Option[];
  summons: Option[];
  stages: Option[];
  items: Option[];
}

function PlacedFields(props: { site: Placed; options: PanelOptions; onChange: (site: Placed) => void }) {
  const { site } = props;
  const optional = (key: string | null) => (key === null ? undefined : Number(key));
  return (
    <>
      {site.kind === 'cutscene' && (
        <>
          <Combobox
            label="Character icon"
            options={props.options.characters}
            value={site.chara_icon === undefined ? null : String(site.chara_icon)}
            clearable
            onValueChange={(key) => props.onChange({ ...site, chara_icon: optional(key), joins: key === null ? undefined : site.joins })}
          />
          <Checkbox
            label="This character joins the party"
            checked={site.joins === true}
            disabled={site.chara_icon === undefined}
            onCheckedChange={(checked) => props.onChange({ ...site, joins: checked ? true : undefined })}
          />
        </>
      )}
      <Combobox
        label="Grants summon"
        options={props.options.summons}
        value={site.grants_summon === undefined ? null : String(site.grants_summon)}
        clearable
        onValueChange={(key) => props.onChange({ ...site, grants_summon: optional(key) })}
      />
    </>
  );
}

const MISSION_KINDS = [
  { kind: 'no_kos', type: MISSION_TYPES.no_kos, fallback: 'Clear without any KOs' },
  { kind: 'within_turns', type: MISSION_TYPES.within_turns, fallback: 'Clear within %d turns' },
  { kind: 'breaks', type: MISSION_TYPES.breaks, fallback: 'Inflict %d or more Breaks' },
  { kind: 'in_party', type: MISSION_TYPES.in_party, fallback: 'Have %s in your party' },
  { kind: 'use_ability', type: MISSION_TYPES.use_ability, fallback: 'Use %s' },
] as const;

type MissionKind = (typeof MISSION_KINDS)[number]['kind'];

function missionKind(mission: MissionFile): MissionKind {
  if (mission === 'no_kos' || 'no_kos' in mission) return 'no_kos';
  if ('within_turns' in mission) return 'within_turns';
  if ('breaks' in mission) return 'breaks';
  if ('in_party' in mission) return 'in_party';
  return 'use_ability';
}

/** Enemy slots are lettered A, B, C… within a wave, falling back to numbers past Z. */
const slotName = (enemyIndex: number) => (enemyIndex < 26 ? String.fromCharCode(65 + enemyIndex) : String(enemyIndex + 1));

function BattleFields(props: { site: Battle; resources: Resources; options: PanelOptions; onChange: (site: Battle) => void }) {
  const { site, resources } = props;
  const missionText = (type: number, fallback: string) =>
    (resources.missions.find((row) => row.id === type)?.name ?? fallback).replace('%d', 'N').replace('%s', '…');
  const missionOptions = MISSION_KINDS.map((entry) => ({ value: entry.kind, label: missionText(entry.type, entry.fallback) }));

  function setWaves(waves: Battle['waves']) {
    props.onChange({ ...site, waves });
  }

  function setMission(slot: number, mission: MissionFile) {
    const missions = site.missions.slice() as Battle['missions'];
    missions[slot] = mission;
    props.onChange({ ...site, missions });
  }

  function retype(slot: number, kind: MissionKind) {
    const old = site.missions[slot];
    const extra = old !== 'no_kos' && 'reward' in old && old.reward ? { reward: old.reward } : {};
    const firstCharacter = resources.characters[0];
    const firstAbility = resources.abilities[0];
    switch (kind) {
      case 'no_kos': return setMission(slot, Object.keys(extra).length ? { no_kos: true, ...extra } : 'no_kos');
      case 'within_turns': return setMission(slot, { within_turns: 20, ...extra });
      case 'breaks': return setMission(slot, { breaks: 1, ...extra });
      case 'in_party': return setMission(slot, { in_party: firstCharacter?.id ?? 1, label: firstCharacter?.name ?? 'Cloud', ...extra });
      default: return setMission(slot, { use_ability: firstAbility?.id ?? 1, label: firstAbility?.name ?? 'Ability', ...extra });
    }
  }

  return (
    <>
      <Combobox
        label="Stage"
        options={props.options.stages}
        value={site.stage_id === undefined ? null : String(site.stage_id)}
        clearable
        onValueChange={(key) => props.onChange({ ...site, stage_id: key === null ? undefined : Number(key) })}
      />
      <div className={styles.checks}>
        <Checkbox
          label="Strong enemy (gold helmet)"
          checked={site.strong_enemy === true}
          onCheckedChange={(checked) => props.onChange({ ...site, strong_enemy: checked ? true : undefined })}
        />
        <Checkbox
          label="Side quest (green helmet)"
          checked={site.side_quest === true}
          onCheckedChange={(checked) => props.onChange({ ...site, side_quest: checked ? true : undefined })}
        />
      </div>

      <Group legend="Waves">
        {site.waves.map((wave, waveIndex) => (
          <Group key={waveIndex} legend={`Wave ${waveIndex + 1}`} className={styles.wave}>
            {site.waves.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className={styles.waveRemove}
                startIcon={<TrashIcon size={16} />}
                onClick={() => setWaves(site.waves.filter((_, i) => i !== waveIndex))}
              >
                Remove wave<span className="omnia-sr-only"> {waveIndex + 1}</span>
              </Button>
            )}
            {wave.map((enemy, enemyIndex) => {
              const slot = slotName(enemyIndex);
              return (
                <div key={enemyIndex} className={styles.enemy}>
                  <Combobox
                    label={<Label text={`Enemy ${slot}`} context={`wave ${waveIndex + 1}`} />}                    options={props.options.enemies}
                    value={String(enemy.enemy)}
                    onValueChange={(key) => {
                      if (key === null) return;
                      const waves = site.waves.map((row) => row.slice());
                      waves[waveIndex][enemyIndex] = { ...enemy, enemy: Number(key) };
                      setWaves(waves);
                    }}
                  />
                  <TextField
                    label={<Label text="Level" context={`enemy ${slot}, wave ${waveIndex + 1}`} />}
                    type="number"
                    min="1"
                    value={enemy.level}
                    onChange={(event) => {
                      const waves = site.waves.map((row) => row.slice());
                      waves[waveIndex][enemyIndex] = { ...enemy, level: Math.max(1, Number(event.target.value)) };
                      setWaves(waves);
                    }}
                  />
                  {wave.length > 1 && (
                    <IconButton
                      className={styles.rowRemove}
                      label={`Remove enemy ${slot} from wave ${waveIndex + 1}`}
                      icon={<CloseIcon size={16} />}
                      onClick={() => setWaves(site.waves.map((row, i) => (i === waveIndex ? row.filter((_, j) => j !== enemyIndex) : row)))}
                    />
                  )}
                </div>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              className={styles.add}
              startIcon={<PlusIcon size={16} />}
              onClick={() => setWaves(site.waves.map((row, i) => (i === waveIndex ? [...row, { ...row[row.length - 1] }] : row)))}
            >
              Add enemy<span className="omnia-sr-only"> to wave {waveIndex + 1}</span>
            </Button>
          </Group>
        ))}
        <Button size="sm" className={styles.add} startIcon={<PlusIcon size={16} />} onClick={() => setWaves([...site.waves, [{ enemy: 1, level: 1 }]])}>
          Add wave
        </Button>
      </Group>

      <TextField
        label="Goal score"
        type="number"
        min="0"
        value={site.goal_score}
        onChange={(event) => props.onChange({ ...site, goal_score: Number(event.target.value) })}
      />
      <Group legend="Score reward">
        <RewardEditor reward={site.score_reward} items={props.options.items} context="score reward" onChange={(score_reward) => props.onChange({ ...site, score_reward })} />
      </Group>

      <Group legend="Missions">
        {site.missions.map((mission, slot) => {
          const kind = missionKind(mission);
          const name = `Mission ${slot + 1}`;
          return (
            <div key={slot} className={styles.mission}>
              <Select label={name} options={missionOptions} value={kind} onValueChange={(next) => next && retype(slot, next as MissionKind)} />
              {mission !== 'no_kos' && 'within_turns' in mission && (
                <TextField
                  label={<Label text="Turns" context={name.toLowerCase()} />}
                  type="number"
                  min="1"
                  value={mission.within_turns}
                  onChange={(event) => setMission(slot, { ...mission, within_turns: Math.max(1, Number(event.target.value)) })}
                />
              )}
              {mission !== 'no_kos' && 'breaks' in mission && (
                <TextField
                  label={<Label text="Breaks" context={name.toLowerCase()} />}
                  type="number"
                  min="1"
                  value={mission.breaks}
                  onChange={(event) => setMission(slot, { ...mission, breaks: Math.max(1, Number(event.target.value)) })}
                />
              )}
              {mission !== 'no_kos' && 'in_party' in mission && (
                <Combobox
                  label={<Label text="Character" context={name.toLowerCase()} />}
                  options={props.options.characters}
                  value={String(mission.in_party)}
                  onValueChange={(key) => {
                    const character = resources.characters.find((row) => String(row.id) === key);
                    if (character) setMission(slot, { ...mission, in_party: character.id, label: character.name });
                  }}
                />
              )}
              {mission !== 'no_kos' && 'use_ability' in mission && (
                <Combobox
                  label={<Label text="Ability" context={name.toLowerCase()} />}
                  options={props.options.abilities}
                  value={String(mission.use_ability)}
                  onValueChange={(key) => {
                    const ability = resources.abilities.find((row) => String(row.id) === key);
                    if (ability) setMission(slot, { ...mission, use_ability: ability.id, label: ability.name });
                  }}
                />
              )}
            </div>
          );
        })}
      </Group>

      <RewardList
        label="First clear bonus"
        rewards={site.clear_bonus ?? []}
        items={props.options.items}
        minimum={0}
        onChange={(clear_bonus) => props.onChange({ ...site, clear_bonus: clear_bonus.length ? clear_bonus : undefined })}
      />
    </>
  );
}

const REWARD_KINDS = [
  { value: 'gems', label: 'Gems' },
  { value: 'gil', label: 'Gil' },
  { value: 'item', label: 'Item' },
];

function rewardKind(reward: RewardFile): 'gems' | 'gil' | 'item' {
  if ('gems' in reward) return 'gems';
  if ('gil' in reward) return 'gil';
  return 'item';
}

function RewardEditor(props: { reward: RewardFile; items: Option[]; context: string; onChange: (reward: RewardFile) => void }) {
  const { reward } = props;
  const kind = rewardKind(reward);
  const amount = 'gems' in reward ? reward.gems : 'gil' in reward ? reward.gil : reward.num;
  const setAmount = (value: number) => {
    const n = Math.max(1, value);
    if ('gems' in reward) props.onChange({ gems: n });
    else if ('gil' in reward) props.onChange({ gil: n });
    else props.onChange({ ...reward, num: n });
  };
  return (
    <div className={styles.reward}>
      <Select
        label={<Label text="Kind" context={props.context} />}
        options={REWARD_KINDS}
        value={kind}
        onValueChange={(next) => {
          if (next === 'gems') props.onChange({ gems: amount });
          else if (next === 'gil') props.onChange({ gil: amount });
          else if (next === 'item') {
            const [type, id] = (props.items[0]?.value ?? '11:2').split(':').map(Number);
            props.onChange({ item_type: type, item_id: id, num: amount });
          }
        }}
      />
      <TextField
        label={<Label text="Amount" context={props.context} />}
        type="number"
        min="1"
        value={amount}
        onChange={(event) => setAmount(Number(event.target.value))}
      />
      {kind === 'item' && 'item_type' in reward && (
        <Combobox
          label={<Label text="Item" context={props.context} />}
          className={styles.rewardItem}
          options={props.items}
          value={`${reward.item_type}:${reward.item_id}`}
          onValueChange={(key) => {
            if (key === null) return;
            const [type, id] = key.split(':').map(Number);
            props.onChange({ ...reward, item_type: type, item_id: id });
          }}
        />
      )}
    </div>
  );
}

function RewardList(props: { label: string; rewards: RewardFile[]; items: Option[]; minimum: number; onChange: (rewards: RewardFile[]) => void }) {
  return (
    <Group legend={props.label}>
      {props.rewards.length === 0 && <p className={styles.meta}>None.</p>}
      {props.rewards.map((reward, index) => (
        <Group key={index} legend={`Reward ${index + 1}`} className={styles.wave}>
          {props.rewards.length > props.minimum && (
            <Button
              size="sm"
              variant="ghost"
              className={styles.waveRemove}
              startIcon={<TrashIcon size={16} />}
              onClick={() => props.onChange(props.rewards.filter((_, i) => i !== index))}
            >
              Remove reward<span className="omnia-sr-only"> {index + 1}</span>
            </Button>
          )}
          <RewardEditor
            reward={reward}
            items={props.items}
            context={`${props.label.toLowerCase()} reward ${index + 1}`}
            onChange={(next) => props.onChange(props.rewards.map((row, i) => (i === index ? next : row)))}
          />
        </Group>
      ))}
      <Button size="sm" variant="ghost" className={styles.add} startIcon={<PlusIcon size={16} />} onClick={() => props.onChange([...props.rewards, { gil: 1000 }])}>
        Add reward
      </Button>
    </Group>
  );
}
