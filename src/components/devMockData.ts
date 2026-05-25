/**
 * devMockData - DEV-mode mock data for scene jumping
 *
 * Provides mock data constants and inject functions that directly
 * call gameStore setters. Only used in DEV mode.
 */

import { Scene, useGameStore } from '../store/gameStore';
import type * as protocol from '../types/protocol';

// ========== Fixed UUIDs for mock players ==========

const MOCK_UUID_QINGLONG = 'aaaa1111-1111-1111-1111-111111111111';
const MOCK_UUID_ZHUQUE = 'bbbb2222-2222-2222-2222-222222222222';
const MOCK_UUID_BAIHU = 'cccc3333-3333-3333-3333-333333333333';
const MOCK_UUID_XUANWU = 'dddd4444-4444-4444-4444-444444444444';

// ========== Mock Players ==========

export const MOCK_PLAYERS: protocol.Player[] = [
  {
    player_id: MOCK_UUID_QINGLONG,
    display_name: '青龙侠',
    faction: 'qing_long',
    position: 5,
    hp: 5,
    max_hp: 8,
    lp: 5,
    buffs: [{ type: 'divine', name: '神眷', duration: 3 }],
    items: [],
    charge: 2,
    fire_counter: 0,
    is_dead: false,
    skip_turn: false,
  },
  {
    player_id: MOCK_UUID_ZHUQUE,
    display_name: '朱雀女',
    faction: 'zhu_que',
    position: 8,
    hp: 4,
    max_hp: 8,
    lp: 3,
    buffs: [{ type: 'fire', name: '离火', duration: -1 }],
    items: [{ id: 'item-001', type: 'any_door', name: '任意门', targetable: true }],
    charge: 0,
    fire_counter: 2,
    is_dead: false,
    skip_turn: false,
  },
  {
    player_id: MOCK_UUID_BAIHU,
    display_name: '白虎将',
    faction: 'bai_hu',
    position: 12,
    hp: 3,
    max_hp: 8,
    lp: 4,
    buffs: [{ type: 'curse', name: '诅咒', duration: 2 }],
    items: [{ id: 'item-002', type: 'reverse_clock', name: '反方向的钟' }],
    charge: 1,
    fire_counter: 0,
    is_dead: false,
    skip_turn: false,
  },
  {
    player_id: MOCK_UUID_XUANWU,
    display_name: '玄武守',
    faction: 'xuan_wu',
    position: 15,
    hp: 6,
    max_hp: 8,
    lp: 6,
    buffs: [{ type: 'exorcism', name: '辟邪', duration: 5 }],
    items: [{ id: 'item-003', type: 'dice_upgrade', name: '骰子升级卡' }],
    charge: 1,
    fire_counter: 0,
    is_dead: false,
    skip_turn: false,
  },
];

// ========== Mock GameOver ==========

