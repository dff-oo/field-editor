export type FieldSiteKind = 'cutscene' | 'battle' | 'move' | 'treasure';

export interface FieldReward {
  item_type: number;
  item_id: number;
  item_num: number;
}

export interface FieldMission {
  /** Index into MessageData_QuestMissionText. */
  type: number;
  arg: number;
  description: string;
  reward: FieldReward;
}

export interface FieldEnemy {
  /** battle_enemy_id. Stats come from mst_enemy_level at enemy_id * 1000 + level. */
  enemy: number;
  level: number;
}

export interface FieldBattle {
  /** Enemies in each wave. The wave count is the quest's "Battles" figure. */
  waves: readonly (readonly FieldEnemy[])[];
  breakBonus: number;
  goalScore: number;
  scoreReward: FieldReward;
  missions: readonly [FieldMission, FieldMission, FieldMission];
  clearBonus: readonly FieldReward[];
  exp: number;
  gil: number;
  /**
   * battle_stage.quest_battle_id, 1 when unset. While it is 301 and UI tutorial
   * 18 is unseen, the solo spawn (0x5401c0) leaves party slots 1 and 2 empty
   * until 351 is cleared; 1-1's wave-3 script then spawns Vivi and Rem there.
   */
  questBattleId?: number;
  /** battle_info.is_strong_enemy: the map draws the gold helmet hex instead of the silver one. */
  strongEnemy?: boolean;
  /** Battle background: loads client model S<stageId>Model; 1 when unset. See docs/stages.md. */
  stageId?: number;
  /** Side quests (quest_type 5) draw a green helmet on the map instead of silver. */
  sideQuest?: boolean;
}

export interface FieldSite {
  questId: number;
  name: string;
  kind: FieldSiteKind;
  beforeTalk: number;
  /**
   * Hex grid: y grows southward and even columns sit half a cell south of odd
   * ones (the client's adjacency test at 0x49bd20).
   */
  hexX: number;
  hexY: number;
  hexZ: number;
  /** The site appears once this quest is cleared; null means from the start. */
  revealedBy: number | null;
  /** Character id from MessageData_Character drawn on the hex, or -1. */
  charaIcon: number;
  battle?: FieldBattle;
  /** A treasure chest's contents, granted on its first clear. */
  treasure?: readonly FieldReward[];
  /** Map quest_type, when it is not the kind's usual one. */
  questType?: number;
}
