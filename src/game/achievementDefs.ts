/**
 * Local achievement definition mapping (transitional approach).
 * Sourced from backend achievement_registry.go.
 * TODO: Move to StartGameAck.Definitions.achievements when backend extension is done.
 */

export interface AchievementDefinition {
  type: string;
  english_name: string;
  name: string;
  desc: string;
  points: number;
}

export const ACHIEVEMENT_DEFINITIONS: Record<string, AchievementDefinition> = {
  triple_one: {
    type: 'triple_one',
    english_name: 'TripleOne',
    name: '三连一',
    desc: '连续3次掷骰结果为1',
    points: 5,
  },
  triple_six: {
    type: 'triple_six',
    english_name: 'TripleSix',
    name: '三连六',
    desc: '连续3次掷骰结果为6',
    points: 5,
  },
  boss_kill_shot: {
    type: 'boss_kill_shot',
    english_name: 'BossKillShot',
    name: 'K头',
    desc: '击败Boss（对Boss造成致命一击）',
    points: 5,
  },
  boss_damage_ten: {
    type: 'boss_damage_ten',
    english_name: 'BossDamageTen',
    name: '勇者之路',
    desc: '对Boss累积伤害达到10点',
    points: 5,
  },
  item_collector: {
    type: 'item_collector',
    english_name: 'ItemCollector',
    name: '道具收藏家',
    desc: '同时持有3个或更多道具',
    points: 5,
  },
  survivor: {
    type: 'survivor',
    english_name: 'Survivor',
    name: '生存大师',
    desc: '从未死亡',
    points: 8,
  },
  luck_master: {
    type: 'luck_master',
    english_name: 'LuckMaster',
    name: '幸运之星',
    desc: '游戏结束时LP达到最大值',
    points: 5,
  },
  first_to_boss: {
    type: 'first_to_boss',
    english_name: 'FirstToBoss',
    name: '先行者',
    desc: '第一个到达Boss格的玩家',
    points: 5,
  },
  mini_game_winner_three: {
    type: 'mini_game_winner_three',
    english_name: 'MiniGameWinnerThree',
    name: '小游戏之王',
    desc: '小游戏获得第1名累计达到3次',
    points: 8,
  },
};

/**
 * Get achievement definition by type. Returns undefined for unknown types.
 */
export function getAchievementDef(type: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS[type];
}