export const MOCK_GAME_OVER: protocol.GameOver = {
  rankings: [
    {
      player_id: MOCK_UUID_QINGLONG,
      display_name: '青龙侠',
      rank: 1,
      total_score: 65,
      mini_game_score: 27,
      boss_score: 15,
      item_score: 8,
      achievement_score: 15,
      achievements: ['survivor', 'boss_kill_shot', 'first_to_boss'],
      score_reasons: [
        { category: 'mini_game', reason: '小游戏第1名', points: 10, round: 1 },
        { category: 'mini_game', reason: '小游戏第1名', points: 10, round: 2 },
        { category: 'mini_game', reason: '小游戏第2名', points: 7, round: 3 },
        { category: 'boss', reason: 'Boss伤害', points: 5, round: 0 },
        { category: 'boss', reason: 'K头', points: 10, round: 0 },
        { category: 'item', reason: '道具积分', points: 8, round: 0 },
        { category: 'achievement', reason: '生存大师', points: 8, round: 0 },
        { category: 'achievement', reason: '先行者', points: 5, round: 0 },
        { category: 'achievement', reason: 'K头', points: 2, round: 0 },
      ],
    },
    {
      player_id: MOCK_UUID_XUANWU,
      display_name: '玄武守',
      rank: 2,
      total_score: 48,
      mini_game_score: 14,
      boss_score: 22,
      item_score: 5,
      achievement_score: 7,
      achievements: ['boss_damage_ten'],
      score_reasons: [
        { category: 'mini_game', reason: '小游戏第2名', points: 7, round: 1 },
        { category: 'mini_game', reason: '小游戏第3名', points: 4, round: 2 },
        { category: 'mini_game', reason: '小游戏第3名', points: 3, round: 3 },
        { category: 'boss', reason: 'Boss伤害', points: 12, round: 0 },
        { category: 'boss', reason: 'Boss暴击', points: 10, round: 0 },
        { category: 'item', reason: '道具积分', points: 5, round: 0 },
        { category: 'achievement', reason: '勇者之路', points: 5, round: 0 },
        { category: 'achievement', reason: '道具收藏家', points: 2, round: 0 },
      ],
    },
    {
      player_id: MOCK_UUID_ZHUQUE,
      display_name: '朱雀女',
      rank: 3,
      total_score: 35,
      mini_game_score: 14,
      boss_score: 10,
      item_score: 5,
      achievement_score: 6,
      achievements: ['luck_master'],
      score_reasons: [
        { category: 'mini_game', reason: '小游戏第3名', points: 4, round: 1 },
        { category: 'mini_game', reason: '小游戏第2名', points: 7, round: 2 },
        { category: 'mini_game', reason: '小游戏第4名', points: 3, round: 3 },
        { category: 'boss', reason: 'Boss伤害', points: 5, round: 0 },
        { category: 'boss', reason: 'Boss暴击', points: 5, round: 0 },
        { category: 'item', reason: '道具积分', points: 5, round: 0 },
        { category: 'achievement', reason: '幸运之星', points: 5, round: 0 },
        { category: 'achievement', reason: '道具收藏家', points: 1, round: 0 },
      ],
    },
    {
      player_id: MOCK_UUID_BAIHU,
      display_name: '白虎将',
      rank: 4,
      total_score: 22,
      mini_game_score: 7,
      boss_score: 5,
      item_score: 5,
      achievement_score: 5,
      achievements: ['item_collector'],
      score_reasons: [
        { category: 'mini_game', reason: '小游戏第4名', points: 3, round: 1 },
        { category: 'mini_game', reason: '小游戏第4名', points: 2, round: 2 },
        { category: 'mini_game', reason: '小游戏第2名', points: 2, round: 3 },
        { category: 'boss', reason: 'Boss伤害', points: 3, round: 0 },
        { category: 'boss', reason: 'Boss暴击', points: 2, round: 0 },
        { category: 'item', reason: '道具积分', points: 5, round: 0 },
        { category: 'achievement', reason: '道具收藏家', points: 5, round: 0 },
      ],
    },
  ],
  stats: [
    {
      player_id: MOCK_UUID_QINGLONG,
      display_name: '青龙侠',
      rounds_won: 2,
      events_drawn: 3,
      items_used: 1,
      boss_damage_dealt: 15,
      achievements: ['survivor', 'boss_kill_shot', 'first_to_boss'],
      total_score: 65,
      score_breakdown: { mini_game: 27, boss: 15, item: 8, achievement: 15 },
    },
    {
      player_id: MOCK_UUID_XUANWU,
      display_name: '玄武守',
      rounds_won: 0,
      events_drawn: 2,
      items_used: 3,
      boss_damage_dealt: 22,
      achievements: ['boss_damage_ten'],
      total_score: 48,
      score_breakdown: { mini_game: 14, boss: 22, item: 5, achievement: 7 },
    },
    {
      player_id: MOCK_UUID_ZHUQUE,
      display_name: '朱雀女',
      rounds_won: 1,
      events_drawn: 5,
      items_used: 2,
      boss_damage_dealt: 10,
      achievements: ['luck_master'],
      total_score: 35,
      score_breakdown: { mini_game: 14, boss: 10, item: 5, achievement: 6 },
    },
    {
      player_id: MOCK_UUID_BAIHU,
      display_name: '白虎将',
      rounds_won: 0,
      events_drawn: 4,
      items_used: 1,
      boss_damage_dealt: 5,
      achievements: ['item_collector'],
      total_score: 22,
      score_breakdown: { mini_game: 7, boss: 5, item: 5, achievement: 5 },
    },
  ],
};

// ========== Mock MapConfig ==========

