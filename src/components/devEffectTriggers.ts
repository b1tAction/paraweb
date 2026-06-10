import { isBossPlayer } from '../game/bossVisualConfig';
import { dispatchDevBoardFocusCell } from '../game/devBoardEvents';
import { Scene, useGameStore } from '../store/gameStore';
import type { LogEntry, MapConfig, Player } from '../types/protocol';
import { playEventSfx } from '../utils/eventSfx';
import { injectBoard, MOCK_DEFINITIONS, MOCK_MAP_CONFIG, MOCK_PLAYERS } from './devMockData';

export type DevEffectGroup = 'Action' | 'Event' | 'Buff' | 'Item' | 'Skill/Boss' | 'Dice';
export type DevDiceType = 'wood' | 'copper' | 'silver' | 'gold';
export type DevEffectDiceControls = 'roll' | 'upgrade';

export type DevEffectTriggerOptions = {
  preferredTargetPlayerId?: string;
  diceType?: DevDiceType;
  diceSteps?: number;
  fromDice?: DevDiceType;
  toDice?: DevDiceType;
};

export type DevEffectPreset = {
  id: string;
  group: DevEffectGroup;
  label: string;
  description: string;
  requiresBoss?: boolean;
  diceControls?: DevEffectDiceControls;
  build: (context: DevEffectContext) => LogEntry | LogEntry[];
  focus?: 'target' | 'source' | 'boss';
};

type DevEffectContext = {
  targetPlayer: Player;
  sourcePlayer: Player;
  bossPlayer: Player | null;
  mapConfig: MapConfig;
  targetPosition: number;
  nextPosition: number;
  checkpointPosition: number;
  timestamp: string;
  options: DevEffectTriggerOptions;
};

type EnsureBoardOptions = {
  requiresBoss?: boolean;
  preferredTargetPlayerId?: string;
};

const DEV_BOSS_PLAYER_ID = 'dev-boss-beast';