const MOCK_MAP_CELL_OVERRIDES: Record<number, Partial<protocol.MapCellConfig>> = {
  2: { draw_type: 'event', prob_good: 40, prob_neutral: 30, prob_bad: 30 },
  3: { cell_type: 'fragile' },
  4: { draw_type: 'event', prob_good: 50, prob_neutral: 30, prob_bad: 20 },
  5: { cell_type: 'fog', fog_active: true },
  6: { draw_type: 'item' },
  8: { cell_type: 'checkpoint' },
  9: { draw_type: 'event', prob_good: 30, prob_neutral: 40, prob_bad: 30 },
  10: { cell_type: 'fragile' },
  11: { draw_type: 'buff' },
  12: { cell_type: 'fog', fog_active: true },
  13: { draw_type: 'event', prob_good: 40, prob_neutral: 30, prob_bad: 30 },
  15: { cell_type: 'checkpoint' },
  16: { draw_type: 'item' },
  18: { draw_type: 'event', prob_good: 20, prob_neutral: 30, prob_bad: 50 },
  22: { draw_type: 'event', prob_good: 45, prob_neutral: 30, prob_bad: 25 },
  23: { cell_type: 'fragile' },
  24: { draw_type: 'item' },
  25: { cell_type: 'fog', fog_active: true },
  27: { draw_type: 'buff' },
  28: { cell_type: 'checkpoint' },
  30: { cell_type: 'fragile' },
  31: { draw_type: 'event', prob_good: 30, prob_neutral: 35, prob_bad: 35 },
  33: { cell_type: 'fog', fog_active: true },
  35: { cell_type: 'checkpoint' },
  36: { draw_type: 'item' },
  38: { draw_type: 'event', prob_good: 20, prob_neutral: 30, prob_bad: 50 },
  39: { cell_type: 'boss' },
};

function createMockMapCell(index: number): protocol.MapCellConfig {
  return {
    index,
    cell_type: 'normal',
    is_broken: false,
    event_id: '',
    fog_active: false,
    draw_type: 'none',
    prob_good: 0,
    prob_neutral: 0,
    prob_bad: 0,
    ...MOCK_MAP_CELL_OVERRIDES[index],
  };
}

export const MOCK_MAP_CONFIG: protocol.MapConfig = {
  length: 40,
  start_index: 0,
  end_index: 39,
  cells: Array.from({ length: 40 }, (_, index) => createMockMapCell(index)),
};

// ========== Mock Definitions ==========

export const MOCK_DEFINITIONS: protocol.DefinitionsConfig = {
  events: {
    herb: { type: 'herb', evaluation: 70, category: 'good', english_name: 'Herb', name: '采集到草药', desc: '在路边发现了草药，恢复了体力' },
    lucky_bubble: { type: 'lucky_bubble', evaluation: 80, category: 'good', english_name: 'LuckyBubble', name: '吹出幸运泡泡', desc: '梦幻泡泡飘到你面前，藏着好运' },
    relic: { type: 'relic', evaluation: 90, category: 'good', english_name: 'Relic', name: '捡到勇士的圣遗物', desc: '发现了古老圣遗物，获得一次道具抽奖机会' },
    divine_bless: { type: 'divine_bless', evaluation: 95, category: 'good', english_name: 'DivineBless', name: '受到天使眷顾', desc: '天使的祝福降临，获得神眷Buff' },
    exchange: { type: 'exchange', evaluation: 50, category: 'neutral', english_name: 'Exchange', name: '交换', desc: '命运之手将你与另一位玩家交换位置' },
    hidden_buff: { type: 'hidden_buff', evaluation: 75, category: 'good', english_name: 'HiddenBuff', name: '隐匿', desc: '遁入异次元空间，获得隐匿Buff' },
    taste_test: { type: 'taste_test', evaluation: 50, category: 'neutral', english_name: 'TasteTest', name: '这是什么？尝一口', desc: '发现神秘物质，尝试后获得随机效果' },
    mosquito: { type: 'mosquito', evaluation: 40, category: 'bad', english_name: 'Mosquito', name: '被蚊虫叮咬', desc: '丛林中的"蚊虫"叮咬了你' },
    ghost_hit: { type: 'ghost_hit', evaluation: 40, category: 'bad', english_name: 'GhostHit', name: '偶遇孤魂野鬼', desc: '你被野鬼打了一闷棍' },
    dog_poop: { type: 'dog_poop', evaluation: 35, category: 'bad', english_name: 'DogPoop', name: '踩到了狗屎', desc: '运气糟糕的一天' },
    wind_gust: { type: 'wind_gust', evaluation: 25, category: 'bad', english_name: 'WindGust', name: '一阵风', desc: '一阵狂风卷走了你的道具' },
    skull_gaze: { type: 'skull_gaze', evaluation: 20, category: 'bad', english_name: 'SkullGaze', name: '恶魔之眼', desc: '你注视了恶魔的眼睛，获得诅咒Buff' },
    lost_way: { type: 'lost_way', evaluation: 40, category: 'bad', english_name: 'LostWay', name: '迷途', desc: '迷失方向，获得迷途Buff' },
    thunder: { type: 'thunder', evaluation: 10, category: 'bad', english_name: 'Thunder', name: '雷劫', desc: '天雷降临，HP归零' },
  },
  buffs: {
    divine: { type: 'divine', evaluation: 95, category: 'good', english_name: 'Divine', name: '神眷', desc: '接下来3回合保持LP+1状态', duration: 3, is_positive: true, is_negative: false, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    rain: { type: 'rain', evaluation: 75, category: 'good', english_name: 'Rain', name: '甘霖', desc: '接下来4回合每2回合HP+1', duration: 4, is_positive: true, is_negative: false, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    exorcism: { type: 'exorcism', evaluation: 70, category: 'good', english_name: 'Exorcism', name: '辟邪', desc: '接下来5回合无视毒瘴buff', duration: 5, is_positive: true, is_negative: false, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    fire: { type: 'fire', evaluation: 80, category: 'good', english_name: 'Fire', name: '离火', desc: '朱雀阵营增益，每4回合LP+1', duration: -1, is_positive: true, is_negative: false, is_hidden: false, is_boss: false, is_faction: true, is_draw: false },
    curse: { type: 'curse', evaluation: 20, category: 'bad', english_name: 'Curse', name: '诅咒', desc: '接下来3回合保持LP-1状态', duration: 3, is_positive: false, is_negative: true, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    lost: { type: 'lost', evaluation: 40, category: 'bad', english_name: 'Lost', name: '迷途', desc: '下1回合朝反方向移动', duration: 1, is_positive: false, is_negative: true, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    corrupt: { type: 'corrupt', evaluation: 20, category: 'bad', english_name: 'Corrupt', name: '腐化', desc: '接下来4回合每2回合HP-1', duration: 4, is_positive: false, is_negative: true, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    poison: { type: 'poison', evaluation: 10, category: 'bad', english_name: 'Poison', name: '毒瘴', desc: '接下来3回合每回合受一次恶性随机事件影响', duration: 3, is_positive: false, is_negative: true, is_hidden: false, is_boss: false, is_faction: false, is_draw: false },
    hidden: { type: 'hidden', evaluation: 50, category: 'neutral', english_name: 'Hidden', name: '隐匿', desc: '接下来1回合免疫任意事件、道具的影响', duration: 1, is_positive: false, is_negative: false, is_hidden: true, is_boss: false, is_faction: false, is_draw: false },
    thorns: { type: 'thorns', evaluation: 50, category: 'neutral', english_name: 'Thorns', name: '反刺', desc: '收到伤害后，反伤30%给攻击者', duration: 2, is_positive: false, is_negative: false, is_hidden: false, is_boss: true, is_faction: false, is_draw: false },
    death_mark: { type: 'death_mark', evaluation: 5, category: 'bad', english_name: 'DeathMark', name: '死亡标记', desc: '死亡后阻止后续行动', duration: 1, is_positive: false, is_negative: true, is_hidden: true, is_boss: false, is_faction: false, is_draw: false },
    dominance: { type: 'dominance', evaluation: 95, category: 'good', english_name: 'Dominance', name: '威势', desc: '青龙阵营增益，增益效果翻倍', duration: 1, is_positive: true, is_negative: false, is_hidden: false, is_boss: false, is_faction: true, is_draw: false },
    rob_luck: { type: 'rob_luck', evaluation: 40, category: 'bad', english_name: 'RobLuck', name: '劫运', desc: '白虎阵营增益，抢夺目标好运', duration: 1, is_positive: false, is_negative: true, is_hidden: false, is_boss: false, is_faction: true, is_draw: false },
    suppress: { type: 'suppress', evaluation: 80, category: 'good', english_name: 'Suppress', name: '鎮厄', desc: '玄武阵营增益，1回合免疫恶性事件和负面Buff', duration: 1, is_positive: true, is_negative: false, is_hidden: false, is_boss: false, is_faction: true, is_draw: false },
  },
  items: {
    reverse_clock: { type: 'reverse_clock', evaluation: 75, category: 'good', english_name: 'ReverseClock', name: '反方向的钟', desc: '给予指定玩家迷途Buff' },
    any_door: { type: 'any_door', evaluation: 50, category: 'neutral', english_name: 'AnyDoor', name: '任意门', desc: '前往指定玩家身边' },
    dice_upgrade: { type: 'dice_upgrade', evaluation: 80, category: 'good', english_name: 'DiceUpgrade', name: '骰子升级卡', desc: '将当前骰子升级为更高等级' },
  },
};

// ========== Mock Available ==========

export const MOCK_AVAILABLE: protocol.Available = {
  items: [{ id: 'item-001', type: 'any_door', name: '任意门', targetable: true }],
  can_use_skill: true,
  dice_type: 'copper',
};

// ========== Mock MiniGame ==========

export const MOCK_MINI_GAME_START: protocol.MiniGameStart = {
  game_type: 'count_seconds',
  players: [MOCK_UUID_QINGLONG, MOCK_UUID_ZHUQUE, MOCK_UUID_BAIHU, MOCK_UUID_XUANWU],
};

export const MOCK_MINI_GAME_RESULT: protocol.MiniGameResult = {
  rankings: [
    { player_id: MOCK_UUID_QINGLONG, display_name: '青龙侠', rank: 1 },
    { player_id: MOCK_UUID_XUANWU, display_name: '玄武守', rank: 2 },
    { player_id: MOCK_UUID_ZHUQUE, display_name: '朱雀女', rank: 3 },
    { player_id: MOCK_UUID_BAIHU, display_name: '白虎将', rank: 4 },
  ],
};

// ========== Inject Functions ==========

export function injectGameOver(): void {
  const store = useGameStore.getState();
  store.setPlayers(MOCK_PLAYERS);
  store.setGameOver(MOCK_GAME_OVER);
  store.setDefinitions(MOCK_DEFINITIONS);
  store.setMyPlayerId(MOCK_UUID_QINGLONG);
  store.setGameOverAnimationComplete(false);  // Trigger animation overlay
  store.setPendingScene(null);
  store.setScene(Scene.GameOver);
}

export function injectGameOverSkipAni(): void {
  const store = useGameStore.getState();
  store.setPlayers(MOCK_PLAYERS);
  store.setGameOver(MOCK_GAME_OVER);
  store.setDefinitions(MOCK_DEFINITIONS);
  store.setMyPlayerId(MOCK_UUID_QINGLONG);
  store.setGameOverAnimationComplete(true);  // Skip animation, show final page directly
  store.setPendingScene(null);
  store.setScene(Scene.GameOver);
}

export function injectBoard(): void {
  const store = useGameStore.getState();
  store.setPlayers(MOCK_PLAYERS);
  store.setMapConfig(MOCK_MAP_CONFIG);
  store.setDefinitions(MOCK_DEFINITIONS);
  store.setAvailableActions(MOCK_AVAILABLE);
  store.setMyPlayerId(MOCK_UUID_QINGLONG);
  store.setCurrentPlayerId(MOCK_UUID_QINGLONG);
  store.setRoundTurn(3, 1);
  store.updateGameState('turn_loop', 'main_action');
  store.setPendingScene(null);
  store.setScene(Scene.Board);
}

export function injectMiniGame(): void {
  const store = useGameStore.getState();
  store.setPlayers(MOCK_PLAYERS);
  store.setDefinitions(MOCK_DEFINITIONS);
  store.setMyPlayerId(MOCK_UUID_QINGLONG);
  store.setMiniGameStart(MOCK_MINI_GAME_START);
  store.setMiniGameResult(MOCK_MINI_GAME_RESULT);
  store.setMiniGameOnline(false);
  store.setMiniGameResultPending(true);
  store.setPendingScene(null);
  store.setScene(Scene.MiniGameSubmitRank);
}