export const DEV_DICE_TYPES: { value: DevDiceType; label: string }[] = [
  { value: 'wood', label: 'Wood' },
  { value: 'copper', label: 'Copper' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
];

export function getNextDevDiceType(diceType: DevDiceType): DevDiceType {
  switch (diceType) {
    case 'wood':
      return 'copper';
    case 'copper':
      return 'silver';
    case 'silver':
      return 'gold';
    case 'gold':
      return 'gold';
    default:
      return 'copper';
  }
}

function normalizeDiceSteps(steps: number | undefined) {
  if (!Number.isFinite(steps)) return Math.floor(Math.random() * 6) + 1;

  return Math.max(1, Math.min(6, Math.round(steps ?? 1)));
}

function getSortedCellIndices(mapConfig: MapConfig) {
  return [...new Set(mapConfig.cells.map((cell) => cell.index).filter(Number.isFinite))].sort(
    (left, right) => left - right,
  );
}

function normalizeCellIndex(index: number, mapConfig: MapConfig) {
  const sortedCellIndices = getSortedCellIndices(mapConfig);
  const roundedIndex = Math.round(index);

  if (sortedCellIndices.length === 0) return Math.max(0, roundedIndex);
  if (roundedIndex <= sortedCellIndices[0]) return sortedCellIndices[0];
  if (roundedIndex >= sortedCellIndices[sortedCellIndices.length - 1]) {
    return sortedCellIndices[sortedCellIndices.length - 1];
  }

  return sortedCellIndices.reduce((closestIndex, candidateIndex) =>
    Math.abs(candidateIndex - roundedIndex) < Math.abs(closestIndex - roundedIndex) ? candidateIndex : closestIndex,
  );
}

function getNextCellIndex(currentIndex: number, mapConfig: MapConfig, stepCount = 3) {
  const sortedCellIndices = getSortedCellIndices(mapConfig);
  if (sortedCellIndices.length === 0) return currentIndex;

  const normalizedIndex = normalizeCellIndex(currentIndex, mapConfig);
  const currentCellPosition = Math.max(0, sortedCellIndices.indexOf(normalizedIndex));
  const nextCellPosition = Math.min(sortedCellIndices.length - 1, currentCellPosition + stepCount);

  return sortedCellIndices[nextCellPosition];
}

function buildLinearPath(startPosition: number, endPosition: number, mapConfig: MapConfig) {
  const sortedCellIndices = getSortedCellIndices(mapConfig);
  const startCellPosition = sortedCellIndices.indexOf(normalizeCellIndex(startPosition, mapConfig));
  const endCellPosition = sortedCellIndices.indexOf(normalizeCellIndex(endPosition, mapConfig));

  if (startCellPosition < 0 || endCellPosition < 0) return [startPosition, endPosition];
  if (startCellPosition <= endCellPosition) return sortedCellIndices.slice(startCellPosition, endCellPosition + 1);

  return sortedCellIndices.slice(endCellPosition, startCellPosition + 1).reverse();
}

function createDevBossPlayer(mapConfig: MapConfig): Player {
  return {
    player_id: DEV_BOSS_PLAYER_ID,
    display_name: 'Dev Boss',
    faction: 'boss',
    position: mapConfig.end_index,
    hp: 30,
    max_hp: 30,
    lp: 0,
    buffs: [],
    items: [],
    charge: 0,
    fire_counter: 0,
    is_dead: false,
    skip_turn: false,
    is_boss: true,
  };
}

function ensureDevBoardState(options: EnsureBoardOptions) {
  let store = useGameStore.getState();

  if (!store.mapConfig || store.players.length === 0) {
    injectBoard();
    store = useGameStore.getState();
  }

  if (!store.mapConfig) {
    store.setMapConfig(MOCK_MAP_CONFIG);
  }
  if (!store.definitions) {
    store.setDefinitions(MOCK_DEFINITIONS);
  }
  if (store.players.length === 0) {
    store.setPlayers(MOCK_PLAYERS);
  }

  store = useGameStore.getState();

  if (options.requiresBoss && !store.players.some(isBossPlayer) && store.mapConfig) {
    store.setPlayers([...store.players, createDevBossPlayer(store.mapConfig)]);
    store = useGameStore.getState();
  }

  if (store.currentScene !== Scene.Board) {
    store.setScene(Scene.Board);
  }

  if (store.globalState !== 'turn_loop' || store.turnState !== 'main_action') {
    store.updateGameState('turn_loop', 'main_action');
  }

  return useGameStore.getState();
}

function getEffectContext(options: EnsureBoardOptions & DevEffectTriggerOptions): DevEffectContext {
  const store = ensureDevBoardState(options);
  const mapConfig = store.mapConfig ?? MOCK_MAP_CONFIG;
  const boardPlayers = store.players.filter((player) => !isBossPlayer(player));
  const targetPlayer =
    boardPlayers.find((player) => player.player_id === options.preferredTargetPlayerId) ??
    boardPlayers.find((player) => player.player_id === store.currentPlayerId) ??
    boardPlayers.find((player) => player.player_id === store.myPlayerId) ??
    boardPlayers[0] ??
    MOCK_PLAYERS[0];
  const sourcePlayer = boardPlayers.find((player) => player.player_id !== targetPlayer.player_id) ?? targetPlayer;
  const bossPlayer = store.players.find(isBossPlayer) ?? null;
  const targetPosition = normalizeCellIndex(targetPlayer.position, mapConfig);
  const nextPosition = getNextCellIndex(targetPosition, mapConfig);

  return {
    targetPlayer,
    sourcePlayer,
    bossPlayer,
    mapConfig,
    targetPosition,
    nextPosition,
    checkpointPosition: mapConfig.start_index,
    timestamp: new Date().toISOString(),
    options,
  };
}

function entry(
  context: DevEffectContext,
  actionType: string,
  metadata: Record<string, unknown>,
  overrides?: Partial<LogEntry>,
): LogEntry {
  return {
    timestamp: context.timestamp,
    type: 'action',
    action_type: actionType,
    target: context.targetPlayer.player_id,
    source: 'dev_tool',
    metadata,
    ...overrides,
  };
}

function bossEntry(
  context: DevEffectContext,
  actionType: string,
  metadata: Record<string, unknown>,
  overrides?: Partial<LogEntry>,
): LogEntry {
  const bossPlayer = context.bossPlayer ?? createDevBossPlayer(context.mapConfig);

  return entry(context, actionType, metadata, {
    type: 'boss',
    source: bossPlayer.player_id,
    ...overrides,
  });
}

function eventPreset(eventType: string, label: string, description: string): DevEffectPreset {
  return {
    id: `event_${eventType}`,
    group: 'Event',
    label,
    description,
    build: (context) => entry(context, 'draw_event', { event_type: eventType }, { source: `Event_${eventType}` }),
  };
}

function addBuffPreset(buffType: string, label: string, description: string): DevEffectPreset {
  return {
    id: `buff_add_${buffType}`,
    group: 'Buff',
    label,
    description,
    build: (context) =>
      entry(context, 'add_buff', { buff_type: buffType, duration: 3 }, { source: `Buff_${buffType}` }),
  };
}

function removeBuffPreset(buffType: string, label: string, description: string): DevEffectPreset {
  return {
    id: `buff_remove_${buffType}`,
    group: 'Buff',
    label,
    description,
    build: (context) => entry(context, 'remove_buff', { buff_type: buffType }, { source: `Buff_${buffType}` }),
  };
}

export const DEV_EFFECT_PRESETS: DevEffectPreset[] = [
  {
    id: 'action_damage',
    group: 'Action',
    label: 'Damage HP -2',
    description: '角色受伤、红色飘字和受击反馈。',
    build: (context) => entry(context, 'damage', { hp_change: -2 }, { source: 'dev_damage' }),
  },
  {
    id: 'action_heal',
    group: 'Action',
    label: 'Heal HP +2',
    description: '治疗光效、绿色飘字。',
    build: (context) => entry(context, 'heal', { hp_change: 2 }, { source: 'dev_heal' }),
  },
  {
    id: 'action_lp_plus',
    group: 'Action',
    label: 'LP +1',
    description: '幸运值增加特效。',
    build: (context) => entry(context, 'modify_lp', { lp_change: 1 }, { source: 'dev_lp_plus' }),
  },
  {
    id: 'action_lp_minus',
    group: 'Action',
    label: 'LP -1',
    description: '幸运值减少特效。',
    build: (context) => entry(context, 'modify_lp', { lp_change: -1 }, { source: 'dev_lp_minus' }),
  },
  {
    id: 'action_move',
    group: 'Action',
    label: 'Move +3 Cells',
    description: '按 path 播放棋盘移动动画。',
    build: (context) =>
      entry(
        context,
        'move',
        {
          steps: Math.max(
            1,
            buildLinearPath(context.targetPosition, context.nextPosition, context.mapConfig).length - 1,
          ),
          start_pos: context.targetPosition,
          end_pos: context.nextPosition,
          path: buildLinearPath(context.targetPosition, context.nextPosition, context.mapConfig),
        },
        { source: 'dev_move' },
      ),
  },
  {
    id: 'action_teleport',
    group: 'Action',
    label: 'Teleport',
    description: '传送/任意门位移动画。',
    build: (context) =>
      entry(
        context,
        'teleport',
        { from_pos: context.targetPosition, to_pos: context.nextPosition },
        { source: 'item_any_door' },
      ),
  },
  {
    id: 'action_death',
    group: 'Action',
    label: 'Death',
    description: '死亡动画和死亡飘字。',
    build: (context) => entry(context, 'death', {}, { source: 'dev_death' }),
  },
  {
    id: 'action_respawn',
    group: 'Action',
    label: 'Respawn',
    description: '复活回起点/检查点动画。',
    build: (context) =>
      entry(context, 'respawn', { checkpoint_pos: context.checkpointPosition }, { source: 'TurnEndRespawn' }),
  },
  eventPreset('herb', 'Event: Herb', '事件弹窗 + 草药治疗特效。'),
  eventPreset('lucky_bubble', 'Event: Lucky Bubble', '事件弹窗 + 泡泡上浮特效。'),
  eventPreset('relic', 'Event: Relic', '事件弹窗 + 宝箱/爆炸/武器飞出。'),
  eventPreset('divine_bless', 'Event: Divine Bless', '事件弹窗 + 天使祝福翅膀。'),
  eventPreset('hidden_buff', 'Event: Hidden Buff', '事件弹窗 + 隐匿分解/恢复。'),
  eventPreset('exchange', 'Event: Exchange', '事件弹窗 + 默认事件脉冲。'),
  eventPreset('taste_test', 'Event: Taste Test', '事件弹窗 + 默认事件脉冲。'),
  eventPreset('mosquito', 'Event: Mosquito', '事件弹窗 + 蚊子攻击。'),
  eventPreset('ghost_hit', 'Event: Ghost Hit', '事件弹窗 + 幽灵攻击。'),
  eventPreset('dog_poop', 'Event: Dog Poop', '事件弹窗 + 伤害色调。'),
  eventPreset('wind_gust', 'Event: Wind Gust', '事件弹窗 + 风吹特效。'),
  eventPreset('skull_gaze', 'Event: Skull Gaze', '事件弹窗 + 骷髅/爆炸。'),
  eventPreset('lost_way', 'Event: Lost Way', '事件弹窗 + 迷途溶解。'),
  eventPreset('thunder', 'Event: Thunder', '事件弹窗 + 雷击。'),
  addBuffPreset('divine', 'Add Buff: Divine', '添加正面 Buff 光环。'),
  addBuffPreset('fire', 'Add Buff: Fire', '添加朱雀离火 Buff。'),
  addBuffPreset('curse', 'Add Buff: Curse', '添加负面诅咒 Buff。'),
  addBuffPreset('lost', 'Add Buff: Lost', '添加迷途 Buff。'),
  addBuffPreset('hidden', 'Add Buff: Hidden', '添加隐匿 Buff。'),
  addBuffPreset('fearless', 'Add Buff: Fearless', '添加无畏 Buff。'),
  addBuffPreset('golden_body', 'Add Buff: Golden Body', '添加金身 Buff。'),
  addBuffPreset('wrath', 'Add Buff: Wrath', '添加嗔怒 Buff。'),
  removeBuffPreset('divine', 'Remove Buff: Divine', '移除正面 Buff 飘字。'),
  removeBuffPreset('curse', 'Remove Buff: Curse', '移除负面 Buff 飘字。'),
  removeBuffPreset('lost', 'Remove Buff: Lost', '移除迷途 Buff 飘字。'),
  {
    id: 'item_draw_any_door',
    group: 'Item',
    label: 'Draw Item: Any Door',
    description: '获得任意门的通用道具特效。',
    build: (context) => entry(context, 'draw_item', { item_type: 'any_door' }, { source: 'dev_draw_item' }),
  },
  {
    id: 'item_use_any_door',
    group: 'Item',
    label: 'Use Item: Any Door',
    description: '任意门使用后的传送动画。',
    build: (context) =>
      entry(
        context,
        'teleport',
        { item_type: 'any_door', from_pos: context.targetPosition, to_pos: context.nextPosition },
        { source: 'item_any_door' },
      ),
  },
  {
    id: 'item_reverse_clock',
    group: 'Item',
    label: 'Use Item: Reverse Clock',
    description: '反方向的钟 Buff 飞行动画 + 迷途 Buff。',
    build: (context) =>
      entry(
        context,
        'add_buff',
        { item_type: 'reverse_clock', buff_type: 'lost', duration: 2 },
        { source: 'item_reverse_clock_buff' },
      ),
  },
  {
    id: 'item_draw_magic_flute',
    group: 'Item',
    label: 'Draw Item: Magic Flute',
    description: '获得魔笛道具特效。',
    build: (context) => entry(context, 'draw_item', { item_type: 'magic_flute' }, { source: 'dev_draw_item' }),
  },
  {
    id: 'item_draw_cupid_arrow',
    group: 'Item',
    label: 'Draw Item: Cupid Arrow',
    description: '获得丘比特之箭道具特效。',
    build: (context) => entry(context, 'draw_item', { item_type: 'cupid_arrow' }, { source: 'dev_draw_item' }),
  },
  {
    id: 'item_use_cupid_arrow',
    group: 'Item',
    label: 'Use Item: Cupid Arrow',
    description: '丘比特之箭使用后的爱心爆发动画 + 永恒Buff。',
    build: (context) =>
      entry(
        context,
        'add_buff',
        { item_type: 'cupid_arrow', buff_type: 'eternal', duration: 2 },
        { source: 'item_cupid_arrow_buff' },
      ),
  },
  {
    id: 'item_draw_crimson_blade',
    group: 'Item',
    label: 'Draw Item: Crimson Blade',
    description: '获得猩红之刃道具特效。',
    build: (context) => entry(context, 'draw_item', { item_type: 'crimson_blade' }, { source: 'dev_draw_item' }),
  },
  {
    id: 'item_draw_wisdom_ring',
    group: 'Item',
    label: 'Draw Item: Wisdom Ring',
    description: '获得智慧玄戒道具特效。',
    build: (context) => entry(context, 'draw_item', { item_type: 'wisdom_ring' }, { source: 'dev_draw_item' }),
  },
  {
    id: 'item_draw_named_blade',
    group: 'Item',
    label: 'Draw Item: Named Blade',
    description: '获得名刀司命道具特效。',
    build: (context) => entry(context, 'draw_item', { item_type: 'named_blade' }, { source: 'dev_draw_item' }),
  },
  {
    id: 'item_dice_upgrade',
    group: 'Item',
    label: 'Use Item: Dice Upgrade',
    description: '骰子升级卡动画。',
    diceControls: 'upgrade',
    build: (context) =>
      entry(
        context,
        'dice_upgrade',
        {
          from_dice: context.options.fromDice ?? 'wood',
          to_dice: context.options.toDice ?? getNextDevDiceType(context.options.fromDice ?? 'wood'),
        },
        { source: 'item_dice_upgrade' },
      ),
  },
  {
    id: 'skill_qing_long',
    group: 'Skill/Boss',
    label: 'Skill: Qing Long',
    description: '青龙技能通用施放提示。',
    build: (context) => entry(context, 'use_skill', { skill_type: 'dominance' }, { source: 'skill_qing_long' }),
  },
  {
    id: 'skill_bai_hu',
    group: 'Skill/Boss',
    label: 'Skill: Bai Hu',
    description: '白虎技能通用施放提示。',
    build: (context) => entry(context, 'use_skill', { skill_type: 'rob_luck' }, { source: 'skill_bai_hu' }),
  },
  {
    id: 'skill_xuan_wu',
    group: 'Skill/Boss',
    label: 'Skill: Xuan Wu',
    description: '玄武技能通用施放提示。',
    build: (context) => entry(context, 'use_skill', { skill_type: 'suppress' }, { source: 'skill_xuan_wu' }),
  },
  {
    id: 'boss_damage_crit',
    group: 'Skill/Boss',
    label: 'Boss Damage Crit',
    description: '玩家攻击 Boss，含 Boss 战溶解和暴击效果。',
    requiresBoss: true,
    focus: 'boss',
    build: (context) =>
      bossEntry(
        context,
        'boss_damage',
        { damage: 6, is_crit: true, boss_remaining_hp: 24 },
        {
          target: context.bossPlayer?.player_id ?? DEV_BOSS_PLAYER_ID,
          source: context.targetPlayer.player_id,
        },
      ),
  },
  {
    id: 'boss_attack',
    group: 'Skill/Boss',
    label: 'Boss Attack',
    description: 'Boss 普攻/连线攻击目标玩家。',
    requiresBoss: true,
    focus: 'boss',
    build: (context) => bossEntry(context, 'boss_attack', { attack_type: 'crit', is_crit: true }),
  },
  {
    id: 'boss_skill_thunder',
    group: 'Skill/Boss',
    label: 'Boss Skill: Thunder',
    description: 'Boss 雷击技能，多目标闪电。',
    requiresBoss: true,
    focus: 'boss',
    build: (context) =>
      bossEntry(context, 'boss_skill', { skill_type: 'thunder', targets: [context.targetPlayer.player_id] }),
  },
  {
    id: 'boss_skill_curse',
    group: 'Skill/Boss',
    label: 'Boss Skill: Curse',
    description: 'Boss 诅咒技能。',
    requiresBoss: true,
    focus: 'boss',
    build: (context) =>
      bossEntry(context, 'boss_skill', { skill_type: 'curse', targets: [context.targetPlayer.player_id] }),
  },
  {
    id: 'boss_skill_rest',
    group: 'Skill/Boss',
    label: 'Boss Skill: Rest',
    description: 'Boss 回复技能。',
    requiresBoss: true,
    focus: 'boss',
    build: (context) => bossEntry(context, 'boss_skill', { skill_type: 'rest', targets: [] }),
  },
  {
    id: 'boss_skill_thorns',
    group: 'Skill/Boss',
    label: 'Boss Skill: Thorns',
    description: 'Boss 反刺护盾技能。',
    requiresBoss: true,
    focus: 'boss',
    build: (context) => bossEntry(context, 'boss_skill', { skill_type: 'thorns', targets: [] }),
  },
  {
    id: 'dice_roll',
    group: 'Dice',
    label: 'Roll Dice',
    description: '骰子旋转 + 点数结果。',
    diceControls: 'roll',
    build: (context) =>
      entry(
        context,
        'dice_roll',
        { dice_type: context.options.diceType ?? 'wood', dice_steps: normalizeDiceSteps(context.options.diceSteps) },
        { source: 'dev_roll_dice' },
      ),
  },
  {
    id: 'dice_upgrade',
    group: 'Dice',
    label: 'Dice Upgrade',
    description: '木骰升级为铜骰的升级动画。',
    diceControls: 'upgrade',
    build: (context) =>
      entry(
        context,
        'dice_upgrade',
        {
          from_dice: context.options.fromDice ?? 'wood',
          to_dice: context.options.toDice ?? getNextDevDiceType(context.options.fromDice ?? 'wood'),
        },
        { source: 'dev_dice_upgrade' },
      ),
  },
];

export function getDevEffectGroups() {
  return [...new Set(DEV_EFFECT_PRESETS.map((preset) => preset.group))];
}

export function triggerDevEffect(presetId: string, optionsOrTargetPlayerId?: string | DevEffectTriggerOptions) {
  const preset = DEV_EFFECT_PRESETS.find((candidate) => candidate.id === presetId) ?? DEV_EFFECT_PRESETS[0];
  const options =
    typeof optionsOrTargetPlayerId === 'string'
      ? { preferredTargetPlayerId: optionsOrTargetPlayerId }
      : (optionsOrTargetPlayerId ?? {});
  const context = getEffectContext({ requiresBoss: preset.requiresBoss, ...options });
  const rawEntries = preset.build(context);
  const entries = (Array.isArray(rawEntries) ? rawEntries : [rawEntries]).map((candidate, index) => ({
    ...candidate,
    timestamp: `${context.timestamp}#dev-${preset.id}-${index}`,
  }));
  const focusPosition =
    preset.focus === 'boss' && context.bossPlayer
      ? context.bossPlayer.position
      : preset.focus === 'source'
        ? context.sourcePlayer.position
        : context.targetPlayer.position;

  // Play event sound effect if this is a draw_event action
  entries.forEach((entry) => {
    if (entry.action_type === 'draw_event' && entry.metadata?.event_type) {
      const eventType = String(entry.metadata.event_type);
      console.log('[DevEffectTriggers] 触发事件音效:', eventType);
      playEventSfx(eventType);
    }
  });

  useGameStore.getState().addPendingEntries(entries);
  dispatchDevBoardFocusCell(focusPosition);

  return entries;
}